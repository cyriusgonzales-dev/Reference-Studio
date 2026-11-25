// Renders every app and website icon from the master logo, build/icon.svg, and
// its bolder small-size version, build/icon-small.svg (used at 32 px and below).
// Run with `npm run icon` after editing either SVG, then commit the outputs.
//
//   build/icon.png              1024 px, full-bleed tile (Windows, Linux, general use)
//   build/icon.ico              16–256 px (Windows exe, installer, shortcuts)
//   build/icon-mac.png          1024 px on Apple's icon grid: 824 px tile with shadow (macOS .icns)
//   src/renderer/src/assets/    logo.svg for the app's own UI
//   build/logo-dark.png         full logo (icon + name) for dark backgrounds; logo-light.png for light ones
//   website/public/             logo.svg, favicon.svg (small), favicon.ico, apple-touch-icon.png, icon-512.png, og-image.png
import fs from 'node:fs';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';

const root = path.resolve();
const master = fs.readFileSync(path.join(root, 'build/icon.svg'), 'utf8');
const small = fs.readFileSync(path.join(root, 'build/icon-small.svg'), 'utf8');
const inner = master.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');

function render(svg, width) {
  return Buffer.from(new Resvg(svg, { fitTo: { mode: 'width', value: width }, font: { loadSystemFonts: true } }).render().asPng());
}

/** The master scaled and placed inside a larger canvas. */
function placed(canvasW, canvasH, x, y, size, extra = '', background = '') {
  const s = size / 1024;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${canvasW} ${canvasH}" width="${canvasW}" height="${canvasH}">
${background}${extra}<g transform="translate(${x} ${y}) scale(${s})">${inner}</g></svg>`;
}

/** macOS Big Sur+ grid: an 824 px tile centred on a 1024 px canvas, with a soft drop shadow. */
function macIcon() {
  const shadow = `<defs><filter id="sh" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="14"/></filter></defs>
<rect x="100" y="112" width="824" height="824" rx="185" fill="#000" fill-opacity="0.35" filter="url(#sh)"/>`;
  return placed(1024, 1024, 100, 100, 824, shadow);
}

/** Social preview card (1200×630) for the website. */
function ogImage() {
  const bg = `<defs>
  <linearGradient id="ogbg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0b1020"/><stop offset="1" stop-color="#140d2e"/></linearGradient>
  <radialGradient id="ogglow" cx="0.2" cy="0.3" r="0.7"><stop offset="0" stop-color="#6366f1" stop-opacity="0.4"/><stop offset="1" stop-color="#3b82f6" stop-opacity="0"/></radialGradient>
</defs>
<rect width="1200" height="630" fill="url(#ogbg)"/><rect width="1200" height="630" fill="url(#ogglow)"/>
<text x="440" y="285" font-family="Segoe UI, Helvetica Neue, Arial, sans-serif" font-size="66" font-weight="700" fill="#ffffff" letter-spacing="-1"><tspan font-weight="300" fill="#aab4cf">Vmix </tspan>Reference Studio</text>
<text x="440" y="355" font-family="Segoe UI, Helvetica Neue, Arial, sans-serif" font-size="32" fill="#aab4cf">Search images, videos, lyrics and sources.</text>
<text x="440" y="400" font-family="Segoe UI, Helvetica Neue, Arial, sans-serif" font-size="32" fill="#aab4cf">Send them live to vMix over NDI.</text>
<text x="440" y="480" font-family="Segoe UI, Helvetica Neue, Arial, sans-serif" font-size="22" font-weight="600" fill="#a5b4fc" letter-spacing="4">SEARCH · PRESENT · BROADCAST</text>`;
  return placed(1200, 630, 110, 175, 280, '', bg);
}

/** Full logo: icon + name + tagline, for README, press and slides. */
function lockup(dark) {
  const main = dark ? '#ffffff' : '#0b1020';
  const sub = dark ? '#9aa4c4' : '#5b647d';
  const font = 'font-family="Segoe UI, Helvetica Neue, Arial, sans-serif"';
  const text = `<text x="232" y="128" ${font} font-size="84" font-weight="700" fill="${main}" letter-spacing="-1.5"><tspan font-weight="300" fill="${sub}">Vmix </tspan>Reference Studio</text>
<text x="236" y="186" ${font} font-size="30" font-weight="600" fill="${sub}" letter-spacing="7">SEARCH · PRESENT · BROADCAST</text>`;
  return placed(1240, 240, 20, 20, 200, text);
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

/** Small sizes use the bold variant; larger ones the full-detail master. */
const art = (size) => (size <= 32 ? small : master);
const ico = (sizes) => encodeIco(sizes.map((size) => ({ size, data: render(art(size), size) })));

function write(rel, data) {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
  console.log(`  ${rel}`);
}

console.log('Rendering icons from build/icon.svg:');
write('build/icon.png', render(master, 1024));
write('build/icon.ico', ico([16, 24, 32, 48, 64, 128, 256]));
write('build/icon-mac.png', render(macIcon(), 1024));
write('src/renderer/src/assets/logo.svg', master);
write('website/public/logo.svg', master);
write('website/public/favicon.svg', small);
write('website/public/favicon.ico', ico([16, 32, 48]));
write('website/public/apple-touch-icon.png', render(master, 180));
write('website/public/icon-512.png', render(master, 512));
write('website/public/og-image.png', render(ogImage(), 1200));
write('build/logo-dark.png', render(lockup(true), 1240));
write('build/logo-light.png', render(lockup(false), 1240));
