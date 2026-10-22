import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { OutputApi, OutputRenderState } from '../shared/api';
import { OUTPUT_IMAGE_RESULT_CHANNEL, OUTPUT_READY_CHANNEL, OUTPUT_RENDER_CHANNEL } from '../shared/outputChannels';

/** Preload for the Presentation Output page: receive render state, report image load results. */

const api: OutputApi = {
  onRender(listener) {
    const wrapped = (_event: IpcRendererEvent, state: OutputRenderState) => listener(state);
    ipcRenderer.on(OUTPUT_RENDER_CHANNEL, wrapped);
    return () => {
      ipcRenderer.removeListener(OUTPUT_RENDER_CHANNEL, wrapped);
    };
  },
  ready() {
    ipcRenderer.send(OUTPUT_READY_CHANNEL);
  },
  imageResult(result) {
    ipcRenderer.send(OUTPUT_IMAGE_RESULT_CHANNEL, {
      token: Number(result.token),
      ok: result.ok === true,
      ...(typeof result.message === 'string' ? { message: result.message.slice(0, 500) } : {})
    });
  }
};

contextBridge.exposeInMainWorld('vrsOutput', api);
