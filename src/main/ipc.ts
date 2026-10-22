import { ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from 'electron';
import type { z } from 'zod';
import type { ResponseOf } from '../shared/api';
import { INVOKE_CHANNELS, type InvokeChannel } from '../shared/channels';
import { requestSchemas } from '../shared/schemas';
import type { SettingsPatch } from '../shared/settings';
import type { ShortcutAction } from '../shared/shortcuts';
import type { IpcResult, LiveLyrics, PresentableItem, Song } from '../shared/types';
import type { AppController } from './appController';
import { isAppPageUrl } from './paths';

type Payload<C extends InvokeChannel> = z.output<(typeof requestSchemas)[C]>;
type Handlers = { [C in InvokeChannel]: (payload: Payload<C>) => ResponseOf<C> | Promise<ResponseOf<C>> };

/**
 * Registers every invoke channel. Each call is:
 *  1. accepted only from the operator window's own top-level page,
 *  2. validated against its zod schema,
 *  3. answered with an { ok, data | error } envelope (errors never throw across IPC).
 */
export function registerIpc(controller: AppController, mainWindow: BrowserWindow): void {
  const c = controller;
  const handlers: Handlers = {
    'app:getSnapshot': () => c.snapshot(),
    'app:openExternal': ({ url }) => c.openExternal(url),
    'app:openDataFolder': () => c.openDataFolder(),
    'app:clearBrowsingData': () => c.clearBrowsingData(),
    'app:runShortcut': ({ action }) => c.runShortcut(action as ShortcutAction),

    'research:navigate': ({ input, mode }) => c.navigate(input, mode),
    'research:command': ({ command }) => c.research.command(command, c.getSettings().research.homeUrl),
    'research:setBounds': ({ visible, ...bounds }) => c.research.setBounds(bounds, visible),
    'research:focus': () => c.research.focus(),
    'research:setMuted': ({ muted }) => c.research.setMuted(muted),

    'selection:set': ({ item }) => c.setSelection(item as PresentableItem | null),
    'preview:set': ({ item }) => c.setPreview(item as PresentableItem | null),

    'output:present': ({ item, lyrics }) => c.present(item as PresentableItem, lyrics as LiveLyrics | undefined),
    'output:clear': () => c.output.clear(),
    'output:restore': () => c.output.restore(),
    'output:window': ({ command }) => c.output.windowCommand(command),
    'output:video': (cmd) => c.videoCommand(cmd),
    'output:lyrics': (cmd) => c.lyricsCommand(cmd),
    'output:image': (cmd) => c.output.imageCommand(cmd),
    'output:fallback': async ({ action }) => {
      const url = c.output.fallback(action);
      if (!url) return;
      if (action === 'sourcePage') c.research.navigate(url);
      else await c.openExternal(url);
    },

    'queue:add': ({ item, position, notes }) => c.addToQueue(item as PresentableItem, position, notes),
    'queue:remove': ({ id }) => c.removeFromQueue(id),
    'queue:move': ({ from, to }) => c.moveInQueue(from, to),
    'queue:clear': () => c.clearQueue(),
    'queue:select': ({ id }) => c.selectQueueEntry(id),
    'queue:step': ({ direction }) => c.stepQueue(direction),
    'queue:presentEntry': ({ id }) => c.presentQueueEntry(id),
    'queue:updateNotes': ({ id, notes }) => c.updateQueueNotes(id, notes),

    'lyrics:list': () => c.listSongs(),
    'lyrics:save': ({ song }) => c.saveSong(song as Song),
    'lyrics:delete': ({ id }) => c.deleteSong(id),
    'lyrics:duplicate': ({ id }) => c.duplicateSong(id),
    'lyrics:chooseBackground': () => c.chooseLyricsBackground(),

    'bookmarks:list': () => c.listBookmarks(),
    'bookmarks:add': ({ title, url }) => c.addBookmark(title, url),
    'bookmarks:remove': ({ id }) => c.removeBookmark(id),

    'settings:get': () => c.getSettings(),
    'settings:update': ({ patch }) => c.updateSettings(patch as SettingsPatch),
    'settings:resetShortcuts': ({ action }) => c.resetShortcuts(action as ShortcutAction | undefined),

    'display:select': ({ displayId }) => c.selectDisplay(displayId),
    'display:identify': () => c.identifyDisplays(),

    'adblock:update': () => c.updateFilterLists()
  };

  const isTrusted = (event: IpcMainInvokeEvent): boolean =>
    !mainWindow.isDestroyed() &&
    event.sender === mainWindow.webContents &&
    !!event.senderFrame &&
    event.senderFrame === mainWindow.webContents.mainFrame &&
    isAppPageUrl(event.senderFrame.url, 'index');

  for (const channel of INVOKE_CHANNELS) {
    ipcMain.handle(channel, async (event, payload: unknown): Promise<IpcResult<unknown>> => {
      if (!isTrusted(event)) return { ok: false, error: 'Request rejected: untrusted sender.' };
      const parsed = requestSchemas[channel].safeParse(payload);
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        return { ok: false, error: `Invalid request for ${channel}: ${issue?.path.join('.') || 'payload'} ${issue?.message ?? ''}`.trim() };
      }
      try {
        const handler = handlers[channel] as (p: unknown) => unknown;
        const data = await handler(parsed.data);
        return { ok: true, data: data ?? null };
      } catch (error) {
        return { ok: false, error: (error as Error).message || 'Unexpected error.' };
      }
    });
  }
}
