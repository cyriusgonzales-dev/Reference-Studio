/**
 * Keeps the vMix output player (panel 3) in step with the operator's player
 * (panel 2). Panel 2 is the master: whatever the operator does there with
 * YouTube's own controls is copied to panel 3. Pure, so it can be unit tested.
 */

export interface PlayerSample {
  paused: boolean;
  ended: boolean;
  currentTime: number;
  volume: number;
  muted: boolean;
  playbackRate: number;
}

export type SlaveCommand =
  | { command: 'play' }
  | { command: 'pause' }
  | { command: 'seek'; value: number }
  | { command: 'volume'; value: number; muted: boolean }
  | { command: 'rate'; value: number };

/** Allowed drift while playing before panel 3 is re-aligned (seconds). */
export const PLAYING_DRIFT_TOLERANCE = 0.35;
/** Allowed drift while paused (a paused frame should match exactly). */
export const PAUSED_DRIFT_TOLERANCE = 0.08;
/** Seeking takes a moment; aim slightly ahead so panel 3 lands in sync. */
export const SEEK_LEAD = 0.06;

export function syncCommands(master: PlayerSample, slave: PlayerSample): SlaveCommand[] {
  const commands: SlaveCommand[] = [];
  const masterStopped = master.paused || master.ended;
  const slaveStopped = slave.paused || slave.ended;

  if (Math.abs(master.playbackRate - slave.playbackRate) > 0.01) commands.push({ command: 'rate', value: master.playbackRate });

  const drift = Math.abs(master.currentTime - slave.currentTime);
  if (masterStopped) {
    if (!slaveStopped) commands.push({ command: 'pause' });
    if (drift > PAUSED_DRIFT_TOLERANCE) commands.push({ command: 'seek', value: master.currentTime });
  } else {
    if (drift > PLAYING_DRIFT_TOLERANCE) commands.push({ command: 'seek', value: master.currentTime + SEEK_LEAD * master.playbackRate });
    if (slaveStopped) commands.push({ command: 'play' });
  }

  if (Math.abs(master.volume - slave.volume) > 0.01 || master.muted !== slave.muted) {
    commands.push({ command: 'volume', value: master.volume, muted: master.muted });
  }
  return commands;
}
