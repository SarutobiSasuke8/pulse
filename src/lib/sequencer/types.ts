export const STEP_COUNT = 16;

export const TRACK_IDS = ["kick", "snare", "hats", "perc"] as const;

export type TrackId = (typeof TRACK_IDS)[number];

export type Pattern = Record<TrackId, boolean[]>;

export type MuteMap = Record<TrackId, boolean>;

export type VolumeMap = Record<TrackId, number>;

export type PatternBank = "A" | "B" | "C" | "D";

export const BANKS: PatternBank[] = ["A", "B", "C", "D"];

export const TRACK_META: Record<
  TrackId,
  { label: string; short: string; hint: string }
> = {
  kick: { label: "Kick", short: "KICK", hint: "Low punch" },
  snare: { label: "Snare", short: "SNAR", hint: "Backbeat" },
  hats: { label: "Hats", short: "HATS", hint: "Closed metal" },
  perc: { label: "Perc", short: "PERC", hint: "Clap / slap" },
};

export function emptyTrack(): boolean[] {
  return Array.from({ length: STEP_COUNT }, () => false);
}

export function emptyPattern(): Pattern {
  return {
    kick: emptyTrack(),
    snare: emptyTrack(),
    hats: emptyTrack(),
    perc: emptyTrack(),
  };
}

export function clonePattern(pattern: Pattern): Pattern {
  return {
    kick: [...pattern.kick],
    snare: [...pattern.snare],
    hats: [...pattern.hats],
    perc: [...pattern.perc],
  };
}

/** A ready-to-play house groove so Play is immediately musical. */
export function defaultPattern(): Pattern {
  return {
    kick: stepsOf(0, 4, 8, 12),
    snare: stepsOf(4, 12),
    hats: stepsOf(0, 2, 4, 6, 8, 10, 12, 14),
    perc: stepsOf(3, 11),
  };
}

export function stepsOf(...indices: number[]): boolean[] {
  const row = emptyTrack();
  for (const i of indices) {
    if (i >= 0 && i < STEP_COUNT) row[i] = true;
  }
  return row;
}

export function defaultVolumes(): VolumeMap {
  return { kick: 0.9, snare: 0.75, hats: 0.45, perc: 0.7 };
}

export function defaultMutes(): MuteMap {
  return { kick: false, snare: false, hats: false, perc: false };
}

export function isDownbeat(step: number): boolean {
  return step % 4 === 0;
}
