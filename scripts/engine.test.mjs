// Audio engine tests with a fake AudioContext and mocked timers. They check
// which voices the engine schedules, when, and the playhead events it emits.
import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";
import { DrumEngine } from "../src/lib/sequencer/engine.ts";
import { sixteenthSeconds, swingOffsetSeconds } from "../src/lib/sequencer/timing.ts";
import {
  defaultMutes,
  defaultPattern,
  defaultVolumes,
  emptyPattern,
  STEP_COUNT,
  stepsOf,
} from "../src/lib/sequencer/types.ts";

const EPS = 1e-9;
const close = (actual, expected, eps = EPS) =>
  assert.ok(Math.abs(actual - expected) < eps, `expected ${expected}, got ${actual}`);

class FakeParam {
  constructor(value = 0) {
    this.value = value;
    this.events = [];
  }
  setValueAtTime(v, t) {
    this.events.push(["set", v, t]);
  }
  exponentialRampToValueAtTime(v, t) {
    this.events.push(["exp", v, t]);
  }
  setTargetAtTime(v, t, c) {
    this.events.push(["target", v, t, c]);
  }
}

class FakeNode {
  connect(node) {
    this.output = node;
    return node;
  }
}

/** Records every source start as { kind, type, freq, time, node }. */
class FakeAudioContext {
  static last = null;
  static startAt = 0;
  constructor() {
    this.currentTime = FakeAudioContext.startAt;
    this.state = "suspended";
    this.sampleRate = 100;
    this.destination = new FakeNode();
    this.starts = [];
    this.closed = false;
    FakeAudioContext.last = this;
  }
  async resume() {
    this.state = "running";
  }
  async close() {
    this.closed = true;
  }
  createBuffer(_channels, length) {
    const data = new Float32Array(length);
    return { length, getChannelData: () => data };
  }
  createDynamicsCompressor() {
    const n = new FakeNode();
    for (const k of ["threshold", "knee", "ratio", "attack", "release"]) n[k] = new FakeParam();
    return n;
  }
  createGain() {
    const n = new FakeNode();
    n.gain = new FakeParam(1);
    return n;
  }
  createBiquadFilter() {
    const n = new FakeNode();
    n.frequency = new FakeParam(350);
    n.Q = new FakeParam(1);
    return n;
  }
  createOscillator() {
    const n = new FakeNode();
    n.type = "sine";
    n.frequency = new FakeParam(440);
    n.start = (time) =>
      this.starts.push({ kind: "osc", type: n.type, freq: n.frequency.value, time, node: n });
    n.stop = () => {};
    return n;
  }
  createBufferSource() {
    const n = new FakeNode();
    n.start = (time) => this.starts.push({ kind: "noise", time, node: n });
    n.stop = () => {};
    return n;
  }
}

globalThis.window = globalThis;
globalThis.AudioContext = FakeAudioContext;

// Voice fingerprints from engine.ts: kick body is the only sine, snare body the
// only triangle, and every hat hit starts a 248 Hz square partial.
const kicks = (ctx) => ctx.starts.filter((s) => s.type === "sine").map((s) => s.time);
const snares = (ctx) => ctx.starts.filter((s) => s.type === "triangle").map((s) => s.time);
const hats = (ctx) =>
  ctx.starts.filter((s) => s.type === "square" && s.freq === 248).map((s) => s.time);

function snapshot(overrides = {}) {
  return {
    banks: { A: defaultPattern(), B: emptyPattern(), C: emptyPattern(), D: emptyPattern() },
    bank: "A",
    chain: [],
    chainEnabled: false,
    bpm: 120,
    swing: 0,
    mutes: defaultMutes(),
    solos: defaultMutes(),
    volumes: defaultVolumes(),
    master: 0.85,
    ...overrides,
  };
}

/** Start an engine and return helpers to advance audio time and timers together. */
async function startEngine(t, overrides) {
  t.mock.timers.enable({ apis: ["setInterval", "setTimeout"] });
  const engine = new DrumEngine(snapshot(overrides));
  const events = [];
  engine.onStep((e) => events.push(e));
  await engine.start();
  const ctx = FakeAudioContext.last;
  const run = (seconds) => {
    for (let i = 0; i < Math.round(seconds / 0.025); i++) {
      ctx.currentTime += 0.025;
      t.mock.timers.tick(25);
    }
  };
  return { engine, ctx, events, run };
}

beforeEach(() => {
  FakeAudioContext.startAt = 0;
});

describe("audio scheduling (mocked AudioContext)", () => {
  test("start() unlocks audio and schedules step 0 40 ms after the current time", async (t) => {
    FakeAudioContext.startAt = 5;
    const { ctx, engine } = await startEngine(t);
    assert.equal(ctx.state, "running");
    assert.equal(engine.isPlaying, true);
    assert.deepEqual(kicks(ctx), [5.04]);
    engine.stop();
  });

  test("a four-on-the-floor kick lands on every beat for two bars at 120 BPM", async (t) => {
    const { ctx, engine, run } = await startEngine(t);
    run(4);
    engine.stop();
    const times = kicks(ctx).filter((x) => x < 0.04 + 4 - EPS);
    assert.equal(times.length, 8);
    times.forEach((time, k) => close(time, 0.04 + k * 0.5));
  });

  test("swing delays odd-step hats by the swing offset and leaves even steps on the grid", async (t) => {
    const all = stepsOf(...Array.from({ length: STEP_COUNT }, (_, i) => i));
    const pattern = { ...emptyPattern(), hats: all };
    const { ctx, engine, run } = await startEngine(t, {
      banks: { A: pattern, B: emptyPattern(), C: emptyPattern(), D: emptyPattern() },
      swing: 50,
    });
    run(2.1);
    engine.stop();
    const times = hats(ctx).slice(0, STEP_COUNT);
    assert.equal(times.length, STEP_COUNT);
    const sixteenth = sixteenthSeconds(120);
    const offset = swingOffsetSeconds(120, 50);
    times.forEach((time, i) => close(time, 0.04 + i * sixteenth + (i % 2 ? offset : 0)));
  });

  test("muted tracks are not scheduled and solo plays only the soloed track", async (t) => {
    const { ctx, engine, run } = await startEngine(t, {
      mutes: { ...defaultMutes(), snare: true },
    });
    run(2);
    assert.equal(snares(ctx).length, 0);
    assert.ok(kicks(ctx).length >= 4);
    engine.update({ mutes: defaultMutes(), solos: { ...defaultMutes(), kick: true } });
    const before = ctx.starts.length;
    run(2);
    engine.stop();
    const later = ctx.starts.slice(before);
    assert.ok(later.length > 0);
    // Only kick voices: the sine body and its 980 Hz square click.
    assert.ok(later.every((s) => s.type === "sine" || (s.type === "square" && s.freq === 980)));
  });

  test("track volume scales the voice envelope peak", async (t) => {
    const { ctx, engine } = await startEngine(t, {
      volumes: { ...defaultVolumes(), kick: 0.5 },
    });
    engine.stop();
    const kick = ctx.starts.find((s) => s.type === "sine");
    const peak = kick.node.output.gain.events.find((e) => e[0] === "exp");
    close(peak[1], 0.95 * 0.5);
    close(peak[2], 0.04 + 0.004);
  });

  test("a tempo change applies from the next step and never moves scheduled notes", async (t) => {
    const { ctx, engine, run } = await startEngine(t);
    run(1);
    const scheduled = kicks(ctx).slice();
    engine.update({ bpm: 60 });
    run(4);
    engine.stop();
    const times = kicks(ctx);
    assert.deepEqual(times.slice(0, scheduled.length), scheduled);
    const tail = times.slice(scheduled.length + 1);
    for (let i = 1; i < tail.length; i++) close(tail[i] - tail[i - 1], 1);
  });

  test("preview plays a muted track immediately at the current time", async (t) => {
    t.mock.timers.enable({ apis: ["setInterval", "setTimeout"] });
    FakeAudioContext.startAt = 2;
    const engine = new DrumEngine(snapshot({ mutes: { ...defaultMutes(), kick: true } }));
    engine.preview("kick");
    await new Promise((r) => setImmediate(r));
    assert.deepEqual(kicks(FakeAudioContext.last), [2]);
    assert.equal(engine.isPlaying, false);
    engine.dispose();
  });

  test("dispose() stops playback and closes the AudioContext", async (t) => {
    const { ctx, engine } = await startEngine(t);
    engine.dispose();
    assert.equal(engine.isPlaying, false);
    assert.equal(ctx.closed, true);
    assert.equal(engine.audioContext, null);
  });
});

describe("playhead at the loop boundaries", () => {
  test("the playhead runs 0..15 and wraps straight back to 0", async (t) => {
    const { engine, events, run } = await startEngine(t);
    run(2.3);
    engine.stop();
    const steps = events.map((e) => e.step).filter((s) => s >= 0);
    assert.ok(steps.length > STEP_COUNT + 1, `only ${steps.length} steps`);
    steps.forEach((s, i) => assert.equal(s, i % STEP_COUNT));
  });

  test("each step event fires when its step sounds, not when it is scheduled", async (t) => {
    const { events, run, engine } = await startEngine(t);
    assert.equal(events.length, 0, "step 0 is scheduled 40 ms ahead");
    run(0.025);
    assert.equal(events.length, 0);
    run(0.025);
    assert.deepEqual(
      events.map((e) => e.step),
      [0],
    );
    engine.stop();
  });

  test("stop() moves the playhead to -1 and drops pending step events", async (t) => {
    const { engine, ctx, events, run } = await startEngine(t);
    run(0.5);
    engine.stop();
    assert.deepEqual(events.at(-1), { step: -1, bank: "A", chainPosition: -1 });
    const count = events.length;
    const starts = ctx.starts.length;
    run(1);
    assert.equal(events.length, count);
    assert.equal(ctx.starts.length, starts);
  });

  test("a chain advances one entry per bar at the step 15 to 0 boundary and loops", async (t) => {
    const banks = {
      A: emptyPattern(),
      B: { ...emptyPattern(), kick: stepsOf(0) },
      C: emptyPattern(),
      D: { ...emptyPattern(), snare: stepsOf(0) },
    };
    const { engine, ctx, events, run } = await startEngine(t, {
      banks,
      chain: ["B", "D"],
      chainEnabled: true,
    });
    run(6.1);
    engine.stop();
    const downbeats = events.filter((e) => e.step === 0).slice(0, 3);
    assert.deepEqual(downbeats, [
      { step: 0, bank: "B", chainPosition: 0 },
      { step: 0, bank: "D", chainPosition: 1 },
      { step: 0, bank: "B", chainPosition: 0 },
    ]);
    const last = events.filter((e) => e.step === STEP_COUNT - 1)[0];
    assert.deepEqual(last, { step: 15, bank: "B", chainPosition: 0 });
    close(kicks(ctx)[0], 0.04);
    close(snares(ctx)[0], 0.04 + 2);
    close(kicks(ctx)[1], 0.04 + 4);
  });

  test("enabling a chain mid-bar finishes the bar on the selected bank", async (t) => {
    const { engine, events, run } = await startEngine(t);
    run(0.5);
    engine.update({ chain: ["C"], chainEnabled: true });
    run(2);
    engine.stop();
    const bar0 = events.filter((e) => e.step >= 0).slice(0, STEP_COUNT);
    assert.ok(bar0.every((e) => e.bank === "A"));
    assert.ok(bar0.slice(-4).every((e) => e.chainPosition === -1));
    const nextDownbeat = events.filter((e) => e.step === 0)[1];
    assert.deepEqual(nextDownbeat, { step: 0, bank: "C", chainPosition: 0 });
  });
});
