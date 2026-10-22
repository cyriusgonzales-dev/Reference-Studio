import type { ResponseOf, VrsApi } from '../../../shared/api';
import type { InvokeChannel } from '../../../shared/channels';
import type { RequestOf } from '../../../shared/schemas';
import { notify } from './stores';

declare global {
  interface Window {
    vrs: VrsApi;
  }
}

type Args<C extends InvokeChannel> = RequestOf<C> extends undefined ? [] : [payload: RequestOf<C>];

/** Calls the main process and returns the data, throwing the error message on failure. */
export async function call<C extends InvokeChannel>(channel: C, ...args: Args<C>): Promise<ResponseOf<C>> {
  const result = await window.vrs.invoke(channel, ...args);
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

/** Fire-and-forget call for UI actions; failures are shown as notifications. */
export function run<C extends InvokeChannel>(channel: C, ...args: Args<C>): void {
  call(channel, ...args).catch((error: Error) => notify('error', error.message));
}
