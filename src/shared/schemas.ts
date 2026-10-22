import { z } from 'zod';
import type { InvokeChannel } from './channels';
import { MAX_SLIDE_CHARS, MAX_SLIDES_PER_SONG } from './lyrics';
import { SHORTCUT_DEFINITIONS } from './shortcuts';
import { isAllowedImageUrl, isHttpUrl, isValidYouTubeId, MAX_URL_LENGTH } from './urls';

/* ------------------------------------------------------------------ */
/* Primitive schemas                                                   */
/* ------------------------------------------------------------------ */

export const idSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, 'Invalid id');
export const titleSchema = z.string().trim().max(300);
export const httpUrlSchema = z.string().max(MAX_URL_LENGTH).refine(isHttpUrl, 'Only http and https URLs are allowed');
export const imageUrlSchema = z.string().refine(isAllowedImageUrl, 'Unsupported or invalid image URL');
export const isoDateSchema = z.string().max(40);

/* ------------------------------------------------------------------ */
/* Presentable items                                                   */
/* ------------------------------------------------------------------ */

export const imageItemSchema = z.object({
  kind: z.literal('image'),
  id: idSchema,
  title: titleSchema,
  imageUrl: imageUrlSchema,
  sourcePageUrl: httpUrlSchema.optional(),
  thumbnailUrl: imageUrlSchema.optional()
});

export const videoItemSchema = z.object({
  kind: z.literal('video'),
  id: idSchema,
  title: titleSchema,
  videoId: z.string().refine(isValidYouTubeId, 'Invalid YouTube video id'),
  sourceUrl: httpUrlSchema,
  thumbnailUrl: httpUrlSchema.optional(),
  startSeconds: z.number().int().min(0).max(86_400).optional()
});

export const lyricsItemSchema = z.object({
  kind: z.literal('lyrics'),
  id: idSchema,
  title: titleSchema,
  songId: idSchema,
  slideIndex: z.number().int().min(0).max(MAX_SLIDES_PER_SONG)
});

export const presentableItemSchema = z.discriminatedUnion('kind', [imageItemSchema, videoItemSchema, lyricsItemSchema]);

export const liveLyricsSchema = z.object({
  songId: idSchema,
  title: titleSchema,
  slides: z.array(z.string().max(MAX_SLIDE_CHARS)).min(1).max(MAX_SLIDES_PER_SONG),
  index: z.number().int().min(0).max(MAX_SLIDES_PER_SONG)
});

/* ------------------------------------------------------------------ */
/* Persisted documents                                                 */
/* ------------------------------------------------------------------ */

export const queueEntrySchema = z.object({
  id: idSchema,
  addedAt: isoDateSchema,
  notes: z.string().max(2000).catch(''),
  item: presentableItemSchema
});

export const queueFileSchema = z.object({
  version: z.literal(1),
  entries: z.array(queueEntrySchema).max(500),
  currentId: idSchema.nullable()
});

export const slideSchema = z.object({ id: idSchema, text: z.string().max(MAX_SLIDE_CHARS) });

export const songSchema = z.object({
  id: idSchema,
  title: z.string().trim().min(1, 'A song needs a title').max(200),
  slides: z.array(slideSchema).max(MAX_SLIDES_PER_SONG),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema
});

export const lyricsFileSchema = z.object({
  version: z.literal(1),
  songs: z.array(songSchema).max(5000)
});

export const bookmarkSchema = z.object({
  id: idSchema,
  title: titleSchema,
  url: httpUrlSchema,
  createdAt: isoDateSchema
});

export const bookmarksFileSchema = z.object({
  version: z.literal(1),
  bookmarks: z.array(bookmarkSchema).max(5000)
});

/* ------------------------------------------------------------------ */
/* IPC request payloads                                                */
/* ------------------------------------------------------------------ */

const none = z.undefined();
const shortcutActions = SHORTCUT_DEFINITIONS.map((d) => d.action) as [string, ...string[]];

export const requestSchemas = {
  'app:getSnapshot': none,
  'app:openExternal': z.object({ url: httpUrlSchema }),
  'app:openDataFolder': none,
  'app:clearBrowsingData': none,
  'app:runShortcut': z.object({ action: z.enum(shortcutActions) }),
  'research:navigate': z.object({
    input: z.string().max(MAX_URL_LENGTH),
    mode: z.enum(['images', 'youtube', 'web'])
  }),
  'research:command': z.object({ command: z.enum(['back', 'forward', 'reload', 'stop', 'home']) }),
  'research:setBounds': z.object({
    x: z.number().finite().min(0).max(100_000),
    y: z.number().finite().min(0).max(100_000),
    width: z.number().finite().min(0).max(100_000),
    height: z.number().finite().min(0).max(100_000),
    visible: z.boolean()
  }),
  'research:focus': none,
  'research:setMuted': z.object({ muted: z.boolean() }),
  'selection:set': z.object({ item: presentableItemSchema.nullable() }),
  'preview:set': z.object({ item: presentableItemSchema.nullable() }),
  'output:present': z.object({ item: presentableItemSchema, lyrics: liveLyricsSchema.optional() }),
  'output:clear': none,
  'output:restore': none,
  'output:window': z.object({
    command: z.enum(['open', 'show', 'hide', 'toggleVisible', 'toggleFullscreen', 'focus', 'reload'])
  }),
  'output:video': z.discriminatedUnion('command', [
    z.object({ command: z.enum(['play', 'pause', 'toggle', 'restart', 'mute', 'unmute', 'stop']) }),
    z.object({ command: z.literal('seek'), value: z.number().finite().min(0).max(86_400) }),
    z.object({ command: z.literal('seekBy'), value: z.number().finite().min(-3600).max(3600) }),
    z.object({ command: z.literal('volume'), value: z.number().finite().min(0).max(1) })
  ]),
  'output:lyrics': z.discriminatedUnion('command', [
    z.object({ command: z.enum(['next', 'previous', 'first', 'last']) }),
    z.object({ command: z.literal('goto'), index: z.number().int().min(0).max(MAX_SLIDES_PER_SONG) })
  ]),
  'output:image': z.discriminatedUnion('command', [
    z.object({ command: z.enum(['in', 'out', 'fit', 'actual', 'reset']) }),
    z.object({ command: z.literal('pan'), dx: z.number().finite().min(-2).max(2), dy: z.number().finite().min(-2).max(2) })
  ]),
  'output:fallback': z.object({ action: z.enum(['thumbnail', 'watchPage', 'openExternal', 'sourcePage', 'retry']) }),
  'queue:add': z.object({
    item: presentableItemSchema,
    position: z.enum(['end', 'next']).optional(),
    notes: z.string().max(2000).optional()
  }),
  'queue:remove': z.object({ id: idSchema }),
  'queue:move': z.object({ from: z.number().int().min(0).max(1000), to: z.number().int().min(0).max(1000) }),
  'queue:clear': none,
  'queue:select': z.object({ id: idSchema.nullable() }),
  'queue:step': z.object({ direction: z.enum(['next', 'previous']) }),
  'queue:presentEntry': z.object({ id: idSchema }),
  'queue:updateNotes': z.object({ id: idSchema, notes: z.string().max(2000) }),
  'lyrics:list': none,
  'lyrics:save': z.object({ song: songSchema }),
  'lyrics:delete': z.object({ id: idSchema }),
  'lyrics:duplicate': z.object({ id: idSchema }),
  'lyrics:chooseBackground': none,
  'bookmarks:list': none,
  'bookmarks:add': z.object({ title: titleSchema, url: httpUrlSchema }),
  'bookmarks:remove': z.object({ id: idSchema }),
  'settings:get': none,
  // Field-level validation happens in validateSettingsPatch.
  'settings:update': z.object({ patch: z.record(z.string(), z.record(z.string(), z.unknown())) }),
  'settings:resetShortcuts': z.object({ action: z.enum(shortcutActions).optional() }),
  'display:select': z.object({ displayId: z.number().int() }),
  'display:identify': none,
  'adblock:update': none
} satisfies Record<InvokeChannel, z.ZodType>;

export type RequestOf<C extends InvokeChannel> = z.input<(typeof requestSchemas)[C]>;

/** Payload sent by the Presentation Output renderer after an image load attempt. */
export const imageResultSchema = z.object({
  token: z.number().int().min(0),
  ok: z.boolean(),
  message: z.string().max(500).optional()
});
