import { bankForBar, clampChainPosition, nextChainPosition } from "./chain";
import { effectiveGain } from "./mix";
import { advanceClock, type ClockState, startClock } from "./timing";
import type { MuteMap, Pattern, PatternBank, TrackId, VolumeMap } from "./types";
import { STEP_COUNT, TRACK_IDS } from "./types";

const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD = 0.12;

export type EngineSnapshot = {
  banks: Record<PatternBank, Pattern>;
  /** Bank selected in the UI. Plays when chaining is off. */
  bank: PatternBank;
  chain: PatternBank[];
  chainEnabled: boolean;
  bpm: number;
  swing: number;
  mutes: MuteMap;
  solos: MuteMap;
  volumes: VolumeMap;
  master: number;
};

/** Where playback is: step -1 means stopped. chainPosition is -1 when not chaining. */
export type StepEvent = { step: number; bank: PatternBank; chainPosition: number };

type StepListener = (event: StepEvent) => void;

function makeNoiseBuffer(ctx: AudioContext): AudioBuffer {
  const length = ctx.sampleRate * 1.2;
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

function envGain(
  ctx: AudioContext,
  dest: AudioNode,
  time: number,
  peak: number,
  attack: number,
  decay: number,
): GainNode {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, time);
  g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0001), time + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, time + attack + decay);
  g.connect(dest);
  return g;
}

export class DrumEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private noise: AudioBuffer | null = null;
  private timer: number | null = null;
  private clock: ClockState = startClock(0);
  private chainPosition = 0;
  private playing = false;
  private snapshot: EngineSnapshot;
  private listeners = new Set<StepListener>();
  private uiTimers = new Set<number>();

  constructor(initial: EngineSnapshot) {
    this.snapshot = initial;
  }

  update(partial: Partial<EngineSnapshot>) {
    const wasChaining = this.chaining();
    this.snapshot = { ...this.snapshot, ...partial };
    if (this.chaining() && !wasChaining) {
      // Mid-bar: finish this bar on the selected bank, start the chain next bar.
      this.chainPosition = this.playing ? -1 : 0;
    } else if (this.chainPosition >= 0) {
      this.chainPosition = clampChainPosition(this.chainPosition, this.snapshot.chain.length);
    }
    if (this.master && partial.master !== undefined) {
      this.master.gain.setTargetAtTime(partial.master, this.now(), 0.02);
    }
  }

  onStep(fn: StepListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  get audioContext(): AudioContext | null {
    return this.ctx;
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  async unlock(): Promise<void> {
    if (!this.ctx) {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      this.ctx = new Ctx();
      this.noise = makeNoiseBuffer(this.ctx);
      this.compressor = this.ctx.createDynamicsCompressor();
      this.compressor.threshold.value = -14;
      this.compressor.knee.value = 18;
      this.compressor.ratio.value = 4;
      this.compressor.attack.value = 0.003;
      this.compressor.release.value = 0.12;
      this.master = this.ctx.createGain();
      this.master.gain.value = this.snapshot.master;
      this.compressor.connect(this.master);
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") await this.ctx.resume();
  }

  async start(): Promise<void> {
    await this.unlock();
    if (!this.ctx || this.playing) return;
    this.playing = true;
    this.clock = startClock(this.ctx.currentTime + 0.04);
    this.chainPosition = 0;
    this.timer = window.setInterval(() => this.scheduler(), LOOKAHEAD_MS);
    this.scheduler();
  }

  stop(): void {
    this.playing = false;
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
    for (const id of this.uiTimers) window.clearTimeout(id);
    this.uiTimers.clear();
    this.clock = startClock(0);
    this.chainPosition = 0;
    this.emit({ step: -1, bank: this.snapshot.bank, chainPosition: -1 });
  }

  toggle(): Promise<void> {
    return this.playing ? (this.stop(), Promise.resolve()) : this.start();
  }

  preview(track: TrackId): void {
    void this.unlock().then(() => {
      if (!this.ctx) return;
      this.voice(track, this.ctx.currentTime);
    });
  }

  dispose(): void {
    this.stop();
    void this.ctx?.close();
    this.ctx = null;
    this.master = null;
    this.compressor = null;
  }

  private now(): number {
    return this.ctx?.currentTime ?? 0;
  }

  private chaining(): boolean {
    return this.snapshot.chainEnabled && this.snapshot.chain.length > 0;
  }

  private scheduler(): void {
    if (!this.ctx || !this.playing) return;
    while (this.clock.time < this.ctx.currentTime + SCHEDULE_AHEAD) {
      this.schedule(this.clock.step, this.clock.time);
      this.clock = advanceClock(this.clock, this.snapshot.bpm, this.snapshot.swing, STEP_COUNT);
      if (this.clock.step === 0 && this.chaining()) {
        this.chainPosition = nextChainPosition(this.chainPosition, this.snapshot.chain.length);
      }
    }
  }

  private schedule(step: number, time: number): void {
    const { banks, bank, chain } = this.snapshot;
    const chaining = this.chaining();
    const playingBank = bankForBar(chain, chaining, this.chainPosition, bank);
    const pattern = banks[playingBank];
    for (const id of TRACK_IDS) {
      if (!pattern[id][step]) continue;
      const gain = this.trackGain(id);
      if (gain <= 0) continue;
      this.voice(id, time, gain);
    }
    const event: StepEvent = {
      step,
      bank: playingBank,
      chainPosition: chaining ? this.chainPosition : -1,
    };
    const delay = Math.max(0, (time - this.now()) * 1000);
    const timer = window.setTimeout(() => {
      this.uiTimers.delete(timer);
      if (this.playing) this.emit(event);
    }, delay);
    this.uiTimers.add(timer);
  }

  private emit(event: StepEvent): void {
    for (const fn of this.listeners) fn(event);
  }

  private dest(): AudioNode {
    return this.compressor ?? this.ctx!.destination;
  }

  /** Volume after mute and solo. */
  private trackGain(id: TrackId): number {
    const { volumes, mutes, solos } = this.snapshot;
    return effectiveGain(id, volumes, mutes, solos);
  }

  /** Previews ignore mute and solo so a silent track can still be auditioned. */
  private voice(id: TrackId, time: number, gain = this.snapshot.volumes[id]): void {
    const v = gain;
    if (id === "kick") this.kick(time, v);
    else if (id === "snare") this.snare(time, v);
    else if (id === "hats") this.hats(time, v);
    else this.perc(time, v);
  }

  private kick(time: number, vol: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(168, time);
    osc.frequency.exponentialRampToValueAtTime(48, time + 0.055);
    osc.frequency.exponentialRampToValueAtTime(34, time + 0.22);
    const g = envGain(ctx, this.dest(), time, 0.95 * vol, 0.004, 0.38);
    osc.connect(g);
    osc.start(time);
    osc.stop(time + 0.45);

    const click = ctx.createOscillator();
    click.type = "square";
    click.frequency.value = 980;
    const cg = envGain(ctx, this.dest(), time, 0.09 * vol, 0.001, 0.018);
    click.connect(cg);
    click.start(time);
    click.stop(time + 0.03);
  }

  private snare(time: number, vol: number): void {
    const ctx = this.ctx!;
    const body = ctx.createOscillator();
    body.type = "triangle";
    body.frequency.setValueAtTime(196, time);
    body.frequency.exponentialRampToValueAtTime(140, time + 0.08);
    const bg = envGain(ctx, this.dest(), time, 0.38 * vol, 0.002, 0.14);
    body.connect(bg);
    body.start(time);
    body.stop(time + 0.2);

    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1850;
    bp.Q.value = 0.9;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 620;
    const ng = envGain(ctx, this.dest(), time, 0.55 * vol, 0.001, 0.16);
    src.connect(hp);
    hp.connect(bp);
    bp.connect(ng);
    src.start(time);
    src.stop(time + 0.22);
  }

  private hats(time: number, vol: number): void {
    const ctx = this.ctx!;
    const freqs = [248, 306, 412, 523, 687, 981, 1612];
    const mix = ctx.createGain();
    mix.gain.value = 0.08 * vol;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 6800;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 9200;
    bp.Q.value = 0.7;
    const g = envGain(ctx, this.dest(), time, 1, 0.001, 0.048);
    mix.connect(hp);
    hp.connect(bp);
    bp.connect(g);
    for (const f of freqs) {
      const o = ctx.createOscillator();
      o.type = "square";
      o.frequency.value = f;
      o.connect(mix);
      o.start(time);
      o.stop(time + 0.07);
    }
  }

  private perc(time: number, vol: number): void {
    const ctx = this.ctx!;
    const bursts = [0, 0.011, 0.022, 0.038];
    bursts.forEach((offset, i) => {
      const t = time + offset;
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = i === bursts.length - 1 ? 980 : 1400;
      bp.Q.value = 1.1;
      const peak = (0.42 - i * 0.07) * vol;
      const decay = i === bursts.length - 1 ? 0.22 : 0.035;
      const g = envGain(ctx, this.dest(), t, peak, 0.001, decay);
      src.connect(bp);
      bp.connect(g);
      src.start(t);
      src.stop(t + decay + 0.04);
    });
  }
}
