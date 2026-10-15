/**
 * Mute and solo rules, kept free of value imports so `node --test` can load
 * this module directly.
 *
 * Rules: while any track is soloed, only soloed tracks play. Mute always wins,
 * so a track that is both soloed and muted stays silent.
 */

export type Flags<K extends string = string> = Record<K, boolean>;

export function anySolo<K extends string>(solos: Flags<K>): boolean {
  return Object.values<boolean>(solos).some(Boolean);
}

export function isAudible<K extends string>(track: K, mutes: Flags<K>, solos: Flags<K>): boolean {
  if (mutes[track]) return false;
  return anySolo(solos) ? Boolean(solos[track]) : true;
}

/** Track gain after mute and solo: the track volume, or 0 when silent. */
export function effectiveGain<K extends string>(
  track: K,
  volumes: Record<K, number>,
  mutes: Flags<K>,
  solos: Flags<K>,
): number {
  if (!isAudible(track, mutes, solos)) return 0;
  const v = volumes[track];
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;
}
