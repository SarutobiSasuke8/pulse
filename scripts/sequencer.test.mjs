// Sequencer logic tests. Node 22 strips TypeScript types, so these import the
// app's own .ts modules directly (they only use erasable syntax).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  advanceClock,
  barSeconds,
  clampBpm,
  sixteenthSeconds,
  startClock,
  stepDurationSeconds,
  swingOffsetSeconds,
  SWING_RATIO,
} from "../src/lib/sequencer/timing.ts";
import { bankForBar, clampChainPosition, nextChainPosition } from "../src/lib/sequencer/chain.ts";
import { anySolo, effectiveGain, isAudible } from "../src/lib/sequencer/mix.ts";
import {
  normalisePatternSet,
  parsePatternSetFile,
  patternFileName,
  toPatternSetFile,
} from "../src/lib/sequencer/pattern-set.ts";
import {
  deleteFromLocalLibrary,
  LOCAL_LIBRARY_KEY,
  LOCAL_LIBRARY_LIMIT,
  readLocalLibrary,
  saveToLocalLibrary,
} from "../src/lib/sequencer/local-library.ts";
import { defaultPattern, emptyPattern, STEP_COUNT } from "../src/lib/sequencer/types.ts";

const EPS = 1e-9;

function close(actual, expected, eps = EPS) {
  assert.ok(Math.abs(actual - expected) < eps, `expected ${expected}, got ${actual}`);
}

/** Times at which `count` steps are scheduled, with tempo/swing chosen per step. */
function schedule(count, tempoAt, start = 0) {
  let clock = startClock(start);
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push(clock);
    const { bpm, swing } = tempoAt(i);
    clock = advanceClock(clock, bpm, swing, STEP_COUNT);
  }
  return out;
}

describe("timing: tempo", () => {
  test("a sixteenth at 120 BPM is 125 ms", () => {
    close(sixteenthSeconds(120), 0.125);
  });

  test("without swing every step is the same length", () => {
    const times = schedule(17, () => ({ bpm: 120, swing: 0 }));
    for (let i = 1; i < times.length; i++) close(times[i].time - times[i - 1].time, 0.125);
    close(times[16].time, 2);
  });

  test("tempo is clamped to 40-200 BPM", () => {
    assert.equal(clampBpm(10), 40);
    assert.equal(clampBpm(999), 200);
    assert.equal(clampBpm(Number.NaN), 40);
    close(sixteenthSeconds(10), sixteenthSeconds(40));
  });

  test("a tempo change applies from the next step and does not move scheduled steps", () => {
    const steady = schedule(8, () => ({ bpm: 120, swing: 0 }));
    const changed = schedule(8, (i) => ({ bpm: i < 4 ? 120 : 60, swing: 0 }));
    for (let i = 0; i <= 4; i++) close(changed[i].time, steady[i].time);
    for (let i = 5; i < 8; i++) close(changed[i].time - changed[i - 1].time, 0.25);
  });

  test("a tempo change keeps the swing feel at the new tempo", () => {
    const times = schedule(9, (i) => ({ bpm: i < 4 ? 120 : 90, swing: 60 }));
    const evenGap = times[5].time - times[4].time;
    const oddGap = times[6].time - times[5].time;
    close(evenGap, stepDurationSeconds(0, 90, 60));
    close(oddGap, stepDurationSeconds(1, 90, 60));
    close(evenGap + oddGap, 2 * sixteenthSeconds(90));
  });

  test("a gradual tempo ramp keeps step times strictly increasing", () => {
    const times = schedule(64, (i) => ({ bpm: 40 + i * 2.5, swing: 100 }));
    for (let i = 1; i < times.length; i++) assert.ok(times[i].time > times[i - 1].time);
  });

  test("no drift: 1000 bars land on 1000 bar lengths", () => {
    let clock = startClock(0);
    for (let i = 0; i < 1000 * STEP_COUNT; i++) clock = advanceClock(clock, 124, 37, STEP_COUNT);
    assert.equal(clock.bar, 1000);
    assert.equal(clock.step, 0);
    close(clock.time, 1000 * barSeconds(124, STEP_COUNT), 1e-6);
  });
});

describe("timing: swing", () => {
  test("swing lengthens even steps and shortens odd steps by the same amount", () => {
    const offset = swingOffsetSeconds(120, 50);
    close(offset, 0.5 * 0.125 * SWING_RATIO);
    close(stepDurationSeconds(0, 120, 50), 0.125 + offset);
    close(stepDurationSeconds(1, 120, 50), 0.125 - offset);
  });

  test("each pair of steps lasts two sixteenths at any swing", () => {
    for (const swing of [0, 1, 12, 50, 99, 100]) {
      for (let step = 0; step < STEP_COUNT; step += 2) {
        close(
          stepDurationSeconds(step, 124, swing) + stepDurationSeconds(step + 1, 124, swing),
          2 * sixteenthSeconds(124),
        );
      }
    }
  });

  test("bar length does not depend on swing", () => {
    for (const swing of [0, 25, 100]) {
      const times = schedule(STEP_COUNT + 1, () => ({ bpm: 100, swing }));
      close(times[STEP_COUNT].time, barSeconds(100, STEP_COUNT));
    }
  });

  test("off-beats are delayed and on-beats stay on the grid", () => {
    const straight = schedule(STEP_COUNT, () => ({ bpm: 120, swing: 0 }));
    const swung = schedule(STEP_COUNT, () => ({ bpm: 120, swing: 70 }));
    for (let i = 0; i < STEP_COUNT; i++) {
      if (i % 2 === 0) close(swung[i].time, straight[i].time);
      else assert.ok(swung[i].time > straight[i].time);
    }
  });

  test("full swing still leaves a positive gap before the next on-beat", () => {
    const gap = stepDurationSeconds(1, 200, 100);
    assert.ok(gap > 0);
    close(gap, sixteenthSeconds(200) * (1 - SWING_RATIO));
  });

  test("swing is clamped to 0-100%", () => {
    close(swingOffsetSeconds(120, 150), swingOffsetSeconds(120, 100));
    close(swingOffsetSeconds(120, -20), 0);
  });

  test("changing swing mid-bar keeps on-beats on the grid", () => {
    const times = schedule(STEP_COUNT + 1, (i) => ({ bpm: 120, swing: i < 8 ? 0 : 80 }));
    for (let i = 0; i <= STEP_COUNT; i += 2) close(times[i].time, i * 0.125);
  });

  test("the bar counter advances when the step wraps", () => {
    const times = schedule(STEP_COUNT * 2 + 1, () => ({ bpm: 120, swing: 30 }));
    assert.equal(times[STEP_COUNT - 1].bar, 0);
    assert.equal(times[STEP_COUNT].step, 0);
    assert.equal(times[STEP_COUNT].bar, 1);
    assert.equal(times[STEP_COUNT * 2].bar, 2);
  });
});

describe("pattern chaining", () => {
  test("positions wrap around the chain", () => {
    assert.deepEqual(
      [0, 1, 2, 3].map((p) => nextChainPosition(p, 4)),
      [1, 2, 3, 0],
    );
    assert.equal(nextChainPosition(-1, 3), 0);
    assert.equal(nextChainPosition(5, 0), 0);
  });

  test("positions are clamped after the chain is edited", () => {
    assert.equal(clampChainPosition(3, 2), 0);
    assert.equal(clampChainPosition(1, 2), 1);
    assert.equal(clampChainPosition(0, 0), 0);
  });

  test("the selected bank plays when chaining is off, empty or not started", () => {
    assert.equal(bankForBar(["B", "C"], false, 1, "A"), "A");
    assert.equal(bankForBar([], true, 0, "A"), "A");
    assert.equal(bankForBar(["B", "C"], true, -1, "A"), "A");
    assert.equal(bankForBar(["B", "C"], true, 1, "A"), "C");
  });

  test("a chain plays one bar per entry, in order, looping", () => {
    const chain = ["A", "B", "B", "D"];
    let clock = startClock(0);
    let position = 0;
    const bars = [bankForBar(chain, true, position, "C")];
    for (let i = 0; i < STEP_COUNT * 5; i++) {
      clock = advanceClock(clock, 128, 20, STEP_COUNT);
      if (clock.step === 0) {
        position = nextChainPosition(position, chain.length);
        bars.push(bankForBar(chain, true, position, "C"));
      }
    }
    assert.deepEqual(bars, ["A", "B", "B", "D", "A", "B"]);
  });
});

describe("mute and solo", () => {
  const none = { kick: false, snare: false, hats: false, perc: false };
  const volumes = { kick: 0.9, snare: 0.5, hats: 1.4, perc: 0.7 };

  test("all tracks play with nothing muted or soloed", () => {
    assert.equal(anySolo(none), false);
    for (const t of ["kick", "snare", "hats", "perc"]) assert.ok(isAudible(t, none, none));
  });

  test("mute silences a track", () => {
    const mutes = { ...none, snare: true };
    assert.equal(isAudible("snare", mutes, none), false);
    assert.equal(isAudible("kick", mutes, none), true);
    assert.equal(effectiveGain("snare", volumes, mutes, none), 0);
  });

  test("solo plays only the soloed tracks", () => {
    const solos = { ...none, kick: true, hats: true };
    assert.deepEqual(
      ["kick", "snare", "hats", "perc"].map((t) => isAudible(t, none, solos)),
      [true, false, true, false],
    );
  });

  test("mute wins over solo", () => {
    const solos = { ...none, kick: true };
    const mutes = { ...none, kick: true };
    assert.equal(isAudible("kick", mutes, solos), false);
    assert.equal(isAudible("snare", mutes, solos), false);
  });

  test("track volume is applied and clamped to 0-1", () => {
    close(effectiveGain("kick", volumes, none, none), 0.9);
    close(effectiveGain("hats", volumes, none, none), 1);
  });
});

describe("pattern files (JSON export and import)", () => {
  const set = normalisePatternSet({
    bpm: 132,
    swing: 18,
    banks: { A: defaultPattern(), B: emptyPattern(), C: defaultPattern(), D: emptyPattern() },
    chain: ["A", "A", "C"],
    chainEnabled: true,
    volumes: { kick: 0.8, snare: 0.6, hats: 0.3, perc: 0.5 },
    mutes: { kick: false, snare: true, hats: false, perc: false },
    solos: { kick: false, snare: false, hats: true, perc: false },
  });

  test("export then import round-trips the whole session", () => {
    const file = toPatternSetFile(set, "Friday groove", new Date("2026-10-15T12:00:00Z"));
    const parsed = parsePatternSetFile(JSON.stringify(file));
    assert.equal(parsed.name, "Friday groove");
    assert.deepEqual(parsed.set, set);
    assert.equal(file.format, "pulse.pattern-set");
    assert.equal(file.version, 1);
  });

  test("import rejects files that are not PULSE pattern sets", () => {
    assert.throws(() => parsePatternSetFile("{nope"), /not valid JSON/);
    assert.throws(() => parsePatternSetFile({ format: "other" }), /Not a PULSE pattern file/);
    assert.throws(
      () => parsePatternSetFile({ format: "pulse.pattern-set", version: 9, banks: {} }),
      /Unsupported/,
    );
    assert.throws(
      () => parsePatternSetFile({ format: "pulse.pattern-set", version: 1, banks: { A: { kick: "x" } } }),
      /Bank A/,
    );
  });

  test("import repairs short rows, bad banks in the chain and out-of-range values", () => {
    const { set: fixed } = parsePatternSetFile({
      format: "pulse.pattern-set",
      version: 1,
      bpm: 900,
      swing: -5,
      banks: { A: { kick: [true, false, true] } },
      chain: ["A", "Z", "B", ...Array(30).fill("C")],
      volumes: { kick: 7, snare: "loud" },
    });
    assert.equal(fixed.bpm, 200);
    assert.equal(fixed.swing, 0);
    assert.equal(fixed.banks.A.kick.length, STEP_COUNT);
    assert.deepEqual(fixed.banks.A.kick.slice(0, 4), [true, false, true, false]);
    assert.deepEqual(fixed.banks.B, emptyPattern());
    assert.equal(fixed.chain.length, 16);
    assert.deepEqual(fixed.chain.slice(0, 3), ["A", "B", "C"]);
    assert.equal(fixed.volumes.kick, 1);
    assert.equal(fixed.volumes.snare, 0.75);
  });

  test("download names are safe slugs", () => {
    assert.equal(patternFileName("Friday Groove #2!"), "pulse-friday-groove-2.json");
    assert.equal(patternFileName("   "), "pulse-patterns.json");
  });
});

describe("local library (localStorage)", () => {
  function memoryStorage() {
    const map = new Map();
    return {
      getItem: (k) => (map.has(k) ? map.get(k) : null),
      setItem: (k, v) => map.set(k, String(v)),
      map,
    };
  }
  const set = normalisePatternSet({ bpm: 110, banks: { A: defaultPattern() } });

  test("saves, reloads from storage and deletes", () => {
    const storage = memoryStorage();
    saveToLocalLibrary("One", set, storage);
    saveToLocalLibrary("Two", { ...set, bpm: 150 }, storage);
    const reloaded = readLocalLibrary(storage);
    assert.deepEqual(
      reloaded.map((e) => [e.name, e.set.bpm]),
      [
        ["Two", 150],
        ["One", 110],
      ],
    );
    assert.deepEqual(reloaded[1].set.banks.A, defaultPattern());
    const after = deleteFromLocalLibrary(reloaded[0].id, storage);
    assert.deepEqual(
      after.map((e) => e.name),
      ["One"],
    );
    assert.equal(readLocalLibrary(storage).length, 1);
  });

  test("saving an existing name replaces it and keeps its id", () => {
    const storage = memoryStorage();
    const [first] = saveToLocalLibrary("Groove", set, storage);
    const entries = saveToLocalLibrary("groove", { ...set, bpm: 90 }, storage);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].id, first.id);
    assert.equal(entries[0].set.bpm, 90);
  });

  test("the library is capped", () => {
    const storage = memoryStorage();
    for (let i = 0; i < LOCAL_LIBRARY_LIMIT; i++) saveToLocalLibrary(`P${i}`, set, storage);
    assert.throws(() => saveToLocalLibrary("One more", set, storage), /full/);
    assert.doesNotThrow(() => saveToLocalLibrary("P3", set, storage));
  });

  test("corrupt or missing storage reads as empty", () => {
    const storage = memoryStorage();
    storage.map.set(LOCAL_LIBRARY_KEY, "{broken");
    assert.deepEqual(readLocalLibrary(storage), []);
    assert.deepEqual(readLocalLibrary(null), []);
    assert.throws(() => saveToLocalLibrary("x", set, null), /not available/);
    assert.throws(() => saveToLocalLibrary("   ", set, memoryStorage()), /Name required/);
  });
});
