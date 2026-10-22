// Generates build/icon.png (512×512) and build/icon.ico (16–256 px) without
// third-party dependencies: a rounded square with a blue→violet gradient, a
// "play" triangle and three lyric lines. Run with `npm run icon`.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const OUT_DIR = path.resolve('build');

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/** Coverage-based shape tests in a unit square (0..1). */
function insideRoundedRect(x, y, r) {
  const cx = Math.min(Math.max(x, r), 1 - r);
  const cy = Math.min(Math.max(y, r), 1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

function insideTriangle(x, y, [ax, ay], [bx, by], [cx, cy]) {
  const s = (p1x, p1y, p2x, p2y, p3x, p3y) => (p1x - p3x) * (p2y - p3y) - (p2x - p3x) * (p1y - p3y);
  const d1 = s(x, y, ax, ay, bx, by);
  const d2 = s(x, y, bx, by, cx, cy);
  const d3 = s(x, y, cx, cy, ax, ay);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

function insideBar(x, y, x0, x1, yc, h) {
  if (y < yc - h / 2 || y > yc + h / 2) return false;
  const r = h / 2;
  if (x < x0 + r) return (x - (x0 + r)) ** 2 + (y - yc) ** 2 <= r * r;
  if (x > x1 - r) return (x - (x1 - r)) ** 2 + (y - yc) ** 2 <= r * r;
  return true;
}

function render(size) {
  const ss = 4; // supersampling per axis
  const out = Buffer.alloc(size * size * 4);
  const tri = [
    [0.27, 0.24],
    [0.27, 0.56],
    [0.52, 0.4]
  ];
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const x = (px + (sx + 0.5) / ss) / size;
          const y = (py + (sy + 0.5) / ss) / size;
          if (!insideRoundedRect(x, y, 0.2)) continue;
          // Background gradient: #2563eb → #7c3aed along the diagonal.
          const t = (x + y) / 2;
          let cr = 0x25 + (0x7c - 0x25) * t;
          let cg = 0x63 + (0x3a - 0x63) * t;
          let cb = 0xeb + (0xed - 0xeb) * t;
          const white =
            insideTriangle(x, y, ...tri) ||
            insideBar(x, y, 0.27, 0.73, 0.68, 0.06) ||
            insideBar(x, y, 0.27, 0.62, 0.79, 0.06);
          if (white) {
            cr = 255;
            cg = 255;
            cb = 255;
          }
          r += cr;
          g += cg;
          b += cb;
          a += 255;
        }
      }
      const n = ss * ss;
      const i = (py * size + px) * 4;
      const coverage = a / n;
      // Store straight (non-premultiplied) colour.
      out[i] = coverage ? Math.round((r / n) * (255 / coverage)) : 0;
      out[i + 1] = coverage ? Math.round((g / n) * (255 / coverage)) : 0;
      out[i + 2] = coverage ? Math.round((b / n) * (255 / coverage)) : 0;
      out[i + 3] = Math.round(coverage);
    }
  }
  return encodePng(size, out);
}

function encodeIco(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  const entries = [];
  let offset = 6 + 16 * pngs.length;
  for (const { size, data } of pngs) {
    const e = Buffer.alloc(16);
    e[0] = size >= 256 ? 0 : size;
    e[1] = size >= 256 ? 0 : size;
    e.writeUInt16LE(1, 4); // colour planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += data.length;
    entries.push(e);
  }
  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.data)]);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, 'icon.png'), render(512));
const sizes = [16, 24, 32, 48, 64, 128, 256];
fs.writeFileSync(path.join(OUT_DIR, 'icon.ico'), encodeIco(sizes.map((size) => ({ size, data: render(size) }))));
console.log('Wrote build/icon.png and build/icon.ico');
