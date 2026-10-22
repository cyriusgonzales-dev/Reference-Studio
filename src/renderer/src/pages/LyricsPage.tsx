import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  ClipboardPaste,
  Copy,
  Eye,
  ListPlus,
  Music,
  Plus,
  Save,
  Send,
  Trash2,
  X
} from 'lucide-react';
import { assessSlide, MAX_SLIDE_CHARS, moveSlide, normalizeSlideText, searchSongs, splitLyrics } from '../../../shared/lyrics';
import { matchesAccelerator } from '../../../shared/shortcuts';
import type { AppSnapshot, LyricsItem, Song } from '../../../shared/types';
import { ConfirmButton } from '../components/common';
import { LyricsStage } from '../components/LyricsStage';
import { call, run } from '../lib/api';
import { DENSE_SCALE_THRESHOLD } from '../lib/lyricsRender';
import { newId } from '../lib/format';
import { notify, useSongs } from '../lib/stores';

interface Props {
  snap: AppSnapshot;
  /** A song to open, e.g. from "Open song" in the live panel. */
  requestedSongId: string | null;
  onRequestHandled: () => void;
}

type Draft = Song;

function blankSong(): Draft {
  const now = new Date().toISOString();
  return { id: newId(), title: 'Untitled song', slides: [], createdAt: now, updatedAt: now };
}

function sameContent(a: Draft | null, b: Song | undefined): boolean {
  if (!a || !b) return false;
  return a.title === b.title && JSON.stringify(a.slides) === JSON.stringify(b.slides);
}

export function LyricsPage({ snap, requestedSongId, onRequestHandled }: Props) {
  const songs = useSongs();
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [selected, setSelected] = useState(0);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [fitScale, setFitScale] = useState(1);
  const controllerRef = useRef<HTMLDivElement>(null);

  const saved = draft ? songs.find((s) => s.id === draft.id) : undefined;
  const isNew = !!draft && !saved;
  const dirty = !!draft && (isNew || !sameContent(draft, saved));
  const filtered = useMemo(() => searchSongs(songs, query), [songs, query]);

  const live = snap.output.status === 'LYRICS' ? snap.output.lyrics : null;
  const liveHere = !!live && !!draft && live.songId === draft.id;
  const liveDiffers = liveHere && JSON.stringify(live.slides) !== JSON.stringify(draft.slides.map((s) => s.text));

  const confirmDiscard = () => !dirty || window.confirm('Discard unsaved changes to this song?');

  const open = (song: Song) => {
    if (draft?.id === song.id) return;
    if (!confirmDiscard()) return;
    setDraft(structuredClone(song));
    setSelected(0);
    setPasteOpen(false);
  };

  // Open a song requested from elsewhere (e.g. the live panel).
  useEffect(() => {
    if (!requestedSongId) return;
    const song = songs.find((s) => s.id === requestedSongId);
    if (song && draft?.id !== song.id && confirmDiscard()) {
      setDraft(structuredClone(song));
      setSelected(live?.songId === song.id ? live.index : 0);
    }
    onRequestHandled();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedSongId]);

  // Follow the live slide while this song is live.
  useEffect(() => {
    if (liveHere && live) setSelected(live.index);
  }, [liveHere, live?.index]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (!draft) return;
    const title = draft.title.trim();
    if (!title) {
      notify('error', 'A song needs a title.');
      return;
    }
    const tooLong = draft.slides.findIndex((s) => s.text.length > MAX_SLIDE_CHARS);
    if (tooLong >= 0) {
      notify('error', `Slide ${tooLong + 1} is too long. Split it before saving.`);
      return;
    }
    try {
      const result = await call('lyrics:save', {
        song: { ...draft, title, slides: draft.slides.map((s) => ({ ...s, text: normalizeSlideText(s.text) })) }
      });
      setDraft(structuredClone(result));
      notify('success', `Saved “${result.title}”.`);
    } catch (e) {
      notify('error', (e as Error).message);
    }
  };

  const updateSlides = (fn: (slides: Draft['slides']) => Draft['slides']) => {
    setDraft((d) => (d ? { ...d, slides: fn(d.slides) } : d));
  };

  const applyPaste = (mode: 'replace' | 'append') => {
    const parts = splitLyrics(pasteText);
    if (parts.length === 0) {
      notify('warning', 'Nothing to add — paste lyrics separated by blank lines.');
      return;
    }
    const newSlides = parts.map((text) => ({ id: newId(), text }));
    updateSlides((slides) => (mode === 'replace' ? newSlides : [...slides, ...newSlides]));
    if (mode === 'replace') setSelected(0);
    setPasteText('');
    setPasteOpen(false);
    notify('info', `${parts.length} slide${parts.length === 1 ? '' : 's'} created. Remember to save.`);
  };

  const presentSlide = (index: number) => {
    if (!draft || draft.slides.length === 0) return;
    const item: LyricsItem = { kind: 'lyrics', id: newId(), title: draft.title.trim() || 'Untitled song', songId: draft.id, slideIndex: index };
    run('output:present', {
      item,
      lyrics: { songId: draft.id, title: item.title, slides: draft.slides.map((s) => s.text), index }
    });
    window.setTimeout(() => controllerRef.current?.focus(), 50);
  };

  const addToQueue = () => {
    if (!draft) return;
    if (dirty) {
      notify('warning', 'Save the song before adding it to the queue (the queue uses the saved version).');
      return;
    }
    run('queue:add', {
      item: { kind: 'lyrics', id: newId(), title: draft.title, songId: draft.id, slideIndex: selected }
    });
  };

  const onControllerKey = (e: React.KeyboardEvent) => {
    const key = { key: e.key, ctrl: e.ctrlKey, shift: e.shiftKey, alt: e.altKey, meta: e.metaKey };
    if (matchesAccelerator(snap.settings.shortcuts.lyricsNext, key)) {
      e.preventDefault();
      e.stopPropagation();
      run('output:lyrics', { command: 'next' });
    } else if (matchesAccelerator(snap.settings.shortcuts.lyricsPrevious, key)) {
      e.preventDefault();
      e.stopPropagation();
      run('output:lyrics', { command: 'previous' });
    }
  };

  const slide = draft?.slides[selected];
  const nextSlide = draft?.slides[selected + 1];
  const style = snap.settings.lyrics;

  return (
    <div className="page">
      <div className="lyrics-layout">
        <div className="song-list">
          <div className="search">
            <input className="input" style={{ flex: 1 }} placeholder="Search songs…" value={query} onChange={(e) => setQuery(e.target.value)} />
            <button
              className="btn icon primary"
              title="New song"
              onClick={() => {
                if (!confirmDiscard()) return;
                setDraft(blankSong());
                setSelected(0);
                setPasteOpen(true);
              }}
            >
              <Plus size={16} />
            </button>
          </div>
          <ul>
            {filtered.map((song) => (
              <li key={song.id}>
                <button className={draft?.id === song.id ? 'active' : ''} onClick={() => open(song)}>
                  <Music size={14} className="faint" />
                  <span className="ellipsis" style={{ flex: 1 }}>
                    {song.title}
                  </span>
                  {live?.songId === song.id ? <span className="badge live">Live</span> : <span className="faint small">{song.slides.length}</span>}
                </button>
              </li>
            ))}
            {filtered.length === 0 ? <li className="empty small">{songs.length === 0 ? 'No songs yet. Click + to create one.' : 'No matches.'}</li> : null}
          </ul>
        </div>

        {!draft ? (
          <div className="empty" style={{ alignSelf: 'center' }}>
            Select a song or create a new one. Paste your own or licensed lyrics; nothing is downloaded from lyrics sites.
          </div>
        ) : (
          <div className="editor">
            <div className="editor-head">
              <input
                className="input"
                style={{ flex: '1 1 240px', fontSize: 15, fontWeight: 600, height: 34 }}
                value={draft.title}
                maxLength={200}
                aria-label="Song title"
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 's' && e.ctrlKey) {
                    e.preventDefault();
                    void save();
                  }
                }}
              />
              <button className={`btn ${dirty ? 'primary' : ''}`} onClick={() => void save()} disabled={!dirty} title="Save (Ctrl+S)">
                <Save size={14} /> {dirty ? 'Save' : 'Saved'}
              </button>
              <button className="btn" onClick={() => setPasteOpen((o) => !o)}>
                <ClipboardPaste size={14} /> Paste &amp; split
              </button>
              <button className="btn" onClick={addToQueue} disabled={draft.slides.length === 0}>
                <ListPlus size={14} /> Add to queue
              </button>
              <button
                className="btn"
                disabled={isNew}
                onClick={() =>
                  call('lyrics:duplicate', { id: draft.id })
                    .then((copy) => {
                      setDraft(structuredClone(copy));
                      notify('success', `Created “${copy.title}”.`);
                    })
                    .catch((e: Error) => notify('error', e.message))
                }
                title="Duplicate this song"
              >
                <Copy size={14} />
              </button>
              <ConfirmButton
                className="btn danger"
                confirmLabel="Delete song?"
                title="Delete this song"
                onConfirm={() => {
                  if (isNew) {
                    setDraft(null);
                    return;
                  }
                  call('lyrics:delete', { id: draft.id })
                    .then(() => {
                      setDraft(null);
                      notify('success', 'Song deleted.');
                    })
                    .catch((e: Error) => notify('error', e.message));
                }}
              >
                <Trash2 size={14} />
              </ConfirmButton>
            </div>

            {pasteOpen ? (
              <div className="paste-panel">
                <div className="small muted">
                  Paste lyrics below. Blank lines separate slides. Only use lyrics you wrote or are licensed to display.
                </div>
                <textarea
                  className="textarea"
                  rows={8}
                  value={pasteText}
                  autoFocus
                  placeholder={'Verse one line one\nVerse one line two\n\nChorus line one\nChorus line two'}
                  onChange={(e) => setPasteText(e.target.value)}
                />
                <div className="btn-row">
                  <button className="btn primary" onClick={() => applyPaste('replace')}>
                    Replace all slides
                  </button>
                  <button className="btn" onClick={() => applyPaste('append')}>
                    Append slides
                  </button>
                  <span className="faint small">{splitLyrics(pasteText).length} slide(s) detected</span>
                  <span style={{ flex: 1 }} />
                  <button className="btn ghost" onClick={() => setPasteOpen(false)}>
                    <X size={14} /> Close
                  </button>
                </div>
              </div>
            ) : null}

            <div className="editor-body">
              <div className="slides">
                {draft.slides.length === 0 ? <div className="empty">No slides yet. Use “Paste &amp; split” or add a slide.</div> : null}
                {draft.slides.map((s, index) => {
                  const assessment = assessSlide(s.text);
                  const isLiveSlide = liveHere && live?.index === index;
                  return (
                    <div
                      key={s.id}
                      className={`slide-card ${index === selected ? 'selected' : ''} ${isLiveSlide ? 'is-live' : ''}`}
                      onClick={() => setSelected(index)}
                    >
                      <div className="num">
                        {index + 1}
                        {isLiveSlide ? <div className="badge live" style={{ marginTop: 4 }}>Live</div> : null}
                      </div>
                      <div>
                        <textarea
                          className="textarea"
                          value={s.text}
                          rows={Math.min(10, Math.max(3, s.text.split('\n').length + 1))}
                          maxLength={MAX_SLIDE_CHARS}
                          aria-label={`Slide ${index + 1}`}
                          onFocus={() => setSelected(index)}
                          onChange={(e) => {
                            const text = e.target.value;
                            updateSlides((slides) => slides.map((x) => (x.id === s.id ? { ...x, text } : x)));
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 's' && e.ctrlKey) {
                              e.preventDefault();
                              void save();
                            }
                          }}
                        />
                        {assessment.advice ? <div className="small warn-text" style={{ marginTop: 4 }}>⚠ {assessment.advice}</div> : null}
                      </div>
                      <div className="side" onClick={(e) => e.stopPropagation()}>
                        <button className="btn sm live" title="Present this slide" onClick={() => presentSlide(index)} disabled={!s.text.trim()}>
                          <Send size={12} />
                        </button>
                        <button className="btn sm icon" title="Preview this slide (not live)" onClick={() => setSelected(index)}>
                          <Eye size={13} />
                        </button>
                        <button
                          className="btn sm icon"
                          title="Move up"
                          disabled={index === 0}
                          onClick={() => {
                            updateSlides((slides) => moveSlide(slides, index, index - 1));
                            setSelected(index - 1);
                          }}
                        >
                          <ArrowUp size={13} />
                        </button>
                        <button
                          className="btn sm icon"
                          title="Move down"
                          disabled={index === draft.slides.length - 1}
                          onClick={() => {
                            updateSlides((slides) => moveSlide(slides, index, index + 1));
                            setSelected(index + 1);
                          }}
                        >
                          <ArrowDown size={13} />
                        </button>
                        <button
                          className="btn sm icon"
                          title="Insert a slide below"
                          onClick={() => {
                            updateSlides((slides) => [...slides.slice(0, index + 1), { id: newId(), text: '' }, ...slides.slice(index + 1)]);
                            setSelected(index + 1);
                          }}
                        >
                          <Plus size={13} />
                        </button>
                        <ConfirmButton className="btn sm icon danger" confirmLabel="?" title="Remove slide" onConfirm={() => {
                          updateSlides((slides) => slides.filter((x) => x.id !== s.id));
                          setSelected((sel) => Math.max(0, Math.min(sel, draft.slides.length - 2)));
                        }}>
                          <Trash2 size={13} />
                        </ConfirmButton>
                      </div>
                    </div>
                  );
                })}
                <button
                  className="btn"
                  style={{ alignSelf: 'flex-start' }}
                  onClick={() => {
                    updateSlides((slides) => [...slides, { id: newId(), text: '' }]);
                    setSelected(draft.slides.length);
                  }}
                >
                  <Plus size={14} /> Add slide
                </button>
              </div>

              <div className="live-side">
                <div>
                  <div className="panel-head">
                    <span className="section-title" style={{ color: 'var(--preview)' }}>
                      Preview · slide {draft.slides.length ? selected + 1 : 0}
                    </span>
                  </div>
                  <div className="monitor preview">
                    <LyricsStage text={slide?.text ?? ''} style={style} onFit={setFitScale} />
                  </div>
                  {slide && fitScale < DENSE_SCALE_THRESHOLD ? (
                    <div className="small warn-text" style={{ marginTop: 6 }}>
                      ⚠ This slide is shrunk to {Math.round(fitScale * 100)}% to fit. Consider splitting it.
                    </div>
                  ) : null}
                  <div className="btn-row" style={{ marginTop: 8 }}>
                    <button className="btn live" style={{ flex: 1 }} disabled={!slide?.text.trim()} onClick={() => presentSlide(selected)}>
                      <Send size={14} /> Present slide {draft.slides.length ? selected + 1 : ''}
                    </button>
                  </div>
                </div>

                <div>
                  <div className="section-title" style={{ marginBottom: 6 }}>
                    Next slide
                  </div>
                  <div className="monitor" style={{ width: '60%' }}>
                    {nextSlide ? <LyricsStage text={nextSlide.text} style={style} /> : <div className="center-msg">End of song</div>}
                  </div>
                </div>

                <div
                  ref={controllerRef}
                  className="lyrics-controller"
                  tabIndex={0}
                  onKeyDown={onControllerKey}
                  aria-label="Live lyrics controller. Use the arrow keys to change the live slide."
                >
                  <div className="panel-head" style={{ marginBottom: 6 }}>
                    <span className="section-title" style={{ color: 'var(--live)' }}>
                      Live control
                    </span>
                    <span className="spacer" />
                    {live ? <span className="badge live">Slide {live.index + 1}/{live.slides.length}</span> : <span className="badge dim">Not live</span>}
                  </div>
                  {live ? (
                    <>
                      <div className="small" style={{ marginBottom: 8 }}>
                        {liveHere ? 'This song is live.' : <>Live song: <b>{live.title}</b></>}
                      </div>
                      <div className="btn-row">
                        <button className="btn" disabled={live.index === 0} onClick={() => run('output:lyrics', { command: 'previous' })}>
                          <ChevronLeft size={15} /> Prev
                        </button>
                        <button className="btn" disabled={live.index >= live.slides.length - 1} onClick={() => run('output:lyrics', { command: 'next' })}>
                          Next <ChevronRight size={15} />
                        </button>
                        <button className="btn live" onClick={() => run('output:clear')}>
                          Clear
                        </button>
                      </div>
                      {!liveHere ? (
                        <button
                          className="btn sm"
                          style={{ marginTop: 8 }}
                          onClick={() => {
                            const song = songs.find((s) => s.id === live.songId);
                            if (song) open(song);
                          }}
                        >
                          Return to the live song
                        </button>
                      ) : null}
                      {liveDiffers ? (
                        <div className="small warn-text" style={{ marginTop: 8 }}>
                          The live slides are the version presented earlier. Present a slide again to use your edits.
                        </div>
                      ) : null}
                      <div className="small faint" style={{ marginTop: 8 }}>
                        Click this box, then use the arrow keys to change slides.
                      </div>
                    </>
                  ) : snap.output.status === 'EMPTY' && snap.output.restorable?.lyrics ? (
                    <button className="btn" onClick={() => run('output:restore')}>
                      Restore lyrics “{snap.output.restorable.lyrics.title}”
                    </button>
                  ) : (
                    <div className="small faint">Present a slide to control lyrics live from here.</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
