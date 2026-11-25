import { useRef } from 'react';
import { ChevronLeft, ChevronRight, ExternalLink, Minus, Plus, Square } from 'lucide-react';
import { formatSourceLine, type ResearchSource } from '../../../shared/research';
import type { AppSnapshot } from '../../../shared/types';
import { youtubeWatchUrl } from '../../../shared/urls';
import { run } from '../lib/api';
import { formatTime } from '../lib/format';
import { useResolvedImage, useViewBounds } from '../lib/hooks';
import { OutputPreview } from './OutputPreview';
import { Stage } from './Stage';

/** Panel 2 (player, with controls) and panel 3 (clean vMix output) stacked on the right. */
export function OutputPanels({ snap }: { snap: AppSnapshot }) {
  const playerRef = useRef<HTMLDivElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);
  useViewBounds(playerRef, 'player');
  useViewBounds(outputRef, 'output');
  const image = useResolvedImage(snap.program);
  const p = snap.program;
  const capture = snap.capture;

  return (
    <section className="output-column">
      <div className="panel-head">
        <span className="panel-num">2</span>
        <span className="panel-title">Player</span>
        <span className="ellipsis grow muted" title={p.kind === 'empty' ? '' : p.title}>
          {p.kind === 'empty' ? 'Nothing selected' : p.title}
        </span>
        <button className="btn sm danger" title={`Clear panels 2 and 3 to black (${snap.platform === 'darwin' ? '⇧⌘B' : 'Ctrl+Shift+B'})`} disabled={p.kind === 'empty'} onClick={() => run('program:clear')}>
          <Square size={12} /> Black
        </button>
      </div>
      <div ref={playerRef} className="stage">
        <Stage snap={snap} imageSrc={image.src} clean={false} />
      </div>
      <Controls snap={snap} imageFailed={image.failed} />

      <div className="panel-head output-head">
        <span className="panel-num live">3</span>
        <span className="panel-title">vMix output</span>
        <NdiBadge snap={snap} />
      </div>
      <div
        ref={outputRef}
        className="stage output"
        title={capture ? `Desktop Capture alternative — ${capture.displayName} crop: X ${capture.displayCrop.x}, Y ${capture.displayCrop.y}, ${capture.displayCrop.width}×${capture.displayCrop.height}` : undefined}
      >
        <OutputPreview />
      </div>
    </section>
  );
}

/** NDI status for panel 3: the source name vMix lists and how many receivers are connected. */
function NdiBadge({ snap }: { snap: AppSnapshot }) {
  const ndi = snap.ndi;
  if (ndi.state === 'running') {
    return (
      <span className="ellipsis grow small" title="In vMix: Add Input → NDI / Desktop Capture → choose this source">
        <span className={`chip ${ndi.connections > 0 ? 'live' : ''}`}>NDI</span>{' '}
        <span className="muted">{ndi.sourceName}</span>{' '}
        <span className="faint">· {ndi.connections > 0 ? `${ndi.connections} receiving` : 'waiting for vMix'}</span>
      </span>
    );
  }
  return (
    <span className={`ellipsis grow small ${ndi.state === 'starting' ? 'faint' : 'error-text'}`} title={ndi.message ?? undefined}>
      {ndi.state === 'starting' ? 'Starting NDI…' : ndi.message}
    </span>
  );
}

const TRUST_LABELS: Record<ResearchSource['trust'], { label: string; className: string; hint: string }> = {
  official: { label: 'Official source', className: 'ok', hint: 'A government, university, scientific or established news/reference site.' },
  user: { label: 'Check source', className: 'warn', hint: 'Anyone can publish or edit on this site. Confirm the text with an official source.' },
  unknown: { label: 'Verify source', className: '', hint: 'Not a site the app recognises. Make sure it is reliable before showing it.' }
};

/** Research slides: where the text comes from, how far the site can be trusted, and a link to check it. */
function SourceRow({ source }: { source: ResearchSource }) {
  const trust = TRUST_LABELS[source.trust];
  return (
    <div className="controls source-row">
      <span className={`chip ${trust.className}`} title={trust.hint}>
        {trust.label}
      </span>
      <span className="ellipsis grow small muted" title={`${formatSourceLine(source)}\n${source.url}`}>
        {source.fromSearchPage ? 'From a Google snippet · ' : ''}
        {new URL(source.url).hostname}
      </span>
      <button className="btn sm" title="Open the source page in your browser to check the text" onClick={() => run('app:openExternal', { url: source.url })}>
        <ExternalLink size={13} /> Open source
      </button>
    </div>
  );
}

function Controls({ snap, imageFailed }: { snap: AppSnapshot; imageFailed: boolean }) {
  const p = snap.program;
  if (p.kind === 'lyrics') {
    const next = p.slides[p.index + 1];
    const slideControls = (
      <div className="controls">
        <button className="btn icon" title="Previous slide (←)" disabled={p.index === 0} onClick={() => run('program:lyrics', { command: 'previous' })}>
          <ChevronLeft size={16} />
        </button>
        <div className="slide-dots" role="tablist" aria-label="Slides">
          {p.slides.map((s, i) => (
            <button
              key={i}
              className={i === p.index ? 'active' : ''}
              title={s.split('\n')[0]}
              onClick={() => run('program:lyrics', { command: 'goto', index: i })}
            >
              {i + 1}
            </button>
          ))}
        </div>
        <button
          className="btn icon"
          title="Next slide (→)"
          disabled={p.index >= p.slides.length - 1}
          onClick={() => run('program:lyrics', { command: 'next' })}
        >
          <ChevronRight size={16} />
        </button>
        <span className="ellipsis grow faint small" title={next}>
          {next ? `Next: ${next.split('\n')[0]}` : 'Last slide'}
        </span>
        <button className="btn sm icon" title="Smaller text" onClick={() => run('settings:update', { lyricsScale: Math.max(0.4, +(snap.settings.lyricsScale - 0.1).toFixed(2)) })}>
          <Minus size={13} />
        </button>
        <button className="btn sm icon" title="Bigger text" onClick={() => run('settings:update', { lyricsScale: Math.min(2.5, +(snap.settings.lyricsScale + 0.1).toFixed(2)) })}>
          <Plus size={13} />
        </button>
        <button
          className={`btn sm ${snap.settings.lyricsUppercase ? 'on' : ''}`}
          title="Uppercase"
          onClick={() => run('settings:update', { lyricsUppercase: !snap.settings.lyricsUppercase })}
        >
          AA
        </button>
      </div>
    );
    return p.source ? (
      <>
        {slideControls}
        <SourceRow source={p.source} />
      </>
    ) : (
      slideControls
    );
  }
  if (p.kind === 'video') {
    const pb = snap.playback;
    const status = p.status === 'loading' ? (p.mode === 'watch' ? 'Loading (YouTube page)…' : 'Loading…') : p.status === 'error' ? 'Cannot play' : pb?.playing ? 'Playing' : 'Paused';
    return (
      <div className="controls">
        <span className={`chip ${p.status === 'error' ? 'err' : pb?.playing ? 'live' : ''}`}>{status}</span>
        <span className="time">{pb ? `${formatTime(pb.currentTime)} / ${formatTime(pb.duration)}` : ''}</span>
        <span className="grow faint small">Use YouTube’s controls above. Panel 3 follows and carries the sound.</span>
        <button className="btn sm" title="Open on YouTube in your browser" onClick={() => run('app:openExternal', { url: youtubeWatchUrl(p.videoId) })}>
          <ExternalLink size={13} /> YouTube
        </button>
      </div>
    );
  }
  if (p.kind === 'image') {
    return (
      <div className="controls">
        <span className={`small ${imageFailed ? 'error-text' : 'faint'} grow`}>
          {imageFailed ? 'This image could not be loaded. Click another one.' : /^https?:/.test(p.url) ? new URL(p.url).hostname : 'Image'}
        </span>
        {/^https?:/.test(p.url) ? (
          <button className="btn sm" title="Open the image in your browser" onClick={() => run('app:openExternal', { url: p.url })}>
            <ExternalLink size={13} /> Open
          </button>
        ) : null}
      </div>
    );
  }
  return (
    <div className="controls">
      <span className="faint small">Panel 3 is what vMix captures. It always shows the same thing as panel 2.</span>
    </div>
  );
}
