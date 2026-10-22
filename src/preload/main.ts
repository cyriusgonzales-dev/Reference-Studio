import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { VrsApi } from '../shared/api';
import { EVENT_CHANNELS, INVOKE_CHANNELS } from '../shared/channels';

/**
 * Preload for the operator UI. Exposes exactly two functions: `invoke` for
 * whitelisted request channels and `on` for whitelisted event channels.
 * No Electron or Node objects are passed to the page.
 */

const invokeChannels = new Set<string>(INVOKE_CHANNELS);
const eventChannels = new Set<string>(EVENT_CHANNELS);

const api: VrsApi = {
  invoke(channel, ...args) {
    if (!invokeChannels.has(channel)) return Promise.resolve({ ok: false, error: `Unknown channel ${channel}` });
    return ipcRenderer.invoke(channel, args[0]);
  },
  on(channel, listener) {
    if (!eventChannels.has(channel)) throw new Error(`Unknown event channel ${channel}`);
    const wrapped = (_event: IpcRendererEvent, payload: unknown) => listener(payload as never);
    ipcRenderer.on(channel, wrapped);
    return () => {
      ipcRenderer.removeListener(channel, wrapped);
    };
  }
};

contextBridge.exposeInMainWorld('vrs', api);
