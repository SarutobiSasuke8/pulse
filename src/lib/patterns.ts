import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import type { Pattern } from "@/lib/sequencer/types";
import { STEP_COUNT, TRACK_IDS } from "@/lib/sequencer/types";

export type SavedPattern = {
  id: string;
  name: string;
  bpm: number;
  swing: number;
  tracks: Pattern;
  createdAt: string;
};

type PatternRow = {
  id: string;
  name: string;
  bpm: number;
  swing: number;
  tracks: string;
  created_at: string;
};

function parseTracks(raw: string): Pattern | null {
  try {
    const data = JSON.parse(raw) as Partial<Pattern>;
    const tracks = {} as Pattern;
    for (const id of TRACK_IDS) {
      const row = data[id];
      if (!Array.isArray(row) || row.length !== STEP_COUNT) return null;
      tracks[id] = row.map(Boolean);
    }
    return tracks;
  } catch {
    return null;
  }
}

function toSaved(row: PatternRow): SavedPattern | null {
  const tracks = parseTracks(row.tracks);
  if (!tracks) return null;
  return {
    id: row.id,
    name: row.name,
    bpm: Number(row.bpm),
    swing: Number(row.swing),
    tracks,
    createdAt: row.created_at,
  };
}

export const listPatterns = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const rows = await sql<PatternRow>`
      select id, name, bpm, swing, tracks, created_at
      from patterns
      where user_id = ${context.userId}
      order by created_at desc
    `;
    return rows.map(toSaved).filter((p): p is SavedPattern => p !== null);
  });

export const savePattern = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { name: string; bpm: number; swing: number; tracks: Pattern }) => {
    const name = input.name.trim().slice(0, 40);
    if (!name) throw new Error("Name required");
    const bpm = Math.min(200, Math.max(40, Math.round(input.bpm)));
    const swing = Math.min(100, Math.max(0, Math.round(input.swing)));
    const tracks = parseTracks(JSON.stringify(input.tracks));
    if (!tracks) throw new Error("Invalid pattern");
    return { name, bpm, swing, tracks };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const existing = await sql<{ n: number }>`
      select count(*)::int as n from patterns where user_id = ${context.userId}
    `;
    if ((existing[0]?.n ?? 0) >= 24) {
      throw new Error("Pattern library is full (24)");
    }
    const id = crypto.randomUUID();
    await sql`
      insert into patterns (id, user_id, name, bpm, swing, tracks)
      values (${id}, ${context.userId}, ${data.name}, ${data.bpm}, ${data.swing}, ${JSON.stringify(data.tracks)})
    `;
    return { id };
  });

export const deletePattern = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((id: string) => {
    if (!id) throw new Error("Missing id");
    return id;
  })
  .handler(async ({ context, data: id }) => {
    const sql = await getSql();
    await sql`delete from patterns where id = ${id} and user_id = ${context.userId}`;
  });
