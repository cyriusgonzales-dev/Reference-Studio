import { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ListVideo, SkipBack, SkipForward } from 'lucide-react';
import type { AppSnapshot } from '../../../shared/types';
import { call, run } from '../lib/api';
import { notify } from '../lib/stores';
import { LivePanel } from './LivePanel';
import { PreviewPanel } from './PreviewPanel';
import { QueueList } from './QueueList';

interface Props {
  snap: AppSnapshot;
  onOpenSong: (songId: string) => void;
  onOpenQueue: () => void;
}

/** Collapsible, resizable live-control sidebar: Live output, Preview and Queue. */
export function Sidebar({ snap, onOpenSong, onOpenQueue }: Props) {
  const { sidebarCollapsed, sidebarWidth } = snap.settings.ui;
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const dragStart = useRef<{ x: number; width: number } | null>(null);
  const width = dragWidth ?? sidebarWidth;

  const save = (patch: { sidebarWidth?: number; sidebarCollapsed?: boolean }) =>
    call('settings:update', { patch: { ui: patch } }).catch((e: Error) => notify('error', e.message));

  if (sidebarCollapsed) {
    return (
      <aside className="sidebar collapsed">
        <div className="sidebar-collapsed-bar">
          <button className="btn sm icon" title="Show live controls" onClick={() => void save({ sidebarCollapsed: false })}>
            <ChevronLeft size={14} />
          </button>
          <span className={`chip ${snap.output.status === 'EMPTY' ? '' : 'live'}`} style={{ writingMode: 'vertical-rl', height: 'auto', padding: '8px 2px' }}>
            {snap.output.status === 'EMPTY' ? 'Black' : 'Live'}
          </span>
        </div>
      </aside>
    );
  }

  return (
    <aside className="sidebar" style={{ width }}>
      <div
        className={`sidebar-resizer ${dragWidth !== null ? 'dragging' : ''}`}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize live controls"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') void save({ sidebarWidth: Math.min(720, sidebarWidth + 20) });
          if (e.key === 'ArrowRight') void save({ sidebarWidth: Math.max(260, sidebarWidth - 20) });
        }}
        onPointerDown={(e) => {
          dragStart.current = { x: e.clientX, width };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!dragStart.current) return;
          const next = dragStart.current.width + (dragStart.current.x - e.clientX);
          setDragWidth(Math.round(Math.min(720, Math.max(260, next))));
        }}
        onPointerUp={() => {
          dragStart.current = null;
          if (dragWidth !== null) void save({ sidebarWidth: dragWidth }).finally(() => setDragWidth(null));
        }}
      />
      <div className="sidebar-inner">
        <LivePanel snap={snap} onOpenSong={onOpenSong} />
        <PreviewPanel snap={snap} />
        <section className="panel" aria-label="Queue" style={{ borderBottom: 0 }}>
          <div className="panel-head">
            <span className="section-title">Queue</span>
            <span className="faint small">{snap.queue.entries.length}</span>
            <span className="spacer" />
            <button className="btn sm icon" title="Previous queue item (Ctrl+Shift+←)" onClick={() => run('queue:step', { direction: 'previous' })}>
              <SkipBack size={13} />
            </button>
            <button className="btn sm icon" title="Next queue item (Ctrl+Shift+→)" onClick={() => run('queue:step', { direction: 'next' })}>
              <SkipForward size={13} />
            </button>
            <button className="btn sm icon" title="Open the full queue" onClick={onOpenQueue}>
              <ListVideo size={13} />
            </button>
            <button className="btn sm icon ghost" title="Collapse live controls" onClick={() => void save({ sidebarCollapsed: true })}>
              <ChevronRight size={14} />
            </button>
          </div>
          {snap.settings.queue.presentOnNavigate ? (
            <div className="small warn-text" style={{ marginBottom: 6 }}>
              Auto-advance is on: Next/Previous present immediately.
            </div>
          ) : null}
          <QueueList snap={snap} compact />
        </section>
      </div>
    </aside>
  );
}
