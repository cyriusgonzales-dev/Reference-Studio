import { z } from 'zod';
import type { InvokeChannel } from './channels';
import { MAX_LYRICS_TEXT } from './lyrics';
import { isAllowedImageUrl, MAX_URL_LENGTH } from './urls';

const none = z.undefined();
const tabId = z.enum(['images', 'youtube', 'lyrics', 'research']);
const pageText = (max = 500) => z.string().max(max);
const httpUrl = z.string().max(MAX_URL_LENGTH).refine((u) => /^https?:\/\//i.test(u), 'Only http and https URLs are allowed');
const coordinate = z.number().finite().min(-10_000).max(100_000);

/** Payloads of operator-UI requests. Every request is validated before it is handled. */
export const requestSchemas = {
  'app:getSnapshot': none,
  'app:openExternal': z.object({ url: httpUrl }),
  'view:setBounds': z.object({
    view: z.enum(['research', 'player', 'output']),
    x: coordinate,
    y: coordinate,
    width: z.number().finite().min(0).max(100_000),
    height: z.number().finite().min(0).max(100_000)
  }),
  'tab:select': z.object({ tab: tabId }),
  'tab:navigate': z.object({ tab: tabId, input: z.string().max(MAX_URL_LENGTH) }),
  'tab:command': z.object({ tab: tabId, command: z.enum(['back', 'forward', 'reload', 'stop', 'home']) }),
  'tab:useSelection': none,
  'program:clear': none,
  'program:lyrics': z.discriminatedUnion('command', [
    z.object({ command: z.enum(['next', 'previous']) }),
    z.object({ command: z.literal('goto'), index: z.number().int().min(0).max(10_000) })
  ]),
  'settings:update': z
    .object({
      lyricsScale: z.number().min(0.4).max(2.5),
      lyricsUppercase: z.boolean(),
      adblockEnabled: z.boolean()
    })
    .partial()
    .strict(),
  'adblock:update': none
} satisfies Record<InvokeChannel, z.ZodType>;

export type RequestOf<C extends InvokeChannel> = z.input<(typeof requestSchemas)[C]>;

/**
 * Messages from the research-tab preload. These come from pages showing
 * untrusted websites, so they are validated strictly; they can only ever
 * change what panels 2 and 3 show, never anything else.
 */
export const researchPickSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('image'),
    pickId: z.string().regex(/^[a-z0-9-]{1,64}$/i),
    src: z.string().refine(isAllowedImageUrl, 'Unsupported image URL'),
    alt: z.string().max(500),
    href: z.string().max(MAX_URL_LENGTH)
  }),
  z.object({
    type: z.literal('imageUpgrade'),
    pickId: z.string().regex(/^[a-z0-9-]{1,64}$/i),
    src: z.string().refine(isAllowedImageUrl, 'Unsupported image URL')
  }),
  z.object({ type: z.literal('video'), href: httpUrl, title: z.string().max(500) }),
  z.object({
    type: z.literal('lyrics'),
    text: z.string().max(MAX_LYRICS_TEXT),
    pageTitle: z.string().max(500),
    /** True when the operator asked for the selection (button or menu), so an empty one is reported. */
    explicit: z.boolean().optional(),
    credit: z
      .object({ title: pageText(), composer: pageText(), lyricist: pageText(), writers: pageText(), date: pageText(100) })
      .nullable()
      .optional()
  }),
  z.object({
    type: z.literal('research'),
    text: z.string().max(MAX_LYRICS_TEXT),
    /** True when the operator asked for the selection (button or menu), so an empty one is reported. */
    explicit: z.boolean(),
    page: z.object({
      url: httpUrl,
      documentTitle: pageText(),
      title: pageText(),
      siteName: pageText(),
      publisher: pageText(),
      published: pageText(100),
      modified: pageText(100),
      result: z.object({ href: httpUrl, title: pageText() }).nullable()
    })
  })
]);

export type ResearchPick = z.infer<typeof researchPickSchema>;
