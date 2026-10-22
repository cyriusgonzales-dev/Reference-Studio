import { useState } from 'react';
import { ExternalLink, ListPlus, Send, X } from 'lucide-react';
import type { AppSnapshot, PresentableItem } from '../../../shared/types';
import { run } from '../lib/api';
import { itemSubtitle, itemThumbnail, KIND_LABEL } from '../lib/format';
import { useSongs } from '../lib/stores';
import { LyricsStage } from './LyricsStage';

function PreviewMonitor({ item, snap }: { item: PresentableItem; snap: AppSnapshot }) {
  const songs = useSongs();
  const [useThumb, setUseThumb] = useState<string | null>(null);

  if (item.kind === 'image') {
    const src = useThumb === item.id && item.thumbnailUrl ? item.thumbnailUrl : item.imageUrl;
    return (
      <div className="monitor preview">
        <img
          className="fit"
          src={src}
          alt=""
          referrerPolicy="no-referrer"
          onError={() => {
            if (item.thumbnailUrl && useThumb !== item.id) setUseThumb(item.id);
          }}
        />
        {useThumb === item.id ? <div className="overlay-label">Original failed to load here; showing the thumbnail.</div> : null}
      </div>
    );
  }
  if (item.kind === 'video') {
    return (
      <div className="monitor preview">
        <img className="fit" src={itemThumbnail(item) ?? ''} alt="" referrerPolicy="no-referrer" />
        <div className="overlay-label">YouTube · {item.videoId}</div>
      </div>
    );
  }
  const song = songs.find((s) => s.id === item.songId);
  const text = song?.slides[item.slideIndex]?.text;
  return (
    <div className="monitor preview">
      {text !== undefined ? (
        <LyricsStage text={text} style={snap.settings.lyrics} />
      ) : (
        <div className="center-msg">This song is no longer in the library.</div>
      )}
    </div>
  );
}

export function PreviewPanel({ snap }: { snap: AppSnapshot }) {
  const item = snap.preview;
  return (
    <section className="panel" aria-label="Preview">
      <div className="panel-head">
        <span className="section-title" style={{ color: 'var(--preview)' }}>
          Preview
        </span>
        <span className="faint small">not live</span>
        <span className="spacer" />
        {item ? (
          <button className="btn sm icon ghost" title="Close preview" onClick={() => run('preview:set', { item: null })}>
            <X size={14} />
          </button>
        ) : null}
      </div>
      {item ? (
        <>
          <PreviewMonitor item={item} snap={snap} />
          <div style={{ margin: '8px 0' }}>
            <div className="ellipsis" title={item.title}>
              <span className="badge preview" style={{ marginRight: 6 }}>
                {KIND_LABEL[item.kind]}
              </span>
              {item.title}
            </div>
            <div className="small faint ellipsis">{itemSubtitle(item)}</div>
          </div>
          <div className="btn-row">
            <button className="btn live" style={{ flex: 1 }} onClick={() => run('output:present', { item })} title="Send to the Presentation Output (Ctrl+Enter)">
              <Send size={14} /> Present
            </button>
            <button className="btn" onClick={() => run('queue:add', { item })} title="Add to the end of the queue">
              <ListPlus size={14} /> Queue
            </button>
            {item.kind !== 'lyrics' ? (
              <button
                className="btn icon"
                title={item.kind === 'video' ? 'Open on YouTube in your browser' : 'Open the image in your browser'}
                onClick={() =>
                  run('app:openExternal', {
                    url: item.kind === 'video' ? item.sourceUrl : (item.sourcePageUrl ?? item.imageUrl)
                  })
                }
                disabled={item.kind === 'image' && item.imageUrl.startsWith('data:') && !item.sourcePageUrl}
              >
                <ExternalLink size={14} />
              </button>
            ) : null}
          </div>
        </>
      ) : (
        <div className="small faint">
          Right-click an image or video in the research browser and choose <b>Preview</b>, or select a queue item. Previewing never changes the live
          output.
        </div>
      )}
    </section>
  );
}
