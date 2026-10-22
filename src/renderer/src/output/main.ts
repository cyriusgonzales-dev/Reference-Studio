import type { OutputApi, OutputRenderState } from '../../../shared/api';
import type { ImageView, LyricsStyle } from '../../../shared/types';
import { applyLyricsStyle, fitLyricsText } from '../lib/lyricsRender';

/**
 * The Presentation Output page. It draws exactly what the main process says
 * is live and nothing else: no controls, no cursor, no error text. Images and
 * lyrics are drawn into one of two layers and crossfaded, so the previous item
 * stays on screen until the next one is fully decoded (no flashes). Videos are
 * drawn by a separate view placed on top of this page by the main process.
 */

declare global {
  interface Window {
    vrsOutput: OutputApi;
  }
}

type LayerContent =
  | { kind: 'image'; url: string; img: HTMLImageElement }
  | { kind: 'lyrics'; key: string }
  | { kind: 'none' };

interface Layer {
  el: HTMLDivElement;
  content: LayerContent;
}

const stage = document.getElementById('stage') as HTMLDivElement;
Object.assign(stage.style, { position: 'fixed', inset: '0', background: '#000', overflow: 'hidden' } satisfies Partial<CSSStyleDeclaration>);

function makeLayer(): Layer {
  const el = document.createElement('div');
  Object.assign(el.style, { position: 'absolute', inset: '0', opacity: '0', overflow: 'hidden', willChange: 'opacity' });
  stage.appendChild(el);
  return { el, content: { kind: 'none' } };
}

let front = makeLayer();
let back = makeLayer();
let current: OutputRenderState | null = null;
/** Increments for every render request so slow image decodes from older requests are discarded. */
let renderSeq = 0;

function setTransition(layer: Layer, ms: number): void {
  layer.el.style.transition = ms > 0 ? `opacity ${ms}ms ease` : 'none';
}

/**
 * Fades the prepared `back` layer in over `front`, then swaps roles. The
 * outgoing layer stays fully visible underneath until the fade completes, so
 * the picture never dips to black between items.
 */
function swapIn(ms: number): void {
  const incoming = back;
  const outgoing = front;
  setTransition(incoming, ms);
  incoming.el.style.zIndex = '2';
  outgoing.el.style.zIndex = '1';
  // Flush styles so the transition starts from opacity 0.
  void incoming.el.offsetWidth;
  incoming.el.style.opacity = '1';
  front = incoming;
  back = outgoing;
  window.setTimeout(() => {
    if (back !== outgoing) return;
    setTransition(outgoing, 0);
    outgoing.el.style.opacity = '0';
    clearLayer(outgoing);
  }, ms + 20);
}

function clearLayer(layer: Layer): void {
  if (layer === front) return;
  layer.el.replaceChildren();
  layer.el.style.backgroundColor = 'transparent';
  layer.el.style.backgroundImage = 'none';
  layer.content = { kind: 'none' };
}

function fadeToBlack(ms: number): void {
  setTransition(front, ms);
  front.el.style.opacity = '0';
  const layer = front;
  window.setTimeout(() => {
    if (layer.el.style.opacity === '0') {
      layer.el.replaceChildren();
      layer.content = { kind: 'none' };
    }
  }, ms + 50);
}

/* ------------------------------------------------------------------ */
/* Images                                                              */
/* ------------------------------------------------------------------ */

function layoutImage(img: HTMLImageElement, view: ImageView): void {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const nw = img.naturalWidth || 1;
  const nh = img.naturalHeight || 1;
  const fitScale = Math.min(vw / nw, vh / nh);
  let scale: number;
  if (view.mode === 'fit') scale = fitScale;
  else if (view.mode === 'actual') scale = 1 / (window.devicePixelRatio || 1);
  else scale = fitScale * view.scale;
  const w = nw * scale;
  const h = nh * scale;
  const maxX = Math.max(0, (w - vw) / 2);
  const maxY = Math.max(0, (h - vh) / 2);
  const tx = -view.panX * maxX;
  const ty = -view.panY * maxY;
  Object.assign(img.style, {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: `${w}px`,
    height: `${h}px`,
    maxWidth: 'none',
    transform: `translate(-50%, -50%) translate(${tx}px, ${ty}px)`,
    userSelect: 'none'
  });
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.draggable = false;
    img.referrerPolicy = 'no-referrer';
    img.onload = () => {
      img
        .decode()
        .catch(() => undefined)
        .then(() => resolve(img));
    };
    img.onerror = () => reject(new Error('The image could not be loaded.'));
    img.src = url;
  });
}

function proxied(url: string): string | null {
  if (!/^https?:/i.test(url)) return null;
  return `vrs-proxy://image/?${new URLSearchParams({ u: url }).toString()}`;
}

async function showImage(state: OutputRenderState, seq: number): Promise<void> {
  const image = state.image;
  if (!image) return;

  // Same picture already on screen: only zoom/pan/background changed.
  if (front.content.kind === 'image' && front.content.url === image.url && front.el.style.opacity === '1') {
    front.el.style.backgroundColor = image.background;
    layoutImage(front.content.img, image.view);
    if (state.status === 'LOADING_IMAGE') window.vrsOutput.imageResult({ token: state.token, ok: true });
    return;
  }
  if (state.status !== 'LOADING_IMAGE') return;

  let img: HTMLImageElement;
  try {
    img = await loadImage(image.url);
  } catch {
    const fallback = proxied(image.url);
    try {
      if (!fallback) throw new Error('unavailable');
      img = await loadImage(fallback);
    } catch {
      if (seq === renderSeq) {
        window.vrsOutput.imageResult({
          token: state.token,
          ok: false,
          message: 'The image could not be loaded (it may be protected, removed, or not an image).'
        });
      }
      return;
    }
  }
  if (seq !== renderSeq) return;

  clearLayer(back);
  back.el.style.backgroundColor = image.background;
  back.el.appendChild(img);
  back.content = { kind: 'image', url: image.url, img };
  layoutImage(img, image.view);
  swapIn(state.transitionMs);
  window.vrsOutput.imageResult({ token: state.token, ok: true });
}

/* ------------------------------------------------------------------ */
/* Lyrics                                                              */
/* ------------------------------------------------------------------ */

function lyricsKey(text: string, style: LyricsStyle): string {
  return JSON.stringify([text, style, window.innerWidth, window.innerHeight]);
}

function drawLyrics(layer: Layer, text: string, style: LyricsStyle): void {
  layer.el.replaceChildren();
  const box = document.createElement('div');
  Object.assign(box.style, { position: 'absolute', inset: '0' });
  const p = document.createElement('div');
  p.textContent = text;
  box.appendChild(p);
  layer.el.appendChild(box);
  applyLyricsStyle(box, p, style, window.innerHeight);
  fitLyricsText(box, p, style, window.innerHeight);
  layer.content = { kind: 'lyrics', key: lyricsKey(text, style) };
}

function showLyrics(state: OutputRenderState): void {
  const lyrics = state.lyrics;
  if (!lyrics) return;
  const key = lyricsKey(lyrics.text, lyrics.style);
  if (front.content.kind === 'lyrics' && front.content.key === key && front.el.style.opacity === '1') return;
  clearLayer(back);
  drawLyrics(back, lyrics.text, lyrics.style);
  swapIn(state.transitionMs);
}

/* ------------------------------------------------------------------ */
/* Render loop                                                         */
/* ------------------------------------------------------------------ */

function render(state: OutputRenderState): void {
  current = state;
  const seq = ++renderSeq;
  switch (state.status) {
    case 'IMAGE':
    case 'LOADING_IMAGE':
      void showImage(state, seq);
      break;
    case 'LYRICS':
      showLyrics(state);
      break;
    default:
      // EMPTY, ERROR, and video states: black underneath (the video view sits on top).
      fadeToBlack(state.status === 'EMPTY' ? state.transitionMs : 0);
      break;
  }
}

window.vrsOutput.onRender(render);

let resizeTimer = 0;
window.addEventListener('resize', () => {
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    if (!current) return;
    if (front.content.kind === 'image' && current.image) layoutImage(front.content.img, current.image.view);
    if (front.content.kind === 'lyrics' && current.lyrics) drawLyrics(front, current.lyrics.text, current.lyrics.style);
  }, 50);
});

// Block anything that could surface browser UI in the captured output.
window.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('dragstart', (e) => e.preventDefault());

window.vrsOutput.ready();
