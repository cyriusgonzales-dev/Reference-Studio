import type { LyricsStyle } from '../../../shared/lyrics';

/**
 * Lyrics layout shared by the Presentation Output and every preview in the
 * operator UI, so what the operator previews is what the audience sees.
 *
 * Text is laid out on a stage whose font size is defined for a 1080-pixel-tall
 * output. If a slide does not fit inside the safe margins, the font is reduced
 * (binary search) until it does. The resulting scale is reported so the editor
 * can warn about dense slides instead of silently shrinking them.
 */

export const REFERENCE_HEIGHT = 1080;
/** Below this scale the editor recommends splitting the slide. */
export const DENSE_SCALE_THRESHOLD = 0.75;
const MIN_SCALE = 0.25;

export function applyLyricsStyle(stage: HTMLElement, text: HTMLElement, style: LyricsStyle, stageHeight: number): void {
  const unit = stageHeight / REFERENCE_HEIGHT;
  stage.style.backgroundColor = style.backgroundColor;
  stage.style.display = 'flex';
  stage.style.boxSizing = 'border-box';
  stage.style.padding = `${style.marginPercent}% ${style.marginPercent}%`;
  stage.style.justifyContent = { left: 'flex-start', center: 'center', right: 'flex-end' }[style.hAlign];
  stage.style.alignItems = { top: 'flex-start', middle: 'center', bottom: 'flex-end' }[style.vAlign];
  stage.style.overflow = 'hidden';
  stage.style.position = stage.style.position || 'relative';

  text.style.fontFamily = `"${style.fontFamily.replace(/"/g, '')}", "Segoe UI", Arial, sans-serif`;
  text.style.fontWeight = String(style.fontWeight);
  text.style.color = style.textColor;
  text.style.lineHeight = String(style.lineHeight);
  text.style.textAlign = style.hAlign;
  text.style.whiteSpace = 'pre-wrap';
  text.style.overflowWrap = 'break-word';
  text.style.maxWidth = '100%';
  text.style.maxHeight = '100%';
  text.style.textTransform = style.uppercase ? 'uppercase' : 'none';
  text.style.textShadow = style.textShadow ? `0 ${2 * unit}px ${8 * unit}px rgba(0,0,0,0.85)` : 'none';
  text.style.margin = '0';
}

/**
 * Styles the source line under a research slide. It sits inside the bottom
 * safe margin, so it never overlaps the text and needs no layout change.
 */
export function applySourceStyle(line: HTMLElement, style: LyricsStyle, stageHeight: number): void {
  const unit = stageHeight / REFERENCE_HEIGHT;
  Object.assign(line.style, {
    position: 'absolute',
    left: `${style.marginPercent}%`,
    right: `${style.marginPercent}%`,
    bottom: `${30 * unit}px`,
    fontFamily: '"Segoe UI", Arial, sans-serif',
    fontSize: `${32 * unit}px`,
    fontWeight: '500',
    lineHeight: '1.3',
    color: 'rgba(255, 255, 255, 0.78)',
    textAlign: 'center',
    textTransform: 'none',
    textShadow: `0 ${unit}px ${4 * unit}px rgba(0,0,0,0.85)`,
    display: '-webkit-box',
    webkitBoxOrient: 'vertical',
    webkitLineClamp: '2',
    overflow: 'hidden'
  });
}

/**
 * Shrinks the text until it fits inside the stage's content box.
 * Returns the applied scale (1 = configured size).
 */
export function fitLyricsText(stage: HTMLElement, text: HTMLElement, style: LyricsStyle, stageHeight: number): number {
  const base = style.fontSize * (stageHeight / REFERENCE_HEIGHT);
  const cs = getComputedStyle(stage);
  const availW = stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const availH = stage.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  if (availW <= 0 || availH <= 0) {
    text.style.fontSize = `${base}px`;
    return 1;
  }
  text.style.maxHeight = 'none';
  const fits = (scale: number) => {
    text.style.fontSize = `${base * scale}px`;
    return text.scrollHeight <= availH + 1 && text.scrollWidth <= availW + 1;
  };
  let scale = 1;
  if (!fits(1)) {
    let lo = MIN_SCALE;
    let hi = 1;
    for (let i = 0; i < 12; i++) {
      const mid = (lo + hi) / 2;
      if (fits(mid)) lo = mid;
      else hi = mid;
    }
    scale = lo;
    fits(scale);
  }
  text.style.maxHeight = '100%';
  return scale;
}

