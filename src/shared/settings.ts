import { z } from 'zod';
import { defaultShortcuts, SHORTCUT_DEFINITIONS, validateShortcut, type ShortcutMap } from './shortcuts';
import { isAllowedImageUrl } from './urls';
import type { AdblockLevel, LyricsStyle, SearchEngine, SearchMode } from './types';

/**
 * Application preferences. Every field has a default and an individual
 * fallback, so a damaged or outdated settings file degrades field-by-field
 * instead of resetting everything.
 */

export interface Settings {
  version: 1;
  research: {
    homeUrl: string;
    defaultMode: SearchMode;
    searchEngine: SearchEngine;
    pauseResearchMediaOnPresent: boolean;
  };
  output: {
    displayId: number | null;
    displayLabel: string | null;
    fullscreen: boolean;
    openOnLaunch: boolean;
    /** Crossfade duration in ms; 0 disables transitions. */
    transitionMs: number;
    imageBackground: string;
    showYouTubeControls: boolean;
  };
  queue: {
    /** When on, Next/Previous also present the item (explicit auto-advance mode). */
    presentOnNavigate: boolean;
    /** When on, the next queue item is presented when a live video ends. */
    autoAdvanceOnVideoEnd: boolean;
  };
  lyrics: LyricsStyle;
  adblock: {
    enabled: boolean;
    applyToOutput: boolean;
    level: AdblockLevel;
    lastUpdated: string | null;
  };
  shortcuts: ShortcutMap;
  ui: {
    sidebarWidth: number;
    sidebarCollapsed: boolean;
  };
}

export const HEX_COLOR_RE = /^#[0-9a-f]{6}$/i;

export const DEFAULT_LYRICS_STYLE: LyricsStyle = {
  fontFamily: 'Segoe UI',
  fontSize: 72,
  fontWeight: 600,
  textColor: '#ffffff',
  backgroundColor: '#000000',
  hAlign: 'center',
  vAlign: 'middle',
  lineHeight: 1.3,
  marginPercent: 8,
  backgroundImage: null,
  backgroundDim: 0.4,
  textShadow: true,
  uppercase: false
};

export function defaultSettings(): Settings {
  return {
    version: 1,
    research: {
      homeUrl: 'https://www.google.com/imghp',
      defaultMode: 'images',
      searchEngine: 'google',
      pauseResearchMediaOnPresent: true
    },
    output: {
      displayId: null,
      displayLabel: null,
      fullscreen: true,
      openOnLaunch: false,
      transitionMs: 200,
      imageBackground: '#000000',
      showYouTubeControls: false
    },
    queue: { presentOnNavigate: false, autoAdvanceOnVideoEnd: false },
    lyrics: { ...DEFAULT_LYRICS_STYLE },
    adblock: { enabled: true, applyToOutput: true, level: 'adsAndTracking', lastUpdated: null },
    shortcuts: defaultShortcuts(),
    ui: { sidebarWidth: 360, sidebarCollapsed: false }
  };
}

const D = defaultSettings();

const color = (fallback: string) => z.string().regex(HEX_COLOR_RE).catch(fallback);
const bool = (fallback: boolean) => z.boolean().catch(fallback);
const num = (min: number, max: number, fallback: number) => z.number().finite().min(min).max(max).catch(fallback);
const fontFamily = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[\p{L}\p{N} ,'"-]+$/u, 'Font family contains unsupported characters');

export const lyricsStyleSchema = z.object({
  fontFamily: fontFamily.catch(D.lyrics.fontFamily),
  fontSize: num(16, 240, D.lyrics.fontSize),
  fontWeight: z.number().int().min(100).max(900).catch(D.lyrics.fontWeight),
  textColor: color(D.lyrics.textColor),
  backgroundColor: color(D.lyrics.backgroundColor),
  hAlign: z.enum(['left', 'center', 'right']).catch(D.lyrics.hAlign),
  vAlign: z.enum(['top', 'middle', 'bottom']).catch(D.lyrics.vAlign),
  lineHeight: num(0.9, 3, D.lyrics.lineHeight),
  marginPercent: num(0, 25, D.lyrics.marginPercent),
  backgroundImage: z
    .string()
    .refine(isAllowedImageUrl, 'Unsupported background image URL')
    .nullable()
    .catch(D.lyrics.backgroundImage),
  backgroundDim: num(0, 0.9, D.lyrics.backgroundDim),
  textShadow: bool(D.lyrics.textShadow),
  uppercase: bool(D.lyrics.uppercase)
});

const shortcutsSchema = z
  .record(z.string(), z.string().max(64).nullable())
  .catch({})
  .transform((raw): ShortcutMap => {
    const map = defaultShortcuts();
    for (const def of SHORTCUT_DEFINITIONS) {
      const value = raw[def.action];
      if (value === null) map[def.action] = null;
      else if (typeof value === 'string' && validateShortcut(def.action, value) === null) map[def.action] = value;
    }
    return map;
  });

export const settingsSchema = z.object({
  version: z.literal(1).catch(1),
  research: z
    .object({
      homeUrl: z.url({ protocol: /^https?$/ }).max(2048).catch(D.research.homeUrl),
      defaultMode: z.enum(['images', 'youtube', 'web']).catch(D.research.defaultMode),
      searchEngine: z.enum(['google', 'duckduckgo', 'bing']).catch(D.research.searchEngine),
      pauseResearchMediaOnPresent: bool(D.research.pauseResearchMediaOnPresent)
    })
    .catch(D.research),
  output: z
    .object({
      displayId: z.number().int().nullable().catch(null),
      displayLabel: z.string().max(200).nullable().catch(null),
      fullscreen: bool(D.output.fullscreen),
      openOnLaunch: bool(D.output.openOnLaunch),
      transitionMs: z.number().int().min(0).max(2000).catch(D.output.transitionMs),
      imageBackground: color(D.output.imageBackground),
      showYouTubeControls: bool(D.output.showYouTubeControls)
    })
    .catch(D.output),
  queue: z
    .object({
      presentOnNavigate: bool(D.queue.presentOnNavigate),
      autoAdvanceOnVideoEnd: bool(D.queue.autoAdvanceOnVideoEnd)
    })
    .catch(D.queue),
  lyrics: lyricsStyleSchema.catch(D.lyrics),
  adblock: z
    .object({
      enabled: bool(D.adblock.enabled),
      applyToOutput: bool(D.adblock.applyToOutput),
      level: z.enum(['adsAndTracking', 'full']).catch(D.adblock.level),
      lastUpdated: z.string().max(64).nullable().catch(null)
    })
    .catch(D.adblock),
  shortcuts: shortcutsSchema,
  ui: z
    .object({
      sidebarWidth: z.number().int().min(260).max(720).catch(D.ui.sidebarWidth),
      sidebarCollapsed: bool(D.ui.sidebarCollapsed)
    })
    .catch(D.ui)
});

/** Parses anything (including garbage) into complete, valid settings. */
export function parseSettings(raw: unknown): Settings {
  const input = typeof raw === 'object' && raw !== null ? raw : {};
  return settingsSchema.parse(input) as Settings;
}

/** A recursive partial used by settings:update. */
export type SettingsPatch = {
  [K in keyof Settings]?: Settings[K] extends object ? Partial<Settings[K]> : Settings[K];
};

function strict(schema: z.ZodType): z.ZodType {
  return schema instanceof z.ZodCatch ? (schema.unwrap() as z.ZodType) : schema;
}

/**
 * Strictly validates a settings patch. Unlike file loading, an operator change
 * with an invalid value is rejected with a message instead of silently replaced.
 */
export function validateSettingsPatch(patch: unknown): string | null {
  if (typeof patch !== 'object' || patch === null || Array.isArray(patch)) return 'Settings patch must be an object.';
  const sections = settingsSchema.shape as unknown as Record<string, z.ZodType>;
  for (const [section, value] of Object.entries(patch)) {
    if (section === 'version') return 'The settings version cannot be changed.';
    const sectionSchema = sections[section];
    if (!sectionSchema) return `Unknown settings section "${section}".`;
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return `Settings section "${section}" must be an object.`;
    for (const [field, fieldValue] of Object.entries(value)) {
      if (section === 'shortcuts') {
        const def = SHORTCUT_DEFINITIONS.find((d) => d.action === field);
        if (!def) return `Unknown shortcut "${field}".`;
        if (fieldValue === null) continue;
        if (typeof fieldValue !== 'string') return `Shortcut "${field}" must be text or null.`;
        const problem = validateShortcut(def.action, fieldValue);
        if (problem) return `${def.label}: ${problem}`;
        continue;
      }
      const objectSchema = strict(sectionSchema);
      if (!(objectSchema instanceof z.ZodObject)) return `Settings section "${section}" cannot be patched.`;
      const fieldSchema = (objectSchema.shape as Record<string, z.ZodType>)[field];
      if (!fieldSchema) return `Unknown setting "${section}.${field}".`;
      const result = strict(fieldSchema).safeParse(fieldValue);
      if (!result.success) return `Invalid value for ${section}.${field}: ${result.error.issues[0]?.message ?? 'invalid'}`;
    }
  }
  return null;
}

/** Validates and applies a patch, returning complete settings. Throws on invalid input. */
export function applySettingsPatch(current: Settings, patch: SettingsPatch): Settings {
  const problem = validateSettingsPatch(patch);
  if (problem) throw new Error(problem);
  const merged: Record<string, unknown> = { ...current };
  for (const [section, value] of Object.entries(patch)) {
    const base = (current as unknown as Record<string, unknown>)[section];
    merged[section] = { ...(base as object), ...(value as object) };
  }
  return parseSettings(merged);
}
