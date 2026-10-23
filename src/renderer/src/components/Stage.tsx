import type { AppSnapshot } from '../../../shared/types';
import { formatSourceLine } from '../../../shared/research';
import { lyricsStyleFor } from '../../../shared/settings';
import { LyricsStage } from './LyricsStage';

/**
 * What panels 2 and 3 draw for images and lyrics. Both panels render this same
 * component, so the vMix output is an exact mirror of the player panel.
 * Videos are drawn by native YouTube views placed over the stage.
 */
export function Stage({ snap, imageSrc, clean }: { snap: AppSnapshot; imageSrc: string | null; clean: boolean }) {
  const p = snap.program;
  if (p.kind === 'image') {
    return imageSrc ? <img className="stage-image" src={imageSrc} alt="" referrerPolicy="no-referrer" draggable={false} /> : null;
  }
  if (p.kind === 'lyrics') {
    return (
      <LyricsStage
        text={p.slides[p.index] ?? ''}
        style={lyricsStyleFor(snap.settings, p.source !== null)}
        source={p.source ? formatSourceLine(p.source) : null}
      />
    );
  }
  if (p.kind === 'video' && !clean && p.status === 'error') {
    return <div className="stage-message error-text">{p.error}</div>;
  }
  if (p.kind === 'empty' && !clean) {
    return <div className="stage-message">Click an image or a video, or highlight lyrics or research text in panel 1.</div>;
  }
  return null;
}
