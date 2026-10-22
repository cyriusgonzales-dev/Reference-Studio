import { useEffect, useRef, useState } from 'react';
import { OutputPanels } from './components/OutputPanels';
import { SearchPanel } from './components/SearchPanel';
import { run } from './lib/api';
import { isEditableTarget } from './lib/format';
import { useSnapshot } from './lib/stores';

/** One window, three panels: search (1), player (2) and vMix output (3). */
export function App() {
  const snap = useSnapshot();
  const [focusRequest, setFocusRequest] = useState(0);
  const lyricsActive = useRef(false);
  lyricsActive.current = snap?.program.kind === 'lyrics';

  useEffect(() => {
    // Arrow keys step through lyrics while the app (not a web page or text box) has focus.
    const onKey = (e: KeyboardEvent) => {
      if (!lyricsActive.current || e.defaultPrevented || isEditableTarget(e.target) || e.ctrlKey || e.altKey || e.metaKey) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        e.preventDefault();
        run('program:lyrics', { command: 'next' });
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        run('program:lyrics', { command: 'previous' });
      }
    };
    window.addEventListener('keydown', onKey);
    const off = window.vrs.on('app:focusSearch', () => setFocusRequest((n) => n + 1));
    return () => {
      window.removeEventListener('keydown', onKey);
      off();
    };
  }, []);

  if (!snap) return <div className="starting">Starting…</div>;

  return (
    <div className="app">
      <SearchPanel snap={snap} focusRequest={focusRequest} />
      <OutputPanels snap={snap} />
    </div>
  );
}
