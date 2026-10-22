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
}

export const HOME_URLS: Record<TabId, string> = {
  images: 'https://www.google.com/imghp',
  youtube: 'https://www.youtube.com/',
  lyrics: 'https://www.google.com/'
};

export function defaultSettings(): Settings {
  return {
    version: 2,
    activeTab: 'images',
    tabUrls: { ...HOME_URLS },
    lyricsScale: 1,
    lyricsUppercase: false,
    adblock: { enabled: true, level: 'adsAndTracking', lastUpdated: null }
  };
}

const D = defaultSettings();
const url = (fallback: string) => z.string().max(4096).refine(isHttpUrl).catch(fallback);

export const settingsSchema = z.object({
  version: z.literal(2).catch(2),
  activeTab: z.enum(['images', 'youtube', 'lyrics']).catch(D.activeTab),
  tabUrls: z
    .object({ images: url(HOME_URLS.images), youtube: url(HOME_URLS.youtube), lyrics: url(HOME_URLS.lyrics) })
    .catch(D.tabUrls),
  lyricsScale: z.number().min(0.4).max(2.5).catch(1),
  lyricsUppercase: z.boolean().catch(false),
  adblock: z
    .object({
      enabled: z.boolean().catch(true),
      level: z.enum(['adsAndTracking', 'full']).catch('adsAndTracking'),
      lastUpdated: z.string().max(64).nullable().catch(null)
    })
    .catch(D.adblock)
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

export function lyricsStyleFor(settings: Settings): LyricsStyle {
  return {
    ...LYRICS_BASE_STYLE,
    fontSize: Math.round(LYRICS_BASE_STYLE.fontSize * settings.lyricsScale),
    uppercase: settings.lyricsUppercase
  };
}
