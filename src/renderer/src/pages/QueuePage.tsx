import { SkipBack, SkipForward, Trash2 } from 'lucide-react';
import type { AppSnapshot } from '../../../shared/types';
import { ConfirmButton } from '../components/common';
import { QueueList } from '../components/QueueList';
import { run } from '../lib/api';

export function QueuePage({ snap }: { snap: AppSnapshot }) {
  const q = snap.settings.queue;
  return (
    <div className="page">
      <div className="page-scroll">
        <div className="page-header">
          <h1>Presentation queue</h1>
          <span className="faint">{snap.queue.entries.length} item(s) · saved automatically</span>
          <span className="spacer" />
          <button className="btn" onClick={() => run('queue:step', { direction: 'previous' })}>
            <SkipBack size={14} /> Previous
          </button>
          <button className="btn" onClick={() => run('queue:step', { direction: 'next' })}>
            Next <SkipForward size={14} />
          </button>
          <ConfirmButton className="btn danger" confirmLabel="Clear the whole queue?" onConfirm={() => run('queue:clear')} disabled={snap.queue.entries.length === 0}>
            <Trash2 size={14} /> Clear queue
          </ConfirmButton>
        </div>

        <div className="card card-pad" style={{ marginBottom: 14, display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <label className="check">
            <input
              type="checkbox"
              checked={q.presentOnNavigate}
              onChange={(e) => run('settings:update', { patch: { queue: { presentOnNavigate: e.target.checked } } })}
            />
            Auto-advance: Next/Previous present immediately
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={q.autoAdvanceOnVideoEnd}
              onChange={(e) => run('settings:update', { patch: { queue: { autoAdvanceOnVideoEnd: e.target.checked } } })}
            />
            When a queued video ends, present the next item
          </label>
          <span className="small faint">
            With both off, Next/Previous only move the cursor and preview — nothing goes live until you press Present.
          </span>
        </div>

        <div className="card card-pad">
          <QueueList snap={snap} />
        </div>
      </div>
    </div>
  );
}
