/**
 * The saved and exported shape of a PULSE session: every bank, the chain,
 * tempo, swing and the mixer. Used for localStorage saves and JSON files.
 *
 * Imports use explicit `.ts` extensions so `node --test` can load this module.
 */
import { MAX_CHAIN_LENGTH } from "./chain.ts";
import { clampBpm, clampSwing } from "./timing.ts";
import type { MuteMap, Pattern, PatternBank, VolumeMap } from "./types.ts";
import {
  BANKS,
  defaultMutes,
  defaultVolumes,
  emptyPattern,
  STEP_COUNT,
  TRACK_IDS,
} from "./types.ts";

export const PATTERN_SET_FORMAT = "pulse.pattern-set";
export const PATTERN_SET_VERSION = 1;

export type PatternSet = {
  bpm: number;
  swing: number;
  banks: Record<PatternBank, Pattern>;
  chain: PatternBank[];
  chainEnabled: boolean;
  volumes: VolumeMap;
  mutes: MuteMap;
  solos: MuteMap;
};

export type PatternSetFile = PatternSet & {
  format: typeof PATTERN_SET_FORMAT;
  version: typeof PATTERN_SET_VERSION;
  name: string;
  exportedAt: string;
};

type Loose = Record<string, unknown>;

function isObject(value: unknown): value is Loose {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBank(value: unknown): value is PatternBank {
  return typeof value === "string" && (BANKS as string[]).includes(value);
}

/** Coerce one bank to exactly STEP_COUNT booleans per track, or null if unusable. */
export function normalisePattern(raw: unknown): Pattern | null {
  if (!isObject(raw)) return null;
  const next = emptyPattern();
  for (const id of TRACK_IDS) {
    const row = raw[id];
    if (row === undefined) continue;
    if (!Array.isArray(row)) return null;
    next[id] = Array.from({ length: STEP_COUNT }, (_, i) => Boolean(row[i]));
  }
  return next;
}

function normaliseFlags(raw: unknown): MuteMap {
  const out = defaultMutes();
  if (!isObject(raw)) return out;
  for (const id of TRACK_IDS) out[id] = raw[id] === true;
  return out;
}

function normaliseVolumes(raw: unknown): VolumeMap {
  const out = defaultVolumes();
  if (!isObject(raw)) return out;
  for (const id of TRACK_IDS) {
    const v = raw[id];
    if (typeof v === "number" && Number.isFinite(v)) out[id] = Math.min(1, Math.max(0, v));
  }
  return out;
}

export function normaliseChain(raw: unknown): PatternBank[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isBank).slice(0, MAX_CHAIN_LENGTH);
}

/**
 * Lenient: fills anything missing or invalid with defaults. Banks that are
 * missing use `fallbackBanks` (empty patterns unless given).
 */
export function normalisePatternSet(
  raw: unknown,
  fallbackBanks?: Record<PatternBank, Pattern>,
): PatternSet {
  const src = isObject(raw) ? raw : {};
  const rawBanks = isObject(src.banks) ? src.banks : {};
  const banks = {} as Record<PatternBank, Pattern>;
  for (const b of BANKS) {
    banks[b] = normalisePattern(rawBanks[b]) ?? fallbackBanks?.[b] ?? emptyPattern();
  }
  return {
    bpm: typeof src.bpm === "number" ? clampBpm(src.bpm) : 124,
    swing: typeof src.swing === "number" ? clampSwing(src.swing) : 0,
    banks,
    chain: normaliseChain(src.chain),
    chainEnabled: src.chainEnabled === true,
    volumes: normaliseVolumes(src.volumes),
    mutes: normaliseFlags(src.mutes),
    solos: normaliseFlags(src.solos),
  };
}

export function toPatternSetFile(set: PatternSet, name: string, now = new Date()): PatternSetFile {
  return {
    format: PATTERN_SET_FORMAT,
    version: PATTERN_SET_VERSION,
    name: name.trim().slice(0, 40) || "Untitled",
    exportedAt: now.toISOString(),
    ...normalisePatternSet(set),
  };
}

/**
 * Strict entry point for imported JSON files. Throws with a readable message
 * when the file is not a PULSE pattern set.
 */
export function parsePatternSetFile(input: unknown): { name: string; set: PatternSet } {
  let data = input;
  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch {
      throw new Error("File is not valid JSON");
    }
  }
  if (!isObject(data) || data.format !== PATTERN_SET_FORMAT) {
    throw new Error("Not a PULSE pattern file");
  }
  if (data.version !== PATTERN_SET_VERSION) {
    throw new Error(`Unsupported pattern file version: ${String(data.version)}`);
  }
  if (!isObject(data.banks)) throw new Error("Pattern file has no banks");
  for (const b of BANKS) {
    if (data.banks[b] !== undefined && normalisePattern(data.banks[b]) === null) {
      throw new Error(`Bank ${b} is not a valid pattern`);
    }
  }
  const name = typeof data.name === "string" && data.name.trim() ? data.name.trim().slice(0, 40) : "Imported";
  return { name, set: normalisePatternSet(data) };
}

/** File name for a download, e.g. "pulse-friday-groove.json". */
export function patternFileName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `pulse-${slug || "patterns"}.json`;
}
