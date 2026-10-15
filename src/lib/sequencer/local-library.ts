/**
 * Named pattern sets saved in this browser's localStorage. No account needed.
 * Storage is injected so the logic can be tested without a browser.
 */
import { normalisePatternSet, type PatternSet } from "./pattern-set.ts";

export const LOCAL_LIBRARY_KEY = "pulse.library";
export const LOCAL_LIBRARY_LIMIT = 24;

export type LocalEntry = {
  id: string;
  name: string;
  savedAt: string;
  set: PatternSet;
};

export type KeyValueStorage = Pick<Storage, "getItem" | "setItem">;

/** localStorage, or null when it is missing or blocked (private mode, SSR). */
export function browserStorage(): KeyValueStorage | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

function newId(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function readLocalLibrary(storage: KeyValueStorage | null = browserStorage()): LocalEntry[] {
  if (!storage) return [];
  let raw: string | null;
  try {
    raw = storage.getItem(LOCAL_LIBRARY_KEY);
  } catch {
    return [];
  }
  if (!raw) return [];
  try {
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    const out: LocalEntry[] = [];
    for (const item of data) {
      if (typeof item !== "object" || item === null) continue;
      const e = item as Record<string, unknown>;
      if (typeof e.id !== "string" || typeof e.name !== "string") continue;
      out.push({
        id: e.id,
        name: e.name,
        savedAt: typeof e.savedAt === "string" ? e.savedAt : "",
        set: normalisePatternSet(e.set),
      });
    }
    return out;
  } catch {
    return [];
  }
}

function write(storage: KeyValueStorage, entries: LocalEntry[]): void {
  try {
    storage.setItem(LOCAL_LIBRARY_KEY, JSON.stringify(entries));
  } catch {
    throw new Error("Could not write to browser storage");
  }
}

/**
 * Save `set` under `name`. A save with an existing name replaces that entry
 * and moves it to the top. Throws when the library is full or storage fails.
 */
export function saveToLocalLibrary(
  name: string,
  set: PatternSet,
  storage: KeyValueStorage | null = browserStorage(),
  now = new Date(),
): LocalEntry[] {
  if (!storage) throw new Error("Browser storage is not available");
  const clean = name.trim().slice(0, 40);
  if (!clean) throw new Error("Name required");
  const entries = readLocalLibrary(storage);
  const existing = entries.find((e) => e.name.toLowerCase() === clean.toLowerCase());
  const rest = entries.filter((e) => e !== existing);
  if (!existing && rest.length >= LOCAL_LIBRARY_LIMIT) {
    throw new Error(`Library is full (${LOCAL_LIBRARY_LIMIT})`);
  }
  const entry: LocalEntry = {
    id: existing?.id ?? newId(),
    name: clean,
    savedAt: now.toISOString(),
    set: normalisePatternSet(set),
  };
  const next = [entry, ...rest];
  write(storage, next);
  return next;
}

export function deleteFromLocalLibrary(
  id: string,
  storage: KeyValueStorage | null = browserStorage(),
): LocalEntry[] {
  if (!storage) return [];
  const next = readLocalLibrary(storage).filter((e) => e.id !== id);
  write(storage, next);
  return next;
}
