/** IPC channels between the main process and the Presentation Output page (see channels.ts). */

/** Main → Presentation Output renderer. */
export const OUTPUT_RENDER_CHANNEL = 'outputwin:render';
/** Presentation Output renderer → main (fire-and-forget). */
export const OUTPUT_READY_CHANNEL = 'outputwin:ready';
export const OUTPUT_IMAGE_RESULT_CHANNEL = 'outputwin:imageResult';
