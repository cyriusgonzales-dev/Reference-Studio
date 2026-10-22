import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { OUTPUT_READY_CHANNEL, OUTPUT_RENDER_CHANNEL, type OutputPageApi, type OutputPageState } from '../shared/outputPage';

/** Preload for the offscreen output page: receive what to draw, nothing else. */
const api: OutputPageApi = {
  onRender(listener) {
    ipcRenderer.on(OUTPUT_RENDER_CHANNEL, (_e: IpcRendererEvent, state: OutputPageState) => listener(state));
  },
  ready() {
    ipcRenderer.send(OUTPUT_READY_CHANNEL);
  }
};

contextBridge.exposeInMainWorld('vrsOutput', api);
