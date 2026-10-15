/**
 * Pure timing maths for the step sequencer.
 *
 * This module has no value imports so `node --test` can load it directly
 * (Node 22 strips the types). The audio engine uses it for scheduling.
 */

/** Share of a sixteenth that full swing (100%) moves the off-beat by. */
export const SWING_RATIO = 0.58;

export const MIN_BPM = 40;
export const MAX_BPM = 200;

export type ClockState = {
  /** Step that will be scheduled next (0-based). */
  step: number;
  /** Audio-clock time, in seconds, at which `step` plays. */
  time: number;
  /** Number of completed bars since the clock started. */
  bar: number;
};

export function clampBpm(bpm: number): number {
  if (!Number.isFinite(bpm)) return MIN_BPM;
  return Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(bpm)));
}

export function clampSwing(swing: number): number {
  if (!Number.isFinite(swing)) return 0;
  return Math.min(100, Math.max(0, Math.round(swing)));
}

/** Length of one sixteenth note, in seconds. */
export function sixteenthSeconds(bpm: number): number {
  return 60 / clampBpm(bpm) / 4;
}

/** How far swing delays each off-beat sixteenth, in seconds. */
export function swingOffsetSeconds(bpm: number, swing: number): number {
  return (clampSwing(swing) / 100) * sixteenthSeconds(bpm) * SWING_RATIO;
}

/**
 * Gap between `step` and the step after it. Even steps are lengthened and odd
 * steps shortened by the same amount, so each pair still lasts two sixteenths
 * and the bar length does not depend on swing.
 */
export function stepDurationSeconds(step: number, bpm: number, swing: number): number {
  const sixteenth = sixteenthSeconds(bpm);
  const offset = swingOffsetSeconds(bpm, swing);
  return step % 2 === 0 ? sixteenth + offset : sixteenth - offset;
}

/** Length of a whole bar of `stepCount` steps (swing does not change it). */
export function barSeconds(bpm: number, stepCount: number): number {
  return sixteenthSeconds(bpm) * stepCount;
}

export function startClock(time: number): ClockState {
  return { step: 0, time, bar: 0 };
}

/**
 * Move the clock on by one step. The tempo and swing passed in apply to the
 * gap after the current step, so a tempo change takes effect from the next
 * scheduled step and never moves notes that were already scheduled.
 */
export function advanceClock(
  state: ClockState,
  bpm: number,
  swing: number,
  stepCount: number,
): ClockState {
  const time = state.time + stepDurationSeconds(state.step, bpm, swing);
  const step = (state.step + 1) % stepCount;
  return { step, time, bar: step === 0 ? state.bar + 1 : state.bar };
}
