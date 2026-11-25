import type { EventChannel, InvokeChannel } from './channels';
import type { RequestOf } from './schemas';
import type { AppSnapshot, IpcResult, NotifyLevel } from './types';

/** Response types for invoke channels; channels not listed resolve to void. */
export interface ResponseMap {
  'app:getSnapshot': AppSnapshot;
}

export type ResponseOf<C extends InvokeChannel> = C extends keyof ResponseMap ? ResponseMap[C] : void;

export interface EventPayloads {
  'app:snapshot': AppSnapshot;
  'app:notify': { level: NotifyLevel; message: string };
  'app:focusSearch': null;
  /** JPEG preview of the NDI output for panel 3. */
  'app:outputFrame': Uint8Array;
  /** Settings window: show this section. */
  'app:settingsSection': 'general' | 'slides' | 'updates' | 'about';
}

type InvokeArgs<C extends InvokeChannel> = RequestOf<C> extends undefined ? [] : [payload: RequestOf<C>];

/** API exposed to the operator UI as `window.vrs`. */
export interface VrsApi {
  invoke<C extends InvokeChannel>(channel: C, ...args: InvokeArgs<C>): Promise<IpcResult<ResponseOf<C>>>;
  on<E extends EventChannel>(channel: E, listener: (payload: EventPayloads[E]) => void): () => void;
}
