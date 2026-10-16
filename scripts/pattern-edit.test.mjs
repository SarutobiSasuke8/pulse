// Pattern editing tests: step toggling, setting and clearing a bank.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { clearBankIn, setStepIn, toggleStepIn } from "../src/lib/sequencer/pattern-edit.ts";
import {
  BANKS,
  defaultPattern,
  emptyPattern,
  STEP_COUNT,
  TRACK_IDS,
} from "../src/lib/sequencer/types.ts";

function banks() {
  return { A: defaultPattern(), B: defaultPattern(), C: emptyPattern(), D: emptyPattern() };
}

describe("pattern editing", () => {
  test("toggling a step flips only that cell in the selected bank", () => {
    const before = banks();
    const after = toggleStepIn(before, "A", "snare", 2);
    assert.equal(after.A.snare[2], true);
    const expected = defaultPattern();
    expected.snare[2] = true;
    assert.deepEqual(after.A, expected);
    assert.deepEqual(after.B, defaultPattern());
    assert.equal(after.B, before.B, "untouched banks keep their identity");
  });

  test("toggling never mutates the previous state", () => {
    const before = banks();
    toggleStepIn(before, "A", "kick", 0);
    assert.deepEqual(before.A, defaultPattern());
  });

  test("toggling the same step twice restores the pattern", () => {
    const before = banks();
    const twice = toggleStepIn(toggleStepIn(before, "A", "hats", 15), "A", "hats", 15);
    assert.deepEqual(twice.A, before.A);
  });

  test("first and last steps toggle like any other", () => {
    let b = banks();
    b = toggleStepIn(b, "C", "perc", 0);
    b = toggleStepIn(b, "C", "perc", STEP_COUNT - 1);
    assert.deepEqual(
      b.C.perc.map((on, i) => (on ? i : -1)).filter((i) => i >= 0),
      [0, STEP_COUNT - 1],
    );
    assert.equal(b.C.perc.length, STEP_COUNT);
  });

  test("setting a step to its current value is a no-op that keeps the reference", () => {
    const before = banks();
    assert.equal(setStepIn(before, "A", "kick", 0, true), before);
    assert.equal(setStepIn(before, "A", "kick", 1, false), before);
    const after = setStepIn(before, "A", "kick", 1, true);
    assert.notEqual(after, before);
    assert.equal(after.A.kick[1], true);
    assert.equal(before.A.kick[1], false);
  });

  test("clearing empties every track of the selected bank only", () => {
    const before = banks();
    const after = clearBankIn(before, "A");
    for (const id of TRACK_IDS) assert.ok(after.A[id].every((on) => on === false));
    assert.equal(after.A.kick.length, STEP_COUNT);
    assert.deepEqual(after.B, defaultPattern());
    assert.deepEqual(before.A, defaultPattern(), "previous state is not mutated");
    assert.deepEqual(Object.keys(after).sort(), [...BANKS].sort());
  });
});
