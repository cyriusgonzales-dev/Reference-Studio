/**
 * IPC channel names. Kept separate from the zod schemas so the preload
 * scripts can whitelist channels without bundling validation code.
 *
 * The operator preload imports this module and the output preload imports
 * outputChannels.ts. They must not share a runtime module: Rollup would emit a
 * shared chunk, and sandboxed preloads cannot load local files.
 */

export const INVOKE_CHANNELS = [
  'app:getSnapshot',
  'app:openExternal',
  'app:openDataFolder',
  'app:clearBrowsingData',
  'app:runShortcut',
  'research:navigate',
  'research:command',
  'research:setBounds',
  'research:focus',
  'research:setMuted',
  'selection:set',
  'preview:set',
  'output:present',
  'output:clear',
  'output:restore',
  'output:window',
  'output:video',
  'output:lyrics',
  'output:image',
  'output:fallback',
  'queue:add',
  'queue:remove',
  'queue:move',
  'queue:clear',
  'queue:select',
  'queue:step',
  'queue:presentEntry',
  'queue:updateNotes',
  'lyrics:list',
  'lyrics:save',
  'lyrics:delete',
  'lyrics:duplicate',
  'lyrics:chooseBackground',
  'bookmarks:list',
  'bookmarks:add',
  'bookmarks:remove',
  'settings:get',
  'settings:update',
  'settings:resetShortcuts',
  'display:select',
  'display:identify',
  'adblock:update'
] as const;

export type InvokeChannel = (typeof INVOKE_CHANNELS)[number];

/** Main → operator UI events. */
export const EVENT_CHANNELS = ['app:snapshot', 'app:notify', 'app:shortcut', 'lyrics:changed', 'bookmarks:changed', 'settings:changed'] as const;
export type EventChannel = (typeof EVENT_CHANNELS)[number];
