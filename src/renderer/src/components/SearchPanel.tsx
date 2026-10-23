import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, Home, Image as ImageIcon, Music, RotateCw, Search, Shield, ShieldOff, Type, X, SquarePlay } from 'lucide-react';
import type { AppSnapshot, TabId } from '../../../shared/types';
import { extractSearchQuery } from '../../../shared/urls';
import { call, run } from '../lib/api';
import { useViewBounds } from '../lib/hooks';
import { notify, useNotification } from '../lib/stores';

const TABS: Array<{ id: TabId; label: string; icon: React.ReactNode; placeholder: string; hint: string }> = [
  {
    id: 'images',
    label: 'Images',
    icon: <ImageIcon size={20} />,
    placeholder: 'Search Images, YouTube, Lyrics and Research together…',
    hint: 'Click any image to show it in panels 2 and 3. Click another to replace it.'
  },
  {
    id: 'youtube',
    label: 'YouTube',
    icon: <SquarePlay size={20} />,
    placeholder: 'Search YouTube, Images, Lyrics and Research together…',
    hint: 'Click a video to play it in panel 2. These results stay here.'
  },
  {
    id: 'lyrics',
    label: 'Lyrics',
    icon: <Music size={20} />,
    placeholder: 'Song title — searches Lyrics, Images, YouTube and Research together…',
    hint: 'Search a song, then highlight the lyrics on the page with the mouse to show them.'
  },
  {
    id: 'research',
    label: 'Research',
    icon: <BookOpen size={20} />,
    placeholder: 'Topic — searches Research, Images, YouTube and Lyrics together…',
    hint: 'Open a trusted page (NASA, Britannica…), then highlight text. It is shown with its source: site · title · date.'
  }
];

/** Panel 1: four search tabs, each a real browser with its own history. */
export function SearchPanel({ snap, focusRequest }: { snap: AppSnapshot; focusRequest: number }) {
  const tab = snap.activeTab;
  const state = snap.tabs[tab];
  const meta = TABS.find((t) => t.id === tab)!;
  const hostRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [drafts, setDrafts] = useState<Record<TabId, string | null>>({ images: null, youtube: null, lyrics: null, research: null });
  const notification = useNotification();
  useViewBounds(hostRef, 'research');

  useEffect(() => {
    if (focusRequest === 0) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [focusRequest]);

  // Show the search terms of the current results page; the operator's own typing wins while editing.
  const pageQuery = extractSearchQuery(state.url);
  const shown = drafts[tab] ?? (pageQuery ? pageQuery.replace(/\s+(song\s+)?lyrics$/i, '') : state.url);

  const go = () => {
    const input = (drafts[tab] ?? shown).trim();
    if (!input) return;
    // Every tab runs the same search, so every tab shows its new results' query.
    setDrafts({ images: null, youtube: null, lyrics: null, research: null });
    call('tab:navigate', { tab, input }).catch((e: Error) => notify('error', e.message));
  };

  const adblock = snap.adblock;

  return (
    <section className="search-panel" aria-label="Search">
      <nav className="tab-rail" aria-label="Search tabs">
        {TABS.map((t, i) => (
          <button
            key={t.id}
            className={t.id === tab ? 'active' : ''}
            title={`${t.label} (Ctrl+${i + 1})`}
            onClick={() => run('tab:select', { tab: t.id })}
            aria-current={t.id === tab ? 'page' : undefined}
          >
            {t.icon}
            <span>{t.label}</span>
            {snap.tabs[t.id].loading ? <span className="tab-loading" /> : null}
          </button>
        ))}
        <div className="grow" />
        <button
          className={adblock.enabled ? 'adblock on' : 'adblock'}
          title={adblock.error ?? `Ad blocking ${adblock.enabled ? 'on' : 'off'} — click to turn ${adblock.enabled ? 'off' : 'on'}`}
          onClick={() => run('settings:update', { adblockEnabled: !adblock.enabled })}
        >
          {adblock.enabled ? <Shield size={18} /> : <ShieldOff size={18} />}
          <span>{adblock.enabled ? `${adblock.blockedCount > 999 ? '999+' : adblock.blockedCount} blocked` : 'Ads on'}</span>
        </button>
      </nav>

      <div className="search-main">
        <div className="toolbar">
          <button className="btn icon" title="Back (Alt+←)" disabled={!state.canGoBack} onClick={() => run('tab:command', { tab, command: 'back' })}>
            <ArrowLeft size={16} />
          </button>
          <button className="btn icon" title="Forward (Alt+→)" disabled={!state.canGoForward} onClick={() => run('tab:command', { tab, command: 'forward' })}>
            <ArrowRight size={16} />
          </button>
          {state.loading ? (
            <button className="btn icon" title="Stop" onClick={() => run('tab:command', { tab, command: 'stop' })}>
              <X size={16} />
            </button>
          ) : (
            <button className="btn icon" title="Reload" onClick={() => run('tab:command', { tab, command: 'reload' })}>
              <RotateCw size={15} />
            </button>
          )}
          <button className="btn icon" title="Home" onClick={() => run('tab:command', { tab, command: 'home' })}>
            <Home size={15} />
          </button>
          <input
            ref={inputRef}
            className="input address"
            value={shown}
            spellCheck={false}
            placeholder={meta.placeholder}
            aria-label={meta.placeholder}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => {
              const value = e.target.value;
              setDrafts((d) => ({ ...d, [tab]: value }));
            }}
            onBlur={() => setDrafts((d) => (d[tab] === null || d[tab]?.trim() ? d : { ...d, [tab]: null }))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                go();
              } else if (e.key === 'Escape') {
                setDrafts((d) => ({ ...d, [tab]: null }));
                e.currentTarget.blur();
              }
            }}
          />
          <button className="btn primary" onClick={go} title="Search">
            <Search size={15} /> Search
          </button>
          {tab === 'lyrics' || tab === 'research' ? (
            <button
              className="btn"
              title={tab === 'research' ? 'Show the text highlighted on the page, with its source' : 'Show the text highlighted on the page as lyrics'}
              onClick={() => call('tab:useSelection').catch((e: Error) => notify('warning', e.message))}
            >
              <Type size={15} /> Use highlighted text
            </button>
          ) : null}
        </div>
        <div className={`status-line ${notification ? notification.level : state.error ? 'error' : ''}`}>
          {notification ? notification.message : state.error ? state.error : meta.hint}
        </div>
        {state.loading ? <div className="loading-bar" /> : <div style={{ height: 2 }} />}
        <div ref={hostRef} className="browser-host">
          <div className="placeholder">Loading…</div>
        </div>
      </div>
    </section>
  );
}
