import type { BrowserWindow, Session } from 'electron';
import { initialProgram, reduceProgram, type ProgramEvent } from '../../shared/program';
import { syncCommands } from '../../shared/sync';
import type { Playback, ProgramState, Rect } from '../../shared/types';
import { OFFSCREEN_LAYOUT } from '../output/offscreenOutput';
import { preloadPath } from '../paths';
import { describeYouTubeError, OffscreenYouTube, YouTubeView } from './youtubeView';

/**
 * Owns what panel 2 (player) and panel 3 (vMix output) show.
 *
 * Images and lyrics are drawn from the program state (panel 2 by the operator
 * UI, the output by the offscreen output page). A video uses two YouTube
 * players: panel 2 is the operator's player with YouTube's own controls
 * (muted, so there is no double audio); the output player renders offscreen
 * for NDI, shows only the video picture and carries the sound. Every 250 ms
 * the output player is re-aligned to panel 2 (play/pause, position, volume, speed).
 */

const SYNC_INTERVAL_MS = 250;
const LOAD_TIMEOUT_MS = 25_000;

export interface ProgramHost {
  onChange(): void;
  onKey(input: Electron.Input): boolean;
  /** The offscreen output player window appeared (video) or went away. */
  onOutputVideo(window: BrowserWindow | null): void;
}

export class ProgramController {
  private state: ProgramState = initialProgram();
  private playbackValue: Playback | null = null;
  private player: YouTubeView | null = null;
  private output: OffscreenYouTube | null = null;
  /** Identifies the loaded video views ("videoId:mode:rev"). */
  private loadedKey: string | null = null;
  private syncTimer: NodeJS.Timeout | null = null;
  private loadTimer: NodeJS.Timeout | null = null;
  private syncing = false;
  private playerBounds: Rect = { x: 0, y: 0, width: 0, height: 0 };
  private outputBounds: Rect = { x: 0, y: 0, width: 0, height: 0 };

  constructor(
    private readonly host: BrowserWindow,
    private readonly mediaSession: Session,
    private readonly callbacks: ProgramHost
  ) {}

  get program(): ProgramState {
    return this.state;
  }

  get playback(): Playback | null {
    return this.playbackValue;
  }

  get outputRect(): Rect {
    return this.outputBounds;
  }

  dispatch(event: ProgramEvent): void {
    const next = reduceProgram(this.state, event);
    if (next === this.state) return;
    this.state = next;
    this.applyEffects();
    this.callbacks.onChange();
  }

  setBounds(view: 'player' | 'output', rect: Rect): void {
    if (view === 'player') {
      this.playerBounds = rect;
      this.player?.setBounds(rect);
    } else {
      // Panel 3 only previews the offscreen output; its position is kept for vMix crop values.
      this.outputBounds = rect;
    }
  }

  /** Creates or releases the two video players to match the program state. */
  private applyEffects(): void {
    const s = this.state;
    const key = s.kind === 'video' && s.status !== 'error' ? `${s.videoId}:${s.mode}:${s.rev}` : null;
    if (key === this.loadedKey) return;
    this.releaseVideo();
    if (!key || s.kind !== 'video') return;

    this.loadedKey = key;
    const rev = s.rev;
    const fail = (message: string) => this.dispatch({ type: 'videoFailed', rev, message });
    this.player = new YouTubeView(
      this.host,
      this.mediaSession,
      { role: 'player', audible: false, onKey: this.callbacks.onKey, onLoadFailed: fail },
      s.videoId,
      s.startSeconds,
      s.mode,
      this.playerBounds
    );
    this.output = new OffscreenYouTube(
      this.mediaSession,
      { role: 'output', audible: true, onKey: this.callbacks.onKey, onLoadFailed: fail },
      s.videoId,
      s.startSeconds,
      s.mode,
      OFFSCREEN_LAYOUT,
      preloadPath('audioTap')
    );
    this.callbacks.onOutputVideo(this.output.window);
    this.playbackValue = { playing: false, currentTime: 0, duration: 0 };
    this.syncTimer = setInterval(() => void this.syncTick(rev), SYNC_INTERVAL_MS);
    this.loadTimer = setTimeout(() => {
      if (this.state.kind === 'video' && this.state.rev === rev && this.state.status === 'loading') {
        fail('The video did not start within 25 seconds. YouTube may be slow or blocked; try turning ad blocking off.');
      }
    }, LOAD_TIMEOUT_MS);
  }

  private async syncTick(rev: number): Promise<void> {
    if (this.syncing || !this.player || !this.output) return;
    this.syncing = true;
    try {
      const [master, slave] = await Promise.all([this.player.probe(), this.output.probe()]);
      if (this.state.kind !== 'video' || this.state.rev !== rev || !master) return;

      if (master.errorText) {
        this.dispatch({ type: 'videoFailed', rev, message: describeYouTubeError(master.errorText) });
        return;
      }
      if (!master.hasVideo) return;
      if (this.state.status === 'loading' && (master.readyState >= 2 || !master.paused)) this.dispatch({ type: 'videoReady', rev });

      const playback: Playback = { playing: !master.paused && !master.ended, currentTime: master.currentTime, duration: master.duration };
      const prev = this.playbackValue;
      this.playbackValue = playback;
      if (!prev || prev.playing !== playback.playing || Math.abs(prev.currentTime - playback.currentTime) >= 1 || prev.duration !== playback.duration) {
        this.callbacks.onChange();
      }

      if (slave?.hasVideo && slave.readyState >= 1) {
        for (const cmd of syncCommands(master, slave)) await this.output.run(cmd);
      }
    } finally {
      this.syncing = false;
    }
  }

  private releaseVideo(): void {
    if (this.syncTimer) clearInterval(this.syncTimer);
    if (this.loadTimer) clearTimeout(this.loadTimer);
    this.syncTimer = null;
    this.loadTimer = null;
    if (this.output) this.callbacks.onOutputVideo(null);
    this.player?.destroy();
    this.output?.destroy();
    this.player = null;
    this.output = null;
    this.loadedKey = null;
    this.playbackValue = null;
  }

  destroy(): void {
    this.releaseVideo();
  }
}
