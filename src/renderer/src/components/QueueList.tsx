import { useState } from 'react';
import { ArrowDown, ArrowUp, GripVertical, Play, X } from 'lucide-react';
import type { AppSnapshot } from '../../../shared/types';
import { run } from '../lib/api';
import { itemSubtitle, KIND_LABEL } from '../lib/format';
import { ItemThumb, KindIcon } from './common';

interface Props {
  snap: AppSnapshot;
  compact?: boolean;
}

/**
 * The presentation queue. Click selects (and previews) an item; double-click or
 * the play button presents it. Drag rows to reorder; Alt+↑/↓ on a focused row
 * moves it with the keyboard.
 */
export function QueueList({ snap, compact = false }: Props) {
  const { entries, currentId } = snap.queue;
  const liveItemId = snap.output.status !== 'EMPTY' ? snap.output.item?.id : undefined;
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dropAt, setDropAt] = useState<{ index: number; after: boolean } | null>(null);
  const [notesDraft, setNotesDraft] = useState<Record<string, string>>({});

  if (entries.length === 0) {
    return (
      <div className="empty small">
        The queue is empty. Use <b>Add to Queue</b> from the research browser’s right-click menu, the preview panel, or the lyrics library.
      </div>
    );
  }

  const move = (from: number, to: number) => {
    if (to < 0 || to >= entries.length || from === to) return;
    run('queue:move', { from, to });
  };

  return (
    <div role="list" style={{ display: 'grid', gap: 2 }}>
      {entries.map((entry, index) => {
        const isCurrent = entry.id === currentId;
        const isLive = entry.item.id === liveItemId;
        const dropClass = dropAt && dropAt.index === index ? (dropAt.after ? 'drop-after' : 'drop-before') : '';
        return (
          <div
            key={entry.id}
            role="listitem"
            tabIndex={0}
            className={`item-row ${isCurrent ? 'current' : ''} ${isLive ? 'is-live' : ''} ${dropClass}`}
            draggable
            onDragStart={(e) => {
              setDragFrom(index);
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', String(index));
            }}
            onDragOver={(e) => {
              if (dragFrom === null) return;
              e.preventDefault();
              const rect = e.currentTarget.getBoundingClientRect();
              setDropAt({ index, after: e.clientY > rect.top + rect.height / 2 });
            }}
            onDragLeave={() => setDropAt((d) => (d?.index === index ? null : d))}
            onDrop={(e) => {
              e.preventDefault();
              if (dragFrom !== null && dropAt) {
                let to = dropAt.index + (dropAt.after ? 1 : 0);
                if (dragFrom < to) to -= 1;
                move(dragFrom, Math.min(entries.length - 1, Math.max(0, to)));
              }
              setDragFrom(null);
              setDropAt(null);
            }}
            onDragEnd={() => {
              setDragFrom(null);
              setDropAt(null);
            }}
            onClick={() => run('queue:select', { id: entry.id })}
            onDoubleClick={() => run('queue:presentEntry', { id: entry.id })}
            onKeyDown={(e) => {
              if (e.target !== e.currentTarget) return;
              if (e.altKey && e.key === 'ArrowUp') {
                e.preventDefault();
                move(index, index - 1);
              } else if (e.altKey && e.key === 'ArrowDown') {
                e.preventDefault();
                move(index, index + 1);
              } else if (e.key === 'Enter' && !e.ctrlKey) {
                e.preventDefault();
                run('queue:select', { id: entry.id });
              } else if (e.key === 'Delete') {
                e.preventDefault();
                run('queue:remove', { id: entry.id });
              }
            }}
            title="Click to preview · double-click to present · drag to reorder (Alt+↑/↓ with keyboard)"
          >
            <span className="drag-handle" aria-hidden>
              <GripVertical size={14} />
            </span>
            {compact ? null : <span className="faint small" style={{ width: 22, textAlign: 'right' }}>{index + 1}</span>}
            <ItemThumb item={entry.item} />
            <div className="meta">
              <div className="title ellipsis" title={entry.item.title}>
                {isLive ? <span className="badge live" style={{ marginRight: 5 }}>Live</span> : null}
                {entry.item.title}
              </div>
              <div className="sub ellipsis">
                <KindIcon kind={entry.item.kind} size={11} /> {KIND_LABEL[entry.item.kind]} · {itemSubtitle(entry.item)}
                {compact && entry.notes ? ` · ${entry.notes}` : ''}
              </div>
              {compact ? null : (
                <input
                  className="input"
                  style={{ height: 26, marginTop: 4, width: '100%' }}
                  placeholder="Notes…"
                  value={notesDraft[entry.id] ?? entry.notes}
                  maxLength={2000}
                  onClick={(e) => e.stopPropagation()}
                  onDoubleClick={(e) => e.stopPropagation()}
                  onChange={(e) => setNotesDraft((d) => ({ ...d, [entry.id]: e.target.value }))}
                  onBlur={() => {
                    const value = notesDraft[entry.id];
                    if (value !== undefined && value !== entry.notes) run('queue:updateNotes', { id: entry.id, notes: value });
                  }}
                />
              )}
            </div>
            <div className="actions" onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
              {compact ? null : (
                <>
                  <button className="btn sm icon ghost" title="Move up" disabled={index === 0} onClick={() => move(index, index - 1)}>
                    <ArrowUp size={13} />
                  </button>
                  <button
                    className="btn sm icon ghost"
                    title="Move down"
                    disabled={index === entries.length - 1}
                    onClick={() => move(index, index + 1)}
                  >
                    <ArrowDown size={13} />
                  </button>
                </>
              )}
              <button className="btn sm icon ghost" title="Present now" onClick={() => run('queue:presentEntry', { id: entry.id })}>
                <Play size={13} />
              </button>
              <button className="btn sm icon ghost" title="Remove from queue" onClick={() => run('queue:remove', { id: entry.id })}>
                <X size={13} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
