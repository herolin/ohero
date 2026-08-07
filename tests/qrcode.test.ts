/** @vitest-environment jsdom */
//
// The QR encoder.
//
// GOLDEN VECTORS, not "does it look plausible". These two matrices were
// produced by this encoder after it had been checked cell by cell against
// segno and read back by zxing-cpp (see the header of qrcode.ts). Pinning
// them here means any future edit that changes a single module fails loudly,
// which is the only way a QR bug is ever caught early — the alternative is a
// player standing in a room pointing a phone at a screen that will not scan.

import { describe, expect, it } from 'vitest';
import { drawQr, encodeQr } from '../src/ui/qrcode';
import { shareLinkForRoom } from '../src/multiplayer/room';

const ROOM_LINK = 'https://herolin.github.io/ohero/games/g006-towerout/?room=7QX4';

/** 'A' — version 1, the smallest symbol there is. */
const GOLDEN_A = [
  '#######.#..#..#######',
  '#.....#.#####.#.....#',
  '#.###.#...#.#.#.###.#',
  '#.###.#.##.##.#.###.#',
  '#.###.#..###..#.###.#',
  '#.....#..#.##.#.....#',
  '#######.#.#.#.#######',
  '........##.##........',
  '#.##.###..###.#..#.##',
  '.#.##..#.#.####..#...',
  '##..###.##.#.....##.#',
  '#.##.#.....#..#####..',
  '#..####..#..#..#..#..',
  '........#.##..#..#..#',
  '#######.#..##..#.#...',
  '#.....#.##.....##.##.',
  '#.###.#..##.#####...#',
  '#.###.#.####..######.',
  '#.###.#.#.#.#.##.....',
  '#.....#...#..#.#..#.#',
  '#######.#....#..#....',
];

/** A room link of the length this game actually produces — version 4. */
const GOLDEN_LINK = [
  '#######.#.##.##.#####..#..#######',
  '#.....#.#..##.#.#.#..###..#.....#',
  '#.###.#.....##....###...#.#.###.#',
  '#.###.#.##..##.###..#.###.#.###.#',
  '#.###.#..##.#...#######.#.#.###.#',
  '#.....#..#.#.....#.##.#...#.....#',
  '#######.#.#.#.#.#.#.#.#.#.#######',
  '........#..#..#..#.#..###........',
  '#.##.###.##...#.##..##....#..#.##',
  '#.......##......#.####.#..##.##.#',
  '...##.##.#.##.......##########.##',
  '#..##....#####..#..#...##.##.#..#',
  '.#....#...#.....##.#..##...###.#.',
  '#..##..###.##.#.#..###..##.#.#.#.',
  '.#..#.#.#.....#..###.#..#.##.#...',
  '...###.####.#.#.#.#.##...##.###..',
  '#...#.#.####......#.##...##.###..',
  '#.###...#...#..#.#..#.#####.##.##',
  '..###.##.##.#..###...##.#..##.##.',
  '..##.#..#.#.#.#####...#...#.#..#.',
  '#.#...#..#...###.#####...#...##.#',
  '#.###...##.###...####.######.#..#',
  '....#.#..##...#.##...###...##..##',
  '.#.#...##...##....###.####..##.##',
  '#.#.###..###.....#..#.#.#####..##',
  '........#...##.##..#....#...##...',
  '#######.#.#####..########.#.#..#.',
  '#.....#.###.....#....#.##...#####',
  '#.###.#......#.##.##.########.##.',
  '#.###.#.###....###..#.##...#.#..#',
  '#.###.#.###..#####..#.###.##.##..',
  '#.....#..#.###..####..#.#.###...#',
  '#######.#.##...###...#...#..###..',
];

const render = (text: string): string[] =>
  encodeQr(text).modules.map((row) => row.map((on) => (on ? '#' : '.')).join(''));

describe('encodeQr', () => {
  it('reproduces the golden version-1 symbol exactly', () => {
    expect(render('A')).toEqual(GOLDEN_A);
  });

  it('reproduces the golden room-link symbol exactly', () => {
    const qr = encodeQr(ROOM_LINK);
    expect(qr.version).toBe(4);
    expect(qr.size).toBe(33);
    expect(render(ROOM_LINK)).toEqual(GOLDEN_LINK);
  });

  it('sizes the symbol to the payload', () => {
    expect(encodeQr('A').version).toBe(1);
    expect(encodeQr('x'.repeat(30)).version).toBe(3);
    expect(encodeQr('x'.repeat(213)).version).toBe(10);
    // 17 + 4v, every time.
    for (const text of ['A', 'x'.repeat(60), 'x'.repeat(213)]) {
      const qr = encodeQr(text);
      expect(qr.size).toBe(17 + qr.version * 4);
      expect(qr.modules).toHaveLength(qr.size);
      expect(qr.modules[0]).toHaveLength(qr.size);
    }
  });

  it('refuses to encode more than it can carry', () => {
    // Silently truncating would produce a symbol that scans as the wrong text,
    // which is worse than no symbol at all.
    expect(() => encodeQr('x'.repeat(214))).toThrow(/version-10/);
  });

  it('counts UTF-8 bytes, not characters', () => {
    // Three bytes each: a version that fits four characters must not be picked
    // for four CJK ones.
    expect(encodeQr('中文測試').version).toBeGreaterThanOrEqual(encodeQr('abcd').version);
    expect(() => encodeQr('中'.repeat(71))).not.toThrow(); // 213 bytes
    expect(() => encodeQr('中'.repeat(72))).toThrow(); // 216, one over
  });

  it('puts a finder pattern in three corners and not the fourth', () => {
    const m = encodeQr(ROOM_LINK).modules;
    const n = m.length;
    const finder = (x0: number, y0: number): boolean => {
      for (let y = 0; y < 7; y++) {
        for (let x = 0; x < 7; x++) {
          const ring = Math.max(Math.abs(x - 3), Math.abs(y - 3));
          if (m[y0 + y][x0 + x] !== (ring <= 1 || ring === 3)) return false;
        }
      }
      return true;
    };
    expect(finder(0, 0)).toBe(true);
    expect(finder(n - 7, 0)).toBe(true);
    expect(finder(0, n - 7)).toBe(true);
    expect(finder(n - 7, n - 7)).toBe(false);
  });

  it('lays the timing patterns down the sixth row and column', () => {
    const m = encodeQr(ROOM_LINK).modules;
    for (let i = 8; i < m.length - 8; i++) {
      expect(m[6][i]).toBe(i % 2 === 0);
      expect(m[i][6]).toBe(i % 2 === 0);
    }
  });

  it('always sets the module the spec insists is dark', () => {
    const m = encodeQr(ROOM_LINK).modules;
    expect(m[m.length - 8][8]).toBe(true);
  });

  it('encodes the link this game actually shares', () => {
    // shareLinkForRoom is the real source of the payload; if it ever grows
    // past what a version-10 symbol holds, this fails rather than the lobby.
    expect(() => encodeQr(shareLinkForRoom('ABCD'))).not.toThrow();
  });
});

describe('drawQr', () => {
  it('leaves the four-module quiet zone readers need', () => {
    // A QR code drawn edge to edge is the classic way to ship one that no
    // phone will read while looking perfect on screen.
    const canvas = document.createElement('canvas');
    const qr = encodeQr('A');
    drawQr(canvas, qr, { scale: 3, quiet: 4 });
    expect(canvas.width).toBe((qr.size + 8) * 3);
    expect(canvas.height).toBe(canvas.width);
  });

  it('scales the canvas with the symbol', () => {
    const canvas = document.createElement('canvas');
    const qr = encodeQr(ROOM_LINK);
    drawQr(canvas, qr, { scale: 5, quiet: 2 });
    expect(canvas.width).toBe((qr.size + 4) * 5);
  });
});
