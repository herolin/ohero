import { describe, it, expect } from 'vitest';
import { createRng } from '../src/game/rng';

describe('createRng', () => {
  it('produces the same sequence for the same seed', () => {
    const a = createRng('seed-123');
    const b = createRng('seed-123');
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('produces different sequences for different seeds', () => {
    const a = createRng('seed-A');
    const b = createRng('seed-B');
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).not.toEqual(seqB);
  });

  it('numeric and matching behaviour is deterministic too', () => {
    const a = createRng(42);
    const b = createRng(42);
    expect(a.next()).toBe(b.next());
  });

  it('next() stays within [0, 1)', () => {
    const rng = createRng('range');
    for (let i = 0; i < 1000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('int() stays within [0, maxExclusive)', () => {
    const rng = createRng('int');
    for (let i = 0; i < 1000; i++) {
      const v = rng.int(10);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(10);
      expect(Number.isInteger(v)).toBe(true);
    }
  });
});
