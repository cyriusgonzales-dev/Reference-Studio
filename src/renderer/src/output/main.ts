import type { OutputPageApi, OutputPageState } from '../../../shared/outputPage';
import { applyLyricsStyle, fitLyricsText } from '../lib/lyricsRender';

/**
 * The offscreen output page (1920×1080). It draws images, lyrics or black;
 * its frames are sent over NDI and previewed in panel 3. A new picture
 * replaces the old one only once fully decoded, so the output never flashes.
 * Videos are drawn by a separate offscreen YouTube player.
 */

declare global {
  interface Window {
    vrsOutput: OutputPageApi;
  }
}

const stage = document.getElementById('stage') as HTMLDivElement;
Object.assign(stage.style, { position: 'fixed', inset: '0', background: '#000', overflow: 'hidden' });

let latestRev = -1;
let current: OutputPageState | null = null;

function proxied(url: string): string | null {
  return /^https?:/i.test(url) ? `vrs-proxy://image/?${new URLSearchParams({ u: url }).toString()}` : null;
}

function load(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.referrerPolicy = 'no-referrer';
    img.onload = () => {
      img.decode().catch(() => undefined).then(() => resolve(img));
    };
    img.onerror = () => reject(new Error('failed'));
    img.src = src;
  });
}

async function showImage(state: Extract<OutputPageState, { kind: 'image' }>): Promise<void> {
  const candidates = [state.url, proxied(state.url), state.fallbackUrl, state.fallbackUrl ? proxied(state.fallbackUrl) : null].filter(
    (c): c is string => !!c
  );
  for (const candidate of candidates) {
    try {
      const img = await load(candidate);
      if (state.rev !== latestRev) return;
      Object.assign(img.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', objectFit: 'contain' });
      stage.replaceChildren(img);
      return;
    } catch {
      // try the next candidate
    }
  }
  // Nothing could be loaded: show black rather than leave the previous picture up.
  if (state.rev === latestRev && !state.fallbackUrl) stage.replaceChildren();
}

function showLyrics(state: Extract<OutputPageState, { kind: 'lyrics' }>): void {
  const box = document.createElement('div');
  Object.assign(box.style, { position: 'absolute', inset: '0' });
  const text = document.createElement('div');
  text.textContent = state.text;
  box.appendChild(text);
  stage.replaceChildren(box);
  applyLyricsStyle(box, text, state.style, window.innerHeight);
  fitLyricsText(box, text, state.style, window.innerHeight);
}

function render(state: OutputPageState): void {
  latestRev = state.rev;
  current = state;
  if (state.kind === 'image') void showImage(state);
  else if (state.kind === 'lyrics') showLyrics(state);
  else stage.replaceChildren();
}

window.vrsOutput.onRender(render);
window.addEventListener('resize', () => {
  if (current?.kind === 'lyrics') showLyrics(current);
});
window.vrsOutput.ready();
