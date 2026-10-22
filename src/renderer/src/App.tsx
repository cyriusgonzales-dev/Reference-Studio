import { useCallback, useEffect, useRef, useState } from 'react';
import { Bookmark, CircleHelp, Globe, ListVideo, Music, Settings as SettingsIcon } from 'lucide-react';
import { Toasts } from './components/common';
import { Sidebar } from './components/Sidebar';
import { STATUS_LABEL } from './lib/format';
import { useNotifications, useSnapshot } from './lib/stores';
import { useShortcuts } from './lib/useShortcuts';
import { BookmarksPage } from './pages/BookmarksPage';
import { HelpPage } from './pages/HelpPage';
import { LyricsPage } from './pages/LyricsPage';
import { QueuePage } from './pages/QueuePage';
import { ResearchPage } from './pages/ResearchPage';
import { SettingsPage } from './pages/SettingsPage';

type Page = 'research' | 'lyrics' | 'queue' | 'bookmarks' | 'settings' | 'help';

const NAV: Array<{ page: Page; label: string; icon: React.ReactNode }> = [
  { page: 'research', label: 'Research', icon: <Globe size={20} /> },
  { page: 'lyrics', label: 'Lyrics', icon: <Music size={20} /> },
  { page: 'queue', label: 'Queue', icon: <ListVideo size={20} /> },
  { page: 'bookmarks', label: 'Bookmarks', icon: <Bookmark size={20} /> }
];

function StatusBar() {
  const snap = useSnapshot();
  const notifications = useNotifications();
  const latest = notifications[notifications.length - 1];
  if (!snap) return <footer className="statusbar" />;
  const { output, outputWindow, adblock, storageIssues } = snap;
  return (
    <footer className="statusbar">
      <span className={`msg ${latest?.level ?? ''}`}>{latest?.message ?? (storageIssues[0] ? `⚠ ${storageIssues[0]}` : 'Ready')}</span>
      <span>
        Output: <b style={{ color: output.status === 'EMPTY' ? undefined : 'var(--live)' }}>{STATUS_LABEL[output.status]}</b>
        {outputWindow.exists ? (outputWindow.visible ? '' : ' · hidden') : ' · window closed'}
      </span>
      <span>Ad block: {adblock.enabled ? (adblock.engine === 'ready' ? 'on' : adblock.engine) : 'off'}</span>
      <span>Queue: {snap.queue.entries.length}</span>
    </footer>
  );
}

export function App() {
  const snap = useSnapshot();
  const [page, setPage] = useState<Page>('research');
  const [requestedSong, setRequestedSong] = useState<string | null>(null);
  const [focusRequest, setFocusRequest] = useState(0);
  const addressRef = useRef<HTMLInputElement | null>(null);

  const focusAddress = useCallback(() => {
    setPage('research');
    setFocusRequest((n) => n + 1);
  }, []);

  useEffect(() => {
    if (focusRequest === 0) return;
    const input = addressRef.current;
    if (input) {
      input.focus();
      input.select();
    }
  }, [focusRequest, page]);

  useShortcuts(snap, focusAddress);

  if (!snap) {
    return <div className="empty">Starting…</div>;
  }

  const openSong = (songId: string) => {
    setRequestedSong(songId);
    setPage('lyrics');
  };

  return (
    <div className="app">
      <nav className="rail" aria-label="Main navigation">
        <div className="rail-logo" title="Vmix Reference Studio">
          VRS
        </div>
        {NAV.map((n) => (
          <button key={n.page} className={page === n.page ? 'active' : ''} onClick={() => setPage(n.page)} aria-current={page === n.page ? 'page' : undefined}>
            {n.icon}
            {n.label}
          </button>
        ))}
        <div className="grow" />
        <button className={page === 'help' ? 'active' : ''} onClick={() => setPage('help')}>
          <CircleHelp size={20} />
          Help
        </button>
        <button className={page === 'settings' ? 'active' : ''} onClick={() => setPage('settings')}>
          <SettingsIcon size={20} />
          Settings
        </button>
      </nav>

      {page === 'research' ? <ResearchPage snap={snap} addressRef={addressRef} /> : null}
      {page === 'lyrics' ? <LyricsPage snap={snap} requestedSongId={requestedSong} onRequestHandled={() => setRequestedSong(null)} /> : null}
      {page === 'queue' ? <QueuePage snap={snap} /> : null}
      {page === 'bookmarks' ? <BookmarksPage snap={snap} onOpenResearch={() => setPage('research')} /> : null}
      {page === 'settings' ? <SettingsPage snap={snap} /> : null}
      {page === 'help' ? <HelpPage snap={snap} /> : null}

      <Sidebar snap={snap} onOpenSong={openSong} onOpenQueue={() => setPage('queue')} />
      <StatusBar />
      <Toasts />
    </div>
  );
}
