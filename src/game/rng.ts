// Deterministic, seedable pseudo-random number generator.
//
// IMPORTANT: all mine placement must go through this module so that two
// players using the same seed produce an identical board. Never use
// Math.random() inside game logic (see CLAUDE.md conventions).

export interface Rng {
  /** Next float in [0, 1). */
  next(): number;
  /** Next integer in [0, maxExclusive). */
  int(maxExclusive: number): number;
}

/** xmur3 string hash — turns a seed string into a 32-bit integer. */
function xmur3(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  h ^= h >>> 16;
  return h >>> 0;
}

/** mulberry32 — small, fast, well-distributed 32-bit PRNG. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Create a deterministic RNG from a string or numeric seed. */
export function createRng(seed: string | number): Rng {
  const seedNum = typeof seed === 'number' ? seed >>> 0 : xmur3(seed);
  const rand = mulberry32(seedNum);
  return {
    next: () => rand(),
    int: (maxExclusive: number) => Math.floor(rand() * maxExclusive),
  };
}

/**
 * Generate a fresh random seed string (for creating a new game/room).
 * This is the ONLY place non-determinism is allowed — the produced seed is
 * then shared so both players stay in sync.
 */
export function randomSeed(): string {
  return Math.random().toString(36).slice(2, 10);
}
