import { useEffect, useRef } from 'react';

/**
 * Panel 3: a live preview of exactly what is sent over NDI. Frames arrive as
 * JPEGs from the main process; if decoding falls behind, frames are skipped.
 */
export function OutputPreview() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    let busy = false;
    let pending: Uint8Array | null = null;

    const draw = async (jpeg: Uint8Array) => {
      busy = true;
      try {
        const bitmap = await createImageBitmap(new Blob([jpeg as Uint8Array<ArrayBuffer>], { type: 'image/jpeg' }));
        if (canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
        }
        ctx.drawImage(bitmap, 0, 0);
        bitmap.close();
      } catch {
        // a damaged frame is simply skipped
      } finally {
        busy = false;
        if (pending) {
          const next = pending;
          pending = null;
          void draw(next);
        }
      }
    };

    return window.vrs.on('app:outputFrame', (jpeg) => {
      if (busy) pending = jpeg;
      else void draw(jpeg);
    });
  }, []);

  return <canvas ref={canvasRef} className="output-canvas" width={960} height={540} />;
}
