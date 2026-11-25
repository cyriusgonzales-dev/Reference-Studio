import { ipcMain, shell, type BrowserWindow, type IpcMainInvokeEvent } from 'electron';
import type { z } from 'zod';
import type { ResponseOf } from '../shared/api';
import { INVOKE_CHANNELS, SETTINGS_WINDOW_CHANNELS, type InvokeChannel } from '../shared/channels';
import { requestSchemas } from '../shared/schemas';
import type { IpcResult } from '../shared/types';
import type { Controller } from './controller';
import { logsDirectory } from './logging';
import { isAppPageUrl } from './paths';

type Payload<C extends InvokeChannel> = z.output<(typeof requestSchemas)[C]>;
type Handlers = { [C in InvokeChannel]: (payload: Payload<C>) => ResponseOf<C> | Promise<ResponseOf<C>> };

/**
 * Registers every request channel of the operator UI. Each call is:
 *  1. accepted only from the operator window's own top-level page (or, for a
 *     small subset, the Settings window's page),
 *  2. validated against its zod schema,
 *  3. answered with an { ok, data | error } envelope (errors never throw across IPC).
 */
export function registerIpc(c: Controller, window: BrowserWindow): void {
  const handlers: Handlers = {
    'app:getSnapshot': () => c.snapshot(),
    'app:openExternal': ({ url }) => shell.openExternal(url),
    'view:setBounds': ({ view, ...rect }) => {
      if (view === 'research') c.tabs.setBounds(rect);
      else c.program.setBounds(view, rect);
      if (view === 'output') c.scheduleBroadcast();
    },
    'tab:select': ({ tab }) => c.selectTab(tab),
    'tab:navigate': ({ tab, input }) => {
      c.tabs.searchAll(tab, input);
      c.tabs.webContents(tab)?.focus();
    },
    'tab:command': ({ tab, command }) => c.tabs.command(tab, command),
    'tab:useSelection': () => c.useSelection(),
    'program:clear': () => c.program.dispatch({ type: 'clear' }),
    'program:lyrics': (cmd) =>
      c.program.dispatch(cmd.command === 'goto' ? { type: 'lyricsGoto', index: cmd.index } : { type: 'lyricsStep', delta: cmd.command === 'next' ? 1 : -1 }),
    'settings:update': (patch) => c.updateSettings(patch),
    'adblock:update': async () => {
      await c.adblock.update();
      const status = c.adblock.status();
      if (status.error) throw new Error(status.error);
    },
    'app:openSettings': (payload) => c.settingsWindow.open(payload?.section),
    'app:openLogs': async () => {
      const error = await shell.openPath(logsDirectory());
      if (error) throw new Error(error);
    },
    'update:check': () => c.updates.check(true),
    'update:download': () => c.updates.download(),
    'update:install': () => c.updates.install()
  };

  const settingsChannels = new Set<InvokeChannel>(SETTINGS_WINDOW_CHANNELS);

  const isTrusted = (event: IpcMainInvokeEvent, channel: InvokeChannel): boolean => {
    const frame = event.senderFrame;
    if (!frame || frame !== event.sender.mainFrame) return false;
    if (!window.isDestroyed() && event.sender === window.webContents) return isAppPageUrl(frame.url, 'index');
    const settings = c.settingsWindow.webContents;
    return !!settings && event.sender === settings && settingsChannels.has(channel) && isAppPageUrl(frame.url, 'settings');
  };

  for (const channel of INVOKE_CHANNELS) {
    ipcMain.handle(channel, async (event, payload: unknown): Promise<IpcResult<unknown>> => {
      if (!isTrusted(event, channel)) return { ok: false, error: 'Request rejected: untrusted sender.' };
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
