import { useMemo, useState } from 'react';
import { ExternalLink, Star, Trash2 } from 'lucide-react';
import type { AppSnapshot } from '../../../shared/types';
import { hostnameOf } from '../../../shared/urls';
import { ConfirmButton } from '../components/common';
import { call, run } from '../lib/api';
import { notify, useBookmarks } from '../lib/stores';

export function BookmarksPage({ snap, onOpenResearch }: { snap: AppSnapshot; onOpenResearch: () => void }) {
  const bookmarks = useBookmarks();
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? bookmarks.filter((b) => b.title.toLowerCase().includes(q) || b.url.toLowerCase().includes(q)) : bookmarks;
  }, [bookmarks, query]);

  const open = (url: string) => {
    onOpenResearch();
    call('research:navigate', { input: url, mode: 'web' }).catch((e: Error) => notify('error', e.message));
  };

  return (
    <div className="page">
      <div className="page-scroll">
        <div className="page-header">
          <h1>Bookmarks</h1>
          <span className="spacer" />
          <input className="input" style={{ width: 260 }} placeholder="Search bookmarks…" value={query} onChange={(e) => setQuery(e.target.value)} />
          <button
            className="btn"
            disabled={!/^https?:/.test(snap.research.url)}
            onClick={() => run('bookmarks:add', { title: snap.research.title || snap.research.url, url: snap.research.url })}
            title={snap.research.url}
          >
            <Star size={14} /> Bookmark current research page
          </button>
        </div>
        <div className="card">
          {filtered.length === 0 ? (
            <div className="empty">{bookmarks.length === 0 ? 'No bookmarks yet. Use the ☆ button in the research toolbar.' : 'No matches.'}</div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Site</th>
                  <th style={{ width: 160 }} />
                </tr>
              </thead>
              <tbody>
                {filtered.map((b) => (
                  <tr key={b.id}>
                    <td>
                      <button className="btn ghost" style={{ maxWidth: 520, justifyContent: 'flex-start' }} onClick={() => open(b.url)} title={b.url}>
                        <span className="ellipsis">{b.title}</span>
                      </button>
                    </td>
                    <td className="muted">{hostnameOf(b.url)}</td>
                    <td>
                      <div className="btn-row" style={{ justifyContent: 'flex-end' }}>
                        <button className="btn sm icon" title="Open in your browser" onClick={() => run('app:openExternal', { url: b.url })}>
                          <ExternalLink size={13} />
                        </button>
                        <ConfirmButton className="btn sm icon danger" confirmLabel="?" title="Delete bookmark" onConfirm={() => run('bookmarks:remove', { id: b.id })}>
                          <Trash2 size={13} />
                        </ConfirmButton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
