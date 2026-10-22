import { describe, expect, it } from 'vitest';
import { syncCommands, type PlayerSample } from '../src/shared/sync';

const sample = (overrides: Partial<PlayerSample> = {}): PlayerSample => ({
  paused: false,
  ended: false,
  currentTime: 10,
  volume: 1,
  muted: false,
  playbackRate: 1,
  ...overrides
});

describe('panel 3 follows panel 2', () => {
  it('does nothing when already in sync', () => {
    expect(syncCommands(sample(), sample({ currentTime: 10.2 }))).toEqual([]);
  });

  it('pauses and aligns the frame when the operator pauses', () => {
    expect(syncCommands(sample({ paused: true }), sample({ currentTime: 10.5 }))).toEqual([
      { command: 'pause' },
      { command: 'seek', value: 10 }
    ]);
  });

  it('resumes when the operator plays', () => {
    expect(syncCommands(sample(), sample({ paused: true }))).toEqual([{ command: 'play' }]);
  });

  it('re-aligns after a seek with a small lead', () => {
    const cmds = syncCommands(sample({ currentTime: 95 }), sample({ currentTime: 10 }));
    expect(cmds[0]).toEqual({ command: 'seek', value: 95.06 });
  });

  it('copies volume, mute and speed', () => {
    expect(syncCommands(sample({ volume: 0.4, muted: true, playbackRate: 1.5 }), sample())).toEqual([
      { command: 'rate', value: 1.5 },
      { command: 'volume', value: 0.4, muted: true }
    ]);
  });

  it('stops when the video ends', () => {
    expect(syncCommands(sample({ ended: true, paused: true, currentTime: 200 }), sample({ currentTime: 199.95 }))).toEqual([{ command: 'pause' }]);
  });
});
