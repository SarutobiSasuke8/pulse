/**
 * Pattern chaining: an ordered list of banks played one bar each, looping.
 * Kept free of value imports so `node --test` can load it directly.
 */

export const MAX_CHAIN_LENGTH = 16;

/** Position after `position` in a chain of `length`, wrapping to the start. */
export function nextChainPosition(position: number, length: number): number {
  if (length <= 0) return 0;
  if (position < 0 || position >= length - 1) return 0;
  return position + 1;
}

/** Keep a position valid after the chain was edited. */
export function clampChainPosition(position: number, length: number): number {
  if (length <= 0 || position < 0 || position >= length) return 0;
  return position;
}

/**
 * Bank to play for a bar. With chaining on and a non-empty chain this is the
 * chain entry at `position`; otherwise it is the selected bank. A negative
 * position means "chain starts at the next bar", so the selected bank plays.
 */
export function bankForBar<B>(
  chain: readonly B[],
  enabled: boolean,
  position: number,
  selected: B,
): B {
  if (!enabled || chain.length === 0 || position < 0) return selected;
  return chain[clampChainPosition(position, chain.length)] ?? selected;
}
