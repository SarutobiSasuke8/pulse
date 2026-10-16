/**
 * Pure pattern edits used by the sequencer store. Each returns a new banks
 * object and never mutates its input, so React and zustand see the change.
 *
 * Imports use explicit `.ts` extensions so `node --test` can load this module.
 */
import type { Pattern, PatternBank, TrackId } from "./types.ts";
import { clonePattern, emptyPattern } from "./types.ts";

export type Banks = Record<PatternBank, Pattern>;

/** Flip one step of one track in `bank`. */
export function toggleStepIn(banks: Banks, bank: PatternBank, track: TrackId, step: number): Banks {
  const next = clonePattern(banks[bank]);
  next[track][step] = !next[track][step];
  return { ...banks, [bank]: next };
}

/** Set one step on or off. Returns `banks` itself when nothing changes. */
export function setStepIn(
  banks: Banks,
  bank: PatternBank,
  track: TrackId,
  step: number,
  on: boolean,
): Banks {
  if (banks[bank][track][step] === on) return banks;
  const next = clonePattern(banks[bank]);
  next[track][step] = on;
  return { ...banks, [bank]: next };
}

/** Empty every track of `bank`; other banks are left as they are. */
export function clearBankIn(banks: Banks, bank: PatternBank): Banks {
  return { ...banks, [bank]: emptyPattern() };
}
