/** Channels between the research-tab preload and the main process (see channels.ts). */

/** Synchronous: the preload asks which tab it runs in ("images" | "youtube" | "lyrics" | "research" | ""). */
export const RESEARCH_ROLE_CHANNEL = 'research:role';
/** Fire-and-forget: something the operator clicked or highlighted. */
export const RESEARCH_PICK_CHANNEL = 'research:pick';
/** Main → research preload: report the current selection and its page's source details. */
export const RESEARCH_COLLECT_CHANNEL = 'research:collect';
