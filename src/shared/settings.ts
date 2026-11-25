import { z } from 'zod';
import type { LyricsStyle } from './lyrics';
import type { AdblockLevel, TabId } from './types';
import { isHttpUrl } from './urls';

/**
 * Persisted preferences. Every field has its own fallback, so a damaged or
 * outdated settings file degrades field by field instead of resetting.
 */
export interface Settings {
  version: 2;
  activeTab: TabId;
  /** Last page of each search tab, restored at start-up. */
  tabUrls: Record<TabId, string>;
  /** Multiplier for the lyrics font size (1 = default). */
  lyricsScale: number;
  lyricsUppercase: boolean;
  adblock: { enabled: boolean; level: AdblockLevel; lastUpdated: string | null };
  /** In-app updates. Updates never restart the app by themselves: they install on restart or quit. */
  updates: { autoCheck: boolean; autoDownload: boolean };
  /** How lyrics and research slides look in panels 2 and 3 (and on NDI). */
  slides: SlideAppearance;
  /** Name vMix lists as "<COMPUTER> (<ndiName>)". */
  ndiName: string;
}

export type SlideFont = (typeof SLIDE_FONTS)[number];

export interface SlideAppearance {
  fontFamily: SlideFont;
  textColor: string;
  backgroundColor: string;
  /** top / middle / bottom (bottom = lower third). */
  vAlign: 'top' | 'middle' | 'bottom';
  hAlign: 'left' | 'center' | 'right';
  textShadow: boolean;
  /** Longest slide made from one stanza of lyrics. */
  linesPerSlide: number;
}

/** Fonts offered in Settings. Each falls back to the system font if it is not installed. */
export const SLIDE_FONTS = ['Segoe UI', 'Arial', 'Helvetica Neue', 'Verdana', 'Tahoma', 'Trebuchet MS', 'Georgia', 'Times New Roman', 'Impact'] as const;

export const DEFAULT_NDI_NAME = 'Vmix Reference Studio';

export function defaultSlideAppearance(): SlideAppearance {
  return { fontFamily: 'Segoe UI', textColor: '#ffffff', backgroundColor: '#000000', vAlign: 'middle', hAlign: 'center', textShadow: true, linesPerSlide: 4 };
}

/** One-click looks in Settings → Slides. */
export const SLIDE_PRESETS: Array<{ id: string; label: string; hint: string; appearance: Partial<SlideAppearance> }> = [
  { id: 'fullscreen', label: 'Full screen', hint: 'White text centred on black', appearance: { textColor: '#ffffff', backgroundColor: '#000000', vAlign: 'middle', hAlign: 'center', textShadow: true } },
  { id: 'lowerThird', label: 'Lower third', hint: 'Text at the bottom of the screen', appearance: { textColor: '#ffffff', backgroundColor: '#000000', vAlign: 'bottom', hAlign: 'center', textShadow: true, linesPerSlide: 2 } },
  { id: 'greenScreen', label: 'Green screen', hint: 'For chroma key in vMix', appearance: { textColor: '#ffffff', backgroundColor: '#00b140', vAlign: 'bottom', hAlign: 'center', textShadow: false, linesPerSlide: 2 } },
  { id: 'blueScreen', label: 'Blue screen', hint: 'For chroma key in vMix', appearance: { textColor: '#ffffff', backgroundColor: '#0047bb', vAlign: 'bottom', hAlign: 'center', textShadow: false, linesPerSlide: 2 } }
];

/** Characters NDI and vMix accept in a source name. */
export const NDI_NAME_PATTERN = /^[\p{L}\p{N} ._\-'&+]{1,48}$/u;

export const HOME_URLS: Record<TabId, string> = {
  images: 'https://www.google.com/imghp',
  youtube: 'https://www.youtube.com/',
  lyrics: 'https://www.google.com/',
  research: 'https://www.google.com/'
};

export function defaultSettings(): Settings {
  return {
    version: 2,
    activeTab: 'images',
    tabUrls: { ...HOME_URLS },
    lyricsScale: 1,
    lyricsUppercase: false,
    adblock: { enabled: true, level: 'adsAndTracking', lastUpdated: null },
    updates: { autoCheck: true, autoDownload: true },
    slides: defaultSlideAppearance(),
    ndiName: DEFAULT_NDI_NAME
  };
}

const D = defaultSettings();
const hexColor = z.string().regex(/^#[0-9a-f]{6}$/i);

/** Every field falls back on its own, so one bad value never resets the others. */
export function slideAppearanceSchema() {
  const d = defaultSlideAppearance();
  return z.object({
    fontFamily: z.enum(SLIDE_FONTS).catch('Segoe UI'),
    textColor: hexColor.catch(d.textColor),
    backgroundColor: hexColor.catch(d.backgroundColor),
    vAlign: z.enum(['top', 'middle', 'bottom']).catch(d.vAlign),
    hAlign: z.enum(['left', 'center', 'right']).catch(d.hAlign),
    textShadow: z.boolean().catch(d.textShadow),
    linesPerSlide: z.number().int().min(1).max(8).catch(d.linesPerSlide)
  });
}
const url = (fallback: string) => z.string().max(4096).refine(isHttpUrl).catch(fallback);

export const settingsSchema = z.object({
  version: z.literal(2).catch(2),
  activeTab: z.enum(['images', 'youtube', 'lyrics', 'research']).catch(D.activeTab),
  tabUrls: z
    .object({ images: url(HOME_URLS.images), youtube: url(HOME_URLS.youtube), lyrics: url(HOME_URLS.lyrics), research: url(HOME_URLS.research) })
    .catch(D.tabUrls),
  lyricsScale: z.number().min(0.4).max(2.5).catch(1),
  lyricsUppercase: z.boolean().catch(false),
  adblock: z
    .object({
      enabled: z.boolean().catch(true),
      level: z.enum(['adsAndTracking', 'full']).catch('adsAndTracking'),
      lastUpdated: z.string().max(64).nullable().catch(null)
    })
    .catch(D.adblock),
  updates: z
    .object({
      autoCheck: z.boolean().catch(true),
      autoDownload: z.boolean().catch(true)
    })
    .catch(D.updates),
  slides: slideAppearanceSchema().catch(D.slides),
  ndiName: z.string().trim().regex(NDI_NAME_PATTERN).catch(DEFAULT_NDI_NAME)
});

/** Parses anything (including garbage or an older file) into complete, valid settings. */
export function parseSettings(raw: unknown): Settings {
  return settingsSchema.parse(typeof raw === 'object' && raw !== null ? raw : {}) as Settings;
}

export const LYRICS_BASE_STYLE: LyricsStyle = {
  fontFamily: 'Segoe UI',
  fontSize: 76,
  fontWeight: 700,
  textColor: '#ffffff',
  backgroundColor: '#000000',
  hAlign: 'center',
  vAlign: 'middle',
  lineHeight: 1.3,
  marginPercent: 7,
  textShadow: true,
  uppercase: false
};

/** Research text is prose with a source line under it: smaller and lighter than song lyrics. */
export const RESEARCH_BASE_STYLE: LyricsStyle = {
  ...LYRICS_BASE_STYLE,
  fontSize: 60,
  fontWeight: 600,
  lineHeight: 1.35
};

export function lyricsStyleFor(settings: Settings, research = false): LyricsStyle {
  const base = research ? RESEARCH_BASE_STYLE : LYRICS_BASE_STYLE;
  const look = settings.slides;
  return {
    ...base,
    fontFamily: look.fontFamily,
    textColor: look.textColor,
    backgroundColor: look.backgroundColor,
    vAlign: look.vAlign,
    hAlign: look.hAlign,
    textShadow: look.textShadow,
    fontSize: Math.round(base.fontSize * settings.lyricsScale),
    uppercase: settings.lyricsUppercase
  };
}
