import type { EventChannel, InvokeChannel } from './channels';
import type { RequestOf } from './schemas';
import type { Settings } from './settings';
import type { ShortcutAction } from './shortcuts';
import type { AppSnapshot, Bookmark, ImageView, IpcResult, LyricsStyle, NotifyLevel, OutputStatus, QueueEntry, Song } from './types';

/** Response types for invoke channels; channels not listed resolve to void. */
export interface ResponseMap {
  'app:getSnapshot': AppSnapshot;
  'queue:add': QueueEntry;
  'lyrics:list': Song[];
  'lyrics:save': Song;
  'lyrics:duplicate': Song;
  'lyrics:chooseBackground': string | null;
  'bookmarks:list': Bookmark[];
  'bookmarks:add': Bookmark;
  'settings:get': Settings;
  'settings:update': Settings;
  'settings:resetShortcuts': Settings;
}

export type ResponseOf<C extends InvokeChannel> = C extends keyof ResponseMap ? ResponseMap[C] : void;

export interface EventPayloads {
  'app:snapshot': AppSnapshot;
  'app:notify': { level: NotifyLevel; message: string };
  'app:shortcut': { action: ShortcutAction };
  'lyrics:changed': Song[];
  'bookmarks:changed': Bookmark[];
  'settings:changed': Settings;
}

type InvokeArgs<C extends InvokeChannel> = RequestOf<C> extends undefined ? [] : [payload: RequestOf<C>];

/** API exposed to the operator UI as `window.vrs`. */
export interface VrsApi {
  invoke<C extends InvokeChannel>(channel: C, ...args: InvokeArgs<C>): Promise<IpcResult<ResponseOf<C>>>;
  on<E extends EventChannel>(channel: E, listener: (payload: EventPayloads[E]) => void): () => void;
}

/** What the Presentation Output renderer needs to draw. Video is drawn by a separate view on top. */
export interface OutputRenderState {
  status: OutputStatus;
  token: number;
  transitionMs: number;
  image: { url: string; view: ImageView; background: string } | null;
  lyrics: { text: string; index: number; style: LyricsStyle } | null;
}

/** API exposed to the Presentation Output renderer as `window.vrsOutput`. */
export interface OutputApi {
  onRender(listener: (state: OutputRenderState) => void): () => void;
  ready(): void;
  imageResult(result: { token: number; ok: boolean; message?: string }): void;
}
