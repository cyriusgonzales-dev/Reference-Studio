import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Eye,
  EyeOff,
  Home,
  ListPlus,
  MonitorPlay,
  RotateCw,
  Search,
  Send,
  Shield,
  ShieldOff,
  Star,
  Volume2,
  VolumeX,
  X
} from 'lucide-react';
import type { AppSnapshot, SearchMode } from '../../../shared/types';
import { extractSearchQuery, inferSearchMode } from '../../../shared/urls';
import { call, run } from '../lib/api';
import { formatCount, STATUS_LABEL } from '../lib/format';
import { notify } from '../lib/stores';

/**
 * Reports the placeholder's position to the main process, which places the
 * native research browser view exactly over it. The view is hidden whenever
 * this component is not mounted (another page is open).
 */
function BrowserHost({ visible }: { visible: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const last = useRef('');

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let frame = 0;
    const send = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        const bounds = { x: r.left, y: r.top, width: r.width, height: r.height, visible };
        const key = JSON.stringify(bounds);
        if (key === last.current) return;
        last.current = key;
        run('research:setBounds', bounds);
      });
    };
    send();
    const ro = new ResizeObserver(send);
    ro.observe(el);
    ro.observe(document.body);
    window.addEventListener('resize', send);
    const interval = window.setInterval(send, 500); // catches position-only layout shifts
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      window.removeEventListener('resize', send);
      window.clearInterval(interval);
    };
  }, [visible]);

  useEffect(
    () => () => {
      last.current = '';
      run('research:setBounds', { x: 0, y: 0, width: 0, height: 0, visible: false });
    },
    []
  );

  return (
    <div ref={ref} className="browser-host">
      <div className="placeholder">Loading research browser…</div>
    </div>
  );
}

const MODE_LABELS: Record<SearchMode, string> = { images: 'Google Images', youtube: 'YouTube', web: 'General Web' };

interface Props {
  snap: AppSnapshot;
  addressRef: RefObject<HTMLInputElement | null>;
}

export function ResearchPage({ snap, addressRef }: Props) {
  const { research, adblock, output, outputWindow, settings } = snap;
  const [mode, setMode] = useState<SearchMode>(settings.research.defaultMode);
  const [text, setText] = useState('');
  const [editing, setEditing] = useState(false);

  // Keep the address bar and mode selector in sync with the page, unless the operator is typing.
  useEffect(() => {
    if (editing) return;
    const inferred = inferSearchMode(research.url);
    if (inferred) setMode(inferred);
    const query = inferred ? extractSearchQuery(research.url) : null;
    setText(query ?? research.url);
  }, [research.url, editing]);

  const go = () => {
    const input = text.trim();
    if (!input) return;
    setEditing(false);
    addressRef.current?.blur();
    call('research:navigate', { input, mode })
      .then(() => run('research:focus'))
      .catch((e: Error) => notify('error', e.message));
  };

  const video = research.detectedVideo;
  const adblockOn = adblock.enabled && adblock.engine === 'ready';

  return (
    <div className="page">
      <div className="toolbar">
        <button className="btn icon" title="Back (Alt+←)" disabled={!research.canGoBack} onClick={() => run('research:command', { command: 'back' })}>
          <ArrowLeft size={16} />
        </button>
        <button
          className="btn icon"
          title="Forward (Alt+→)"
          disabled={!research.canGoForward}
          onClick={() => run('research:command', { command: 'forward' })}
        >
          <ArrowRight size={16} />
        </button>
        {research.loading ? (
          <button className="btn icon" title="Stop loading" onClick={() => run('research:command', { command: 'stop' })}>
            <X size={16} />
          </button>
        ) : (
          <button className="btn icon" title="Reload (Ctrl+R)" onClick={() => run('research:command', { command: 'reload' })}>
            <RotateCw size={15} />
          </button>
        )}
        <button className="btn icon" title="Home" onClick={() => run('research:command', { command: 'home' })}>
          <Home size={15} />
        </button>
        <select className="select mode" value={mode} onChange={(e) => setMode(e.target.value as SearchMode)} aria-label="Search mode">
          {(Object.keys(MODE_LABELS) as SearchMode[]).map((m) => (
            <option key={m} value={m}>
              {MODE_LABELS[m]}
            </option>
          ))}
        </select>
        <input
          ref={addressRef}
          className="input address"
          value={text}
          spellCheck={false}
          placeholder={mode === 'images' ? 'Search Google Images or enter an address' : mode === 'youtube' ? 'Search YouTube or enter an address' : 'Search the web or enter an address'}
          aria-label="Address or search terms"
          onFocus={(e) => {
            setEditing(true);
            e.currentTarget.select();
          }}
          onBlur={() => setEditing(false)}
          onChange={(e) => {
            setEditing(true);
            setText(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.ctrlKey && !e.altKey) {
              e.preventDefault();
              go();
            } else if (e.key === 'Escape') {
              setEditing(false);
              addressRef.current?.blur();
            }
          }}
        />
        <button className="btn primary" onClick={go} title="Search / Go">
          <Search size={15} /> Go
        </button>
        <button
          className="btn icon"
          title="Bookmark this page"
          disabled={!/^https?:/.test(research.url)}
          onClick={() => run('bookmarks:add', { title: research.title || research.url, url: research.url })}
        >
          <Star size={15} />
        </button>
      </div>

      <div className="substrip">
        <button
          className={`chip ${adblockOn ? 'ok' : adblock.engine === 'error' ? 'err' : 'warn'}`}
          style={{ cursor: 'pointer' }}
          title={adblock.error ?? 'Click to turn ad and tracker blocking on or off (troubleshooting)'}
          onClick={() => run('settings:update', { patch: { adblock: { enabled: !adblock.enabled } } })}
        >
          {adblock.enabled ? <Shield size={12} /> : <ShieldOff size={12} />}
          {!adblock.enabled
            ? 'Ad block off'
            : adblock.engine === 'loading'
              ? 'Ad block loading…'
              : adblock.engine === 'error'
                ? 'Ad block unavailable'
                : `Ad block on · ${formatCount(adblock.blockedCount)} blocked`}
        </button>
        <button
          className="btn sm icon ghost"
          title={research.muted ? 'Unmute research audio' : 'Mute research audio'}
          onClick={() => run('research:setMuted', { muted: !research.muted })}
        >
          {research.muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
        </button>
        <span className="spacer" />
        <span className={`chip ${output.status === 'EMPTY' ? '' : output.status === 'ERROR' ? 'err' : 'live'}`}>
          <span className="dot" /> Output: {STATUS_LABEL[output.status]}
          {outputWindow.exists && !outputWindow.visible ? ' (hidden)' : ''}
        </span>
        <button className="btn sm" title="Open the Presentation Output on its display" onClick={() => run('output:window', { command: 'open' })}>
          <MonitorPlay size={13} /> Open Output
        </button>
        <button
          className="btn sm"
          title="Show or hide the Presentation Output (Ctrl+Shift+P)"
          onClick={() => run('output:window', { command: 'toggleVisible' })}
        >
          {outputWindow.visible ? <EyeOff size={13} /> : <Eye size={13} />} {outputWindow.visible ? 'Hide' : 'Show'}
        </button>
      </div>

      {video ? (
        <div className="banner video">
          <span className="ellipsis" style={{ flex: 1 }} title={video.title}>
            ▶ YouTube video on this page: <b>{video.title}</b>
          </span>
          <button className="btn sm live" onClick={() => run('output:present', { item: video })} title="Present this video (Ctrl+Enter)">
            <Send size={13} /> Present
          </button>
          <button className="btn sm" onClick={() => run('preview:set', { item: video })}>
            Preview
          </button>
          <button className="btn sm" onClick={() => run('queue:add', { item: video })}>
            <ListPlus size={13} /> Queue
          </button>
        </div>
      ) : null}
      {research.error ? (
        <div className="banner error">
          <span style={{ flex: 1 }}>{research.error.description}</span>
          <button className="btn sm" onClick={() => run('research:command', { command: 'reload' })}>
            Try again
          </button>
        </div>
      ) : null}
      {research.unresponsive ? (
        <div className="banner warn">
          <span style={{ flex: 1 }}>This page is not responding. The live output is not affected.</span>
          <button className="btn sm" onClick={() => run('research:command', { command: 'stop' })}>
            Stop
          </button>
          <button className="btn sm" onClick={() => run('research:command', { command: 'reload' })}>
            Reload
          </button>
        </div>
      ) : null}
      {research.loading ? <div className="loading-bar" /> : <div style={{ height: 2 }} />}

      <BrowserHost visible />
    </div>
  );
}
