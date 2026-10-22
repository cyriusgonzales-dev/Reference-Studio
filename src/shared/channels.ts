/**
 * IPC channel names for the operator UI. Kept separate from the zod schemas
 * so the preload can whitelist channels without bundling validation code.
 *
 * The research preload uses researchChannels.ts instead. The two preloads must
 * not share a runtime module: Rollup would emit a shared chunk, and sandboxed
 * preloads cannot load local files.
 */

export const INVOKE_CHANNELS = [
  'app:getSnapshot',
  'app:openExternal',
  'view:setBounds',
  'tab:select',
  'tab:navigate',
  'tab:command',
  'tab:useSelection',
  'program:clear',
  'program:lyrics',
  'settings:update',
  'adblock:update'
] as const;

export type InvokeChannel = (typeof INVOKE_CHANNELS)[number];

/** Main → operator UI events. */
export const EVENT_CHANNELS = ['app:snapshot', 'app:notify', 'app:focusSearch', 'app:outputFrame'] as const;
export type EventChannel = (typeof EVENT_CHANNELS)[number];
