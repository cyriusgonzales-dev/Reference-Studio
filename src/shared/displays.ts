import type { DisplayInfo } from './types';

/**
 * Display names reported by common Windows virtual display drivers. Detection is
 * a heuristic only: Windows does not flag virtual displays in a standard way.
 */
const VIRTUAL_DISPLAY_PATTERNS = [
  /virtual/i,
  /\bidd\b/i,
  /iddsample/i,
  /\bvdd\b/i,
  /parsec/i,
  /usbmmidd/i,
  /spacedesk/i,
  /dummy/i,
  /amyuni/i,
  /mttvdd/i,
  /sunshine/i,
  /headless/i
];

export function isLikelyVirtualDisplay(label: string): boolean {
  return VIRTUAL_DISPLAY_PATTERNS.some((re) => re.test(label));
}

export type DisplayChoiceReason = 'preferred' | 'preferred-by-name' | 'secondary' | 'only-display' | 'primary-fallback';

export interface DisplayChoice {
  display: DisplayInfo;
  reason: DisplayChoiceReason;
  /** True when the operator's preferred display was set but is not connected. */
  preferredMissing: boolean;
  sharesMainDisplay: boolean;
}

export interface DisplayPreference {
  displayId: number | null;
  displayLabel: string | null;
}

/**
 * Picks the display for the Presentation Output.
 *
 * 1. The operator's saved display, matched by id, then by name (Windows can
 *    renumber display ids after reconnection).
 * 2. Otherwise a display that does not host the operator window, preferring
 *    non-internal (external) displays.
 * 3. Otherwise the only/primary display.
 */
export function chooseOutputDisplay(
  displays: readonly DisplayInfo[],
  preference: DisplayPreference,
  mainDisplayId: number | null
): DisplayChoice | null {
  if (displays.length === 0) return null;
  const wantsSpecific = preference.displayId !== null || !!preference.displayLabel;
  const result = (display: DisplayInfo, reason: DisplayChoiceReason, preferredMissing: boolean): DisplayChoice => ({
    display,
    reason,
    preferredMissing,
    sharesMainDisplay: mainDisplayId !== null && display.id === mainDisplayId
  });

  if (preference.displayId !== null) {
    const byId = displays.find((d) => d.id === preference.displayId);
    if (byId) return result(byId, 'preferred', false);
  }
  if (preference.displayLabel) {
    const byLabel = displays.filter((d) => d.label === preference.displayLabel);
    if (byLabel.length === 1 && byLabel[0]) return result(byLabel[0], 'preferred-by-name', false);
  }

  if (displays.length === 1 && displays[0]) return result(displays[0], 'only-display', wantsSpecific);

  const others = displays.filter((d) => d.id !== mainDisplayId);
  const candidates = others.length > 0 ? others : displays.filter((d) => !d.isPrimary);
  const ranked = [...candidates].sort((a, b) => {
    if (a.internal !== b.internal) return a.internal ? 1 : -1;
    if (a.isPrimary !== b.isPrimary) return a.isPrimary ? 1 : -1;
    return a.bounds.x - b.bounds.x || a.bounds.y - b.bounds.y;
  });
  if (ranked[0]) return result(ranked[0], 'secondary', wantsSpecific);

  const primary = displays.find((d) => d.isPrimary) ?? displays[0];
  return primary ? result(primary, 'primary-fallback', wantsSpecific) : null;
}

export function describeDisplay(display: DisplayInfo, index?: number): string {
  const name = display.label || `Display ${display.id}`;
  const prefix = index !== undefined ? `${index + 1}. ` : '';
  const tags = [display.isPrimary ? 'primary' : null, display.likelyVirtual ? 'virtual?' : null].filter(Boolean);
  const scale = Math.round(display.scaleFactor * 100);
  return `${prefix}${name} — ${display.pixelWidth}×${display.pixelHeight} @ ${scale}%${tags.length ? ` (${tags.join(', ')})` : ''}`;
}
