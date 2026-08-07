// A QR code, from scratch.
//
// WHY NOT A LIBRARY. Everything in this project is drawn or synthesised at
// runtime and the only runtime dependency is PeerJS. A QR encoder is a few
// hundred lines of well-specified arithmetic with no upstream to trust, no
// bundle cost worth arguing about, and no chance of a supply-chain surprise in
// a game that will sit unattended on a static host for years.
//
// SCOPE, deliberately narrow: byte mode, error correction level M, versions 1
// to 10 — up to 213 data bytes, where the room link is about sixty. Anything
// longer throws rather than silently producing a code nobody can scan.
//
// Level M (~15% recovery) rather than L: this gets photographed off a phone
// screen at an angle, in a room, by another phone.
//
// HOW THIS WAS VERIFIED, because "it looks like a QR code" is not verification
// and a wrong one looks exactly right:
//   * matrices compared cell by cell against `segno`, a mature Python encoder,
//     across every version in range. Two differences turned up, and the one
//     that was mine was format bit 8 landing on the timing pattern at (6,8)
//     instead of (7,8) — a single module, invisible to the eye.
//   * 270 random payloads, versions 1 to 10, ASCII through emoji, rendered and
//     read back with `zxing-cpp`. All 270 decoded to the exact input.
// Neither tool is a dependency; both were used at the bench. The golden
// vectors in tests/qrcode.test.ts are what keep this honest from here on.
//
// One deliberate difference from segno: masks are scored AFTER the format
// information is written, which is the literal reading of §7.8.3 — what is
// scored is the finished symbol. Segno scores before. Both produce valid
// symbols; they just disagree about which mask is prettiest on some inputs.

/** Data codewords, EC codewords per block, and the block layout, level M. */
interface VersionSpec {
  /** Total data codewords across all blocks. */
  data: number;
  /** EC codewords in every block. */
  ec: number;
  /** [count, dataCodewordsEach] for the short blocks, then the long ones. */
  blocks: [number, number][];
}

const SPECS: Record<number, VersionSpec> = {
  1: { data: 16, ec: 10, blocks: [[1, 16]] },
  2: { data: 28, ec: 16, blocks: [[1, 28]] },
  3: { data: 44, ec: 26, blocks: [[1, 44]] },
  4: { data: 64, ec: 18, blocks: [[2, 32]] },
  5: { data: 86, ec: 24, blocks: [[2, 43]] },
  6: { data: 108, ec: 16, blocks: [[4, 27]] },
  7: { data: 124, ec: 18, blocks: [[4, 31]] },
  8: { data: 154, ec: 22, blocks: [[2, 38], [2, 39]] },
  9: { data: 182, ec: 22, blocks: [[3, 36], [2, 37]] },
  10: { data: 216, ec: 26, blocks: [[4, 43], [1, 44]] },
};

/** Centres of the alignment patterns, by version. */
const ALIGN: Record<number, number[]> = {
  1: [],
  2: [6, 18],
  3: [6, 22],
  4: [6, 26],
  5: [6, 30],
  6: [6, 34],
  7: [6, 22, 38],
  8: [6, 24, 42],
  9: [6, 26, 46],
  10: [6, 28, 50],
};

// ---- GF(256) ----
//
// The Reed-Solomon field, primitive polynomial 0x11D. Built once at module
// load; the tables are 256 bytes each.

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
}

function mul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return EXP[LOG[a] + LOG[b]];
}

/** The generator polynomial for `degree` error correction codewords. */
function generator(degree: number): Uint8Array {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < degree; i++) {
    const next = new Uint8Array(poly.length + 1);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= mul(poly[j], EXP[i]);
    }
    poly = next;
  }
  return poly;
}

/** Polynomial division remainder — the EC codewords for one block. */
function ecCodewords(data: Uint8Array, count: number): Uint8Array {
  const gen = generator(count);
  const rem = new Uint8Array(count);
  for (const byte of data) {
    const factor = byte ^ rem[0];
    rem.copyWithin(0, 1);
    rem[count - 1] = 0;
    if (factor !== 0) {
      for (let i = 0; i < count; i++) rem[i] ^= mul(gen[i + 1], factor);
    }
  }
  return rem;
}

// ---- Bit stream ----

class Bits {
  readonly bits: number[] = [];

  push(value: number, length: number): void {
    for (let i = length - 1; i >= 0; i--) this.bits.push((value >>> i) & 1);
  }

  get length(): number {
    return this.bits.length;
  }
}

/** UTF-8 bytes. QR byte mode is nominally Latin-1; every reader does UTF-8. */
function toBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function pickVersion(byteLength: number): number {
  for (let v = 1; v <= 10; v++) {
    const spec = SPECS[v];
    const countBits = v < 10 ? 8 : 16;
    // 4 mode bits + the character count + the data itself.
    if (4 + countBits + byteLength * 8 <= spec.data * 8) return v;
  }
  throw new Error(`Too long for a version-10 QR code: ${byteLength} bytes`);
}

/** Mode indicator, length, payload, terminator, padding — one flat byte array. */
function encodeData(bytes: Uint8Array, version: number): Uint8Array {
  const spec = SPECS[version];
  const capacity = spec.data * 8;
  const bits = new Bits();

  bits.push(0b0100, 4); // byte mode
  bits.push(bytes.length, version < 10 ? 8 : 16);
  for (const b of bytes) bits.push(b, 8);

  // Terminator: up to four zero bits, fewer if the stream is nearly full.
  bits.push(0, Math.min(4, capacity - bits.length));
  while (bits.length % 8 !== 0) bits.push(0, 1);

  const out = new Uint8Array(spec.data);
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bits.bits[i + j];
    out[i / 8] = byte;
  }
  // The specified pad bytes, alternating, for whatever room is left.
  for (let i = bits.length / 8, k = 0; i < spec.data; i++, k++) {
    out[i] = k % 2 === 0 ? 0xec : 0x11;
  }
  return out;
}

/**
 * Split into blocks, add error correction, interleave.
 *
 * The interleaving is what makes a QR code survive a thumb over one corner:
 * consecutive codewords end up far apart in the symbol, so localised damage is
 * spread thinly across every block instead of destroying one outright.
 */
function buildCodewords(data: Uint8Array, version: number): Uint8Array {
  const spec = SPECS[version];
  const dataBlocks: Uint8Array[] = [];
  const ecBlocks: Uint8Array[] = [];

  let offset = 0;
  for (const [count, size] of spec.blocks) {
    for (let i = 0; i < count; i++) {
      const block = data.subarray(offset, offset + size);
      offset += size;
      dataBlocks.push(block);
      ecBlocks.push(ecCodewords(block, spec.ec));
    }
  }

  const out: number[] = [];
  const longest = Math.max(...dataBlocks.map((b) => b.length));
  for (let i = 0; i < longest; i++) {
    for (const block of dataBlocks) if (i < block.length) out.push(block[i]);
  }
  for (let i = 0; i < spec.ec; i++) {
    for (const block of ecBlocks) out.push(block[i]);
  }
  return new Uint8Array(out);
}

// ---- The symbol ----

/** -1 unset, 0 light, 1 dark. `reserved` marks function patterns. */
interface Canvas {
  size: number;
  cells: Int8Array;
  reserved: Uint8Array;
}

function makeCanvas(size: number): Canvas {
  return { size, cells: new Int8Array(size * size).fill(-1), reserved: new Uint8Array(size * size) };
}

function set(c: Canvas, x: number, y: number, dark: boolean, reserve = true): void {
  c.cells[y * c.size + x] = dark ? 1 : 0;
  if (reserve) c.reserved[y * c.size + x] = 1;
}

function isReserved(c: Canvas, x: number, y: number): boolean {
  return c.reserved[y * c.size + x] === 1;
}

function drawFinder(c: Canvas, x0: number, y0: number): void {
  for (let dy = -1; dy <= 7; dy++) {
    for (let dx = -1; dx <= 7; dx++) {
      const x = x0 + dx;
      const y = y0 + dy;
      if (x < 0 || y < 0 || x >= c.size || y >= c.size) continue;
      // Rings out from the centre: 0-1 the dark core, 2 light, 3 the dark
      // border, 4 the separator that must stay light.
      const ring = Math.max(Math.abs(dx - 3), Math.abs(dy - 3));
      set(c, x, y, ring <= 1 || ring === 3);
    }
  }
}

function drawAlignment(c: Canvas, cx: number, cy: number): void {
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const ring = Math.max(Math.abs(dx), Math.abs(dy));
      set(c, cx + dx, cy + dy, ring !== 1);
    }
  }
}

function drawFunctionPatterns(c: Canvas, version: number): void {
  const n = c.size;
  drawFinder(c, 0, 0);
  drawFinder(c, n - 7, 0);
  drawFinder(c, 0, n - 7);

  // Timing patterns, the alternating lines that let a reader find the grid.
  for (let i = 8; i < n - 8; i++) {
    set(c, i, 6, i % 2 === 0);
    set(c, 6, i, i % 2 === 0);
  }

  const centres = ALIGN[version];
  for (const cy of centres) {
    for (const cx of centres) {
      // Not where the finders already are.
      const nearFinder =
        (cx <= 8 && cy <= 8) || (cx <= 8 && cy >= n - 9) || (cx >= n - 9 && cy <= 8);
      if (!nearFinder) drawAlignment(c, cx, cy);
    }
  }

  // The one module that is always dark, for reasons the spec does not give.
  set(c, 8, n - 8, true);

  // Reserve the format areas; the real bits go in after masking.
  for (let i = 0; i < 9; i++) {
    if (!isReserved(c, i, 8)) set(c, i, 8, false);
    if (!isReserved(c, 8, i)) set(c, 8, i, false);
  }
  for (let i = 0; i < 8; i++) {
    if (!isReserved(c, n - 1 - i, 8)) set(c, n - 1 - i, 8, false);
    if (!isReserved(c, 8, n - 1 - i)) set(c, 8, n - 1 - i, false);
  }

  if (version >= 7) {
    const bits = versionBits(version);
    for (let i = 0; i < 18; i++) {
      const dark = ((bits >> i) & 1) === 1;
      const a = Math.floor(i / 3);
      const b = i % 3;
      set(c, a, n - 11 + b, dark);
      set(c, n - 11 + b, a, dark);
    }
  }
}

/** 18-bit version information: 6 data bits plus a BCH(18,6) remainder. */
function versionBits(version: number): number {
  let rem = version;
  for (let i = 0; i < 12; i++) {
    rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  }
  return ((version << 12) | rem) >>> 0;
}

/** 15-bit format information for level M and a given mask. */
function formatBits(mask: number): number {
  const data = (0b00 << 3) | mask; // 00 = level M
  let rem = data;
  for (let i = 0; i < 10; i++) {
    rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  }
  return (((data << 10) | rem) ^ 0x5412) >>> 0;
}

function drawFormat(c: Canvas, mask: number): void {
  const n = c.size;
  const bits = formatBits(mask);
  for (let i = 0; i < 15; i++) {
    const dark = ((bits >> i) & 1) === 1;

    // Copy one, wrapping the top-left finder. Row and column 6 are the timing
    // patterns, which is why the runs jump over them.
    if (i < 6) set(c, 8, i, dark);
    else if (i === 6) set(c, 8, 7, dark);
    else if (i === 7) set(c, 8, 8, dark);
    else if (i === 8) set(c, 7, 8, dark);
    else set(c, 14 - i, 8, dark);

    // Copy two, split across the other two corners, so losing one corner of
    // the symbol does not take the format information with it.
    if (i < 8) set(c, n - 1 - i, 8, dark);
    else set(c, 8, n - 15 + i, dark);
  }
}

/**
 * Zig-zag the codewords in from the bottom right.
 *
 * Any cells left over past the last codeword are the version's remainder bits,
 * which are zero — so there is nothing to write and nothing to track.
 */
function placeData(c: Canvas, codewords: Uint8Array): void {
  const n = c.size;
  const total = codewords.length * 8;
  let bit = 0;
  let upward = true;

  for (let right = n - 1; right >= 1; right -= 2) {
    // Column 6 is the vertical timing pattern and is skipped entirely.
    if (right === 6) right = 5;
    for (let step = 0; step < n; step++) {
      const y = upward ? n - 1 - step : step;
      for (const x of [right, right - 1]) {
        if (isReserved(c, x, y)) continue;
        // Past the last codeword are the remainder bits, which are zero.
        const dark =
          bit < total && ((codewords[bit >> 3] >> (7 - (bit & 7))) & 1) === 1;
        bit++;
        set(c, x, y, dark, false);
      }
    }
    upward = !upward;
  }
}

function maskAt(mask: number, x: number, y: number): boolean {
  switch (mask) {
    case 0:
      return (x + y) % 2 === 0;
    case 1:
      return y % 2 === 0;
    case 2:
      return x % 3 === 0;
    case 3:
      return (x + y) % 3 === 0;
    case 4:
      return (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0;
    case 5:
      return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6:
      return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    default:
      return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
  }
}

function applyMask(c: Canvas, mask: number): void {
  for (let y = 0; y < c.size; y++) {
    for (let x = 0; x < c.size; x++) {
      if (isReserved(c, x, y)) continue;
      if (maskAt(mask, x, y)) c.cells[y * c.size + x] ^= 1;
    }
  }
}

/**
 * The four penalty rules from the spec.
 *
 * Every mask is tried and the least ugly wins. "Ugly" here means patterns a
 * reader could mistake for structure — long runs, solid blocks, and anything
 * resembling a finder.
 */
function penalty(c: Canvas): number {
  const n = c.size;
  const at = (x: number, y: number): number => c.cells[y * n + x];
  let score = 0;

  // Rule 1: runs of five or more.
  for (let i = 0; i < n; i++) {
    for (const horizontal of [true, false]) {
      let run = 1;
      for (let j = 1; j < n; j++) {
        const a = horizontal ? at(j - 1, i) : at(i, j - 1);
        const b = horizontal ? at(j, i) : at(i, j);
        if (a === b) {
          run++;
          if (run === 5) score += 3;
          else if (run > 5) score += 1;
        } else {
          run = 1;
        }
      }
    }
  }

  // Rule 2: 2x2 blocks of one colour.
  for (let y = 0; y < n - 1; y++) {
    for (let x = 0; x < n - 1; x++) {
      const v = at(x, y);
      if (v === at(x + 1, y) && v === at(x, y + 1) && v === at(x + 1, y + 1)) score += 3;
    }
  }

  // Rule 3: the finder-lookalike 1:1:3:1:1 with four light modules either side.
  const A = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
  const B = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j + 11 <= n; j++) {
      let matchA = true;
      let matchB = true;
      let matchAv = true;
      let matchBv = true;
      for (let k = 0; k < 11; k++) {
        const h = at(j + k, i);
        const v = at(i, j + k);
        if (h !== A[k]) matchA = false;
        if (h !== B[k]) matchB = false;
        if (v !== A[k]) matchAv = false;
        if (v !== B[k]) matchBv = false;
      }
      if (matchA) score += 40;
      if (matchB) score += 40;
      if (matchAv) score += 40;
      if (matchBv) score += 40;
    }
  }

  // Rule 4: drift away from half dark.
  let dark = 0;
  for (let i = 0; i < n * n; i++) if (c.cells[i] === 1) dark++;
  const percent = (dark * 100) / (n * n);
  score += Math.floor(Math.abs(percent - 50) / 5) * 10;
  return score;
}

/** A finished symbol: `size` × `size` booleans, true meaning dark. */
export interface QrMatrix {
  size: number;
  version: number;
  modules: boolean[][];
}

/**
 * Encode `text` as a QR code.
 *
 * @throws if the text needs more than a version-10 symbol at level M.
 */
export function encodeQr(text: string): QrMatrix {
  const bytes = toBytes(text);
  const version = pickVersion(bytes.length);
  const codewords = buildCodewords(encodeData(bytes, version), version);
  const size = 17 + version * 4;

  let best: Canvas | null = null;
  let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    const c = makeCanvas(size);
    drawFunctionPatterns(c, version);
    placeData(c, codewords);
    applyMask(c, mask);
    drawFormat(c, mask);
    const score = penalty(c);
    if (score < bestScore) {
      bestScore = score;
      best = c;
    }
  }

  const canvas = best as Canvas;
  const modules: boolean[][] = [];
  for (let y = 0; y < size; y++) {
    const row: boolean[] = [];
    for (let x = 0; x < size; x++) row.push(canvas.cells[y * size + x] === 1);
    modules.push(row);
  }
  return { size, version, modules };
}

/**
 * Paint a symbol onto a canvas element.
 *
 * The quiet zone is not decoration — the spec requires four modules of blank
 * on every side and readers genuinely fail without it, which is the classic
 * way a hand-rolled QR code ends up unscannable while looking perfect.
 */
export function drawQr(
  canvas: HTMLCanvasElement,
  matrix: QrMatrix,
  options: { scale?: number; quiet?: number; dark?: string; light?: string } = {},
): void {
  const scale = options.scale ?? 4;
  const quiet = options.quiet ?? 4;
  const side = (matrix.size + quiet * 2) * scale;

  canvas.width = side;
  canvas.height = side;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.fillStyle = options.light ?? '#ffffff';
  ctx.fillRect(0, 0, side, side);
  ctx.fillStyle = options.dark ?? '#000000';
  for (let y = 0; y < matrix.size; y++) {
    for (let x = 0; x < matrix.size; x++) {
      if (matrix.modules[y][x]) {
        ctx.fillRect((x + quiet) * scale, (y + quiet) * scale, scale, scale);
      }
    }
  }
}
