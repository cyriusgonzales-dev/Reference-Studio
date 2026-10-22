import { useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  ExternalLink,
  Maximize,
  Minimize,
  MonitorPlay,
  Pause,
  Play,
  RotateCcw,
  Square,
  Undo2,
  Volume2,
  VolumeX,
  ZoomIn,
  ZoomOut
} from 'lucide-react';
import type { AppSnapshot } from '../../../shared/types';
import { run } from '../lib/api';
import { formatTime, itemThumbnail, KIND_LABEL, STATUS_LABEL } from '../lib/format';
import { LyricsStage } from './LyricsStage';

function StatusChip({ snap }: { snap: AppSnapshot }) {
  const { status } = snap.output;
  const cls = status === 'ERROR' ? 'chip err' : status === 'EMPTY' ? 'chip' : 'chip live';
  return (
    <span className={cls}>
      <span className="dot" />
      {STATUS_LABEL[status]}
    </span>
  );
}

/** Mirrors what the audience sees. Dragging pans a zoomed image. */
function LiveMonitor({ snap }: { snap: AppSnapshot }) {
  const { output } = snap;
  const drag = useRef<{ x: number; y: number } | null>(null);
  const zoomed = (output.status === 'IMAGE' || output.status === 'LOADING_IMAGE') && output.imageView.mode !== 'fit';

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!zoomed) return;
    drag.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const start = drag.current;
    drag.current = null;
    if (!start || !zoomed) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const dx = -((e.clientX - start.x) / rect.width) * 2;
    const dy = -((e.clientY - start.y) / rect.height) * 2;
    if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) run('output:image', { command: 'pan', dx, dy });
  };

  let body: React.ReactNode;
  switch (output.status) {
    case 'IMAGE':
    case 'LOADING_IMAGE':
      body = output.imageUrl ? <img className="fit" src={output.imageUrl} alt="" referrerPolicy="no-referrer" /> : null;
      break;
    case 'VIDEO':
    case 'LOADING_VIDEO':
      body =
        output.item?.kind === 'video' ? (
          <img className="fit" src={itemThumbnail(output.item) ?? ''} alt="" referrerPolicy="no-referrer" />
        ) : null;
      break;
    case 'LYRICS':
      body = output.lyrics ? (
        <LyricsStage text={output.lyrics.slides[output.lyrics.index] ?? ''} style={snap.settings.lyrics} aspect={16 / 9} />
      ) : null;
      break;
    case 'ERROR':
      body = <div className="center-msg error-text">Output is black — {output.error?.message}</div>;
      break;
    default:
      body = <div className="center-msg">Black (output cleared)</div>;
  }

  return (
    <div
      className={`monitor ${output.status === 'EMPTY' ? '' : 'live'}`}
      style={{ cursor: zoomed ? 'grab' : 'default' }}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      title={zoomed ? 'Drag to pan the zoomed image' : undefined}
    >
      {body}
      {output.status === 'LOADING_IMAGE' || output.status === 'LOADING_VIDEO' ? (
        <div className="video-badge chip warn">Loading…</div>
      ) : output.status === 'VIDEO' ? (
        <div className="video-badge chip live">{output.video?.playing ? 'Playing' : 'Paused'}</div>
      ) : null}
    </div>
  );
}

function VideoControls({ snap }: { snap: AppSnapshot }) {
  const video = snap.output.video;
  const [seekValue, setSeekValue] = useState<number | null>(null);
  const [volume, setVolume] = useState<number | null>(null);
  if (!video) return null;
  const duration = video.duration || 0;
  const time = seekValue ?? video.currentTime;
  const ready = snap.output.status === 'VIDEO';

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div className="btn-row">
        <button className="btn icon" title={video.playing ? 'Pause' : 'Play'} disabled={!ready} onClick={() => run('output:video', { command: 'toggle' })}>
          {video.playing ? <Pause size={16} /> : <Play size={16} />}
        </button>
        <button className="btn sm" disabled={!ready} title="Back 10 seconds" onClick={() => run('output:video', { command: 'seekBy', value: -10 })}>
          −10s
        </button>
        <button className="btn sm" disabled={!ready} title="Forward 10 seconds" onClick={() => run('output:video', { command: 'seekBy', value: 10 })}>
          +10s
        </button>
        <button className="btn sm icon" disabled={!ready} title="Restart" onClick={() => run('output:video', { command: 'restart' })}>
          <RotateCcw size={14} />
        </button>
        <button className="btn sm icon" disabled={!ready} title="Stop (pause at start)" onClick={() => run('output:video', { command: 'stop' })}>
          <Square size={13} />
        </button>
        <span className="time" style={{ marginLeft: 'auto' }}>
          {formatTime(time)} / {formatTime(duration)}
        </span>
      </div>
      <input
        className="range"
        type="range"
        min={0}
        max={Math.max(1, duration)}
        step={0.5}
        value={Math.min(time, Math.max(1, duration))}
        disabled={!ready || duration <= 0}
        aria-label="Seek"
        onChange={(e) => setSeekValue(Number(e.target.value))}
        onPointerUp={() => {
          if (seekValue !== null) run('output:video', { command: 'seek', value: seekValue });
          setSeekValue(null);
        }}
        onKeyUp={() => {
          if (seekValue !== null) run('output:video', { command: 'seek', value: seekValue });
          setSeekValue(null);
        }}
      />
      <div className="btn-row" style={{ flexWrap: 'nowrap' }}>
        <button
          className="btn sm icon"
          disabled={!ready}
          title={video.muted ? 'Unmute' : 'Mute'}
          onClick={() => run('output:video', { command: video.muted ? 'unmute' : 'mute' })}
        >
          {video.muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
        </button>
        <input
          className="range"
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={volume ?? (video.muted ? 0 : video.volume)}
          disabled={!ready}
          aria-label="Volume"
          onChange={(e) => {
            const v = Number(e.target.value);
            setVolume(v);
            run('output:video', { command: 'volume', value: v });
          }}
          onPointerUp={() => setVolume(null)}
        />
      </div>
      {video.usingWatchPage ? <div className="small warn-text">Using the YouTube watch page fallback.</div> : null}
    </div>
  );
}

function ImageControls() {
  return (
    <div className="btn-row">
      <button className="btn sm icon" title="Zoom out" onClick={() => run('output:image', { command: 'out' })}>
        <ZoomOut size={14} />
      </button>
      <button className="btn sm icon" title="Zoom in" onClick={() => run('output:image', { command: 'in' })}>
        <ZoomIn size={14} />
      </button>
      <button className="btn sm" title="Fit to screen (default)" onClick={() => run('output:image', { command: 'fit' })}>
        Fit
      </button>
      <button className="btn sm" title="Actual size (1:1 pixels)" onClick={() => run('output:image', { command: 'actual' })}>
        1:1
      </button>
      <span style={{ flex: 1 }} />
      <button className="btn sm icon" title="Pan left" onClick={() => run('output:image', { command: 'pan', dx: -0.25, dy: 0 })}>
        <ArrowLeft size={13} />
      </button>
      <button className="btn sm icon" title="Pan up" onClick={() => run('output:image', { command: 'pan', dx: 0, dy: -0.25 })}>
        <ArrowUp size={13} />
      </button>
      <button className="btn sm icon" title="Pan down" onClick={() => run('output:image', { command: 'pan', dx: 0, dy: 0.25 })}>
        <ArrowDown size={13} />
      </button>
      <button className="btn sm icon" title="Pan right" onClick={() => run('output:image', { command: 'pan', dx: 0.25, dy: 0 })}>
        <ArrowRight size={13} />
      </button>
    </div>
  );
}

function LyricsControls({ snap, onOpenSong }: { snap: AppSnapshot; onOpenSong: (songId: string) => void }) {
  const lyrics = snap.output.lyrics;
  if (!lyrics) return null;
  const next = lyrics.slides[lyrics.index + 1];
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div className="btn-row">
        <button className="btn icon" title="Previous slide" disabled={lyrics.index === 0} onClick={() => run('output:lyrics', { command: 'previous' })}>
          <ChevronLeft size={16} />
        </button>
        <span className="time">
          Slide {lyrics.index + 1} / {lyrics.slides.length}
        </span>
        <button
          className="btn icon"
          title="Next slide"
          disabled={lyrics.index >= lyrics.slides.length - 1}
          onClick={() => run('output:lyrics', { command: 'next' })}
        >
          <ChevronRight size={16} />
        </button>
        <span style={{ flex: 1 }} />
        <button className="btn sm" onClick={() => onOpenSong(lyrics.songId)}>
          Open song
        </button>
      </div>
      <div className="small faint ellipsis" title={next}>
        Next: {next ? next.split('\n')[0] : '— end of song —'}
      </div>
    </div>
  );
}

function ErrorControls({ snap }: { snap: AppSnapshot }) {
  const error = snap.output.error;
  if (!error) return null;
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div className="small error-text">{error.message}</div>
      {error.detail && error.detail !== error.message ? <div className="small faint">{error.detail}</div> : null}
      <div className="btn-row">
        <button className="btn sm" onClick={() => run('output:fallback', { action: 'retry' })}>
          Retry
        </button>
        {error.thumbnailUrl ? (
          <button className="btn sm" onClick={() => run('output:fallback', { action: 'thumbnail' })}>
            Present preview-size image
          </button>
        ) : null}
        {error.canTryWatchPage ? (
          <button className="btn sm" onClick={() => run('output:fallback', { action: 'watchPage' })}>
            Try YouTube watch page
          </button>
        ) : null}
        {error.sourcePageUrl ? (
          <button className="btn sm" onClick={() => run('output:fallback', { action: 'sourcePage' })}>
            Open source page
          </button>
        ) : null}
        {error.externalUrl ? (
          <button className="btn sm" onClick={() => run('output:fallback', { action: 'openExternal' })}>
            <ExternalLink size={13} /> Open in browser
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** Seconds since the current item went live; resets whenever new content is presented. */
function useElapsedSeconds(token: number, running: boolean): number {
  const [state, setState] = useState({ token, seconds: 0 });
  useEffect(() => {
    if (!running) return;
    const t = window.setInterval(() => setState((s) => (s.token === token ? { token, seconds: s.seconds + 1 } : { token, seconds: 1 })), 1000);
    return () => window.clearInterval(t);
  }, [token, running]);
  return state.token === token ? state.seconds : 0;
}

export function LivePanel({ snap, onOpenSong }: { snap: AppSnapshot; onOpenSong: (songId: string) => void }) {
  const { output, outputWindow } = snap;
  const elapsed = useElapsedSeconds(output.token, output.status !== 'EMPTY');

  const windowLine = !outputWindow.exists
    ? 'Output window is not open.'
    : !outputWindow.visible
      ? 'Output window is hidden (content keeps running).'
      : `${outputWindow.fullscreen ? 'Full screen' : 'Windowed'} on ${outputWindow.displayLabel ?? 'display'}`;

  return (
    <section className="panel" aria-label="Live output">
      <div className="panel-head">
        <span className="section-title" style={{ color: 'var(--live)' }}>
          Live output
        </span>
        <StatusChip snap={snap} />
        <span className="spacer" />
        <button className="btn sm icon" title="Open the Presentation Output on its display" onClick={() => run('output:window', { command: 'open' })}>
          <MonitorPlay size={14} />
        </button>
        <button
          className="btn sm icon"
          title={outputWindow.visible ? 'Hide output window' : 'Show output window'}
          onClick={() => run('output:window', { command: outputWindow.visible ? 'hide' : 'show' })}
        >
          {outputWindow.visible ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
        <button className="btn sm icon" title="Toggle full screen" onClick={() => run('output:window', { command: 'toggleFullscreen' })}>
          {outputWindow.fullscreen ? <Minimize size={14} /> : <Maximize size={14} />}
        </button>
      </div>

      <LiveMonitor snap={snap} />

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '8px 0' }}>
        <div className="ellipsis" style={{ flex: 1 }}>
          {output.item ? (
            <>
              <span className="badge live" style={{ marginRight: 6 }}>
                {KIND_LABEL[output.item.kind]}
              </span>
              <span title={output.item.title}>{output.item.title}</span>
            </>
          ) : (
            <span className="faint">Nothing is live</span>
          )}
        </div>
        {output.status !== 'EMPTY' ? <span className="time">{formatTime(elapsed)}</span> : null}
      </div>
      <div className={`small ${outputWindow.exists && outputWindow.visible ? 'faint' : 'warn-text'}`} style={{ marginBottom: 8 }}>
        {windowLine}
        {outputWindow.usingFallbackDisplay ? ' — preferred display unavailable.' : ''}
      </div>

      {output.status === 'VIDEO' || output.status === 'LOADING_VIDEO' ? <VideoControls snap={snap} /> : null}
      {output.status === 'IMAGE' || output.status === 'LOADING_IMAGE' ? <ImageControls /> : null}
      {output.status === 'LYRICS' ? <LyricsControls snap={snap} onOpenSong={onOpenSong} /> : null}
      {output.status === 'ERROR' ? <ErrorControls snap={snap} /> : null}

      <div className="btn-row" style={{ marginTop: 10 }}>
        <button
          className="btn live"
          style={{ flex: 1 }}
          disabled={output.status === 'EMPTY'}
          onClick={() => run('output:clear')}
          title="Clear the output to black (queue and saved content are kept)"
        >
          Clear to black
        </button>
        <button
          className="btn"
          disabled={output.status !== 'EMPTY' || !output.restorable}
          onClick={() => run('output:restore')}
          title={output.restorable ? `Restore “${output.restorable.item.title}”` : 'Nothing to restore'}
        >
          <Undo2 size={14} /> Restore
        </button>
      </div>
    </section>
  );
}
