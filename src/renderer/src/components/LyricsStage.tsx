import { useLayoutEffect, useRef, useState } from 'react';
import type { LyricsStyle } from '../../../shared/types';
import { applyLyricsStyle, fitLyricsText, REFERENCE_HEIGHT } from '../lib/lyricsRender';

interface Props {
  text: string;
  style: LyricsStyle;
  /** Output aspect ratio (width / height). */
  aspect?: number;
  /** Receives the auto-fit scale (1 = configured font size). */
  onFit?: (scale: number) => void;
  className?: string;
}

/**
 * Renders a lyrics slide exactly as the Presentation Output does, on a virtual
 * 1080-pixel-tall stage scaled down to the container.
 */
export function LyricsStage({ text, style, aspect = 16 / 9, onFit, className }: Props) {
  const outerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const onFitRef = useRef(onFit);
  const [zoom, setZoom] = useState(0.2);
  const stageWidth = Math.round(REFERENCE_HEIGHT * aspect);

  useLayoutEffect(() => {
    onFitRef.current = onFit;
  });

  useLayoutEffect(() => {
    const outer = outerRef.current;
    if (!outer) return;
    const update = () => setZoom(outer.clientWidth / stageWidth || 0.2);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(outer);
    return () => ro.disconnect();
  }, [stageWidth]);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    const textEl = textRef.current;
    if (!stage || !textEl) return;
    applyLyricsStyle(stage, textEl, style, REFERENCE_HEIGHT);
    const scale = fitLyricsText(stage, textEl, style, REFERENCE_HEIGHT);
    onFitRef.current?.(scale);
  }, [text, style, stageWidth]);

  return (
    <div
      ref={outerRef}
      className={className}
      style={{ position: 'relative', width: '100%', aspectRatio: String(aspect), overflow: 'hidden', background: '#000' }}
    >
      <div
        ref={stageRef}
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: stageWidth,
          height: REFERENCE_HEIGHT,
          transform: `scale(${zoom})`,
          transformOrigin: '0 0'
        }}
      >
        <div ref={textRef}>{text}</div>
      </div>
    </div>
  );
}
