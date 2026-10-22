import path from 'node:path';
import { Worker } from 'node:worker_threads';
import type { NdiStatus } from '../../shared/types';
import { findNdiLibrary } from './ndiLibrary';
import type { WorkerIn, WorkerOut } from './ndiWorker';

/** Name shown in vMix as "<COMPUTER> (Vmix Reference Studio)". */
export const NDI_SOURCE_NAME = 'Vmix Reference Studio';
/** Frames queued for the worker beyond this are dropped rather than buffered. */
const MAX_FRAMES_IN_FLIGHT = 2;

/**
 * Main-thread side of the NDI output. Frames are handed to the worker thread
 * without copying (their buffers are transferred); if the worker falls behind,
 * frames are dropped so memory never grows and video never lags behind.
 */
export class NdiSender {
  private worker: Worker | null = null;
  private inFlight = 0;
  private statusValue: NdiStatus = { state: 'starting', sourceName: NDI_SOURCE_NAME, connections: 0, message: null };

  constructor(private readonly onChange: () => void) {}

  get status(): NdiStatus {
    return this.statusValue;
  }

  start(): void {
    const libraryPath = findNdiLibrary();
    if (!libraryPath) {
      this.update({
        state: 'unavailable',
        message: 'NDI is not installed. Install the free NDI Runtime from ndi.video (or vMix on this computer), then restart the app.'
      });
      return;
    }
    const worker = new Worker(path.join(__dirname, 'ndiWorker.js'), { workerData: { libraryPath, sourceName: NDI_SOURCE_NAME } });
    this.worker = worker;
    worker.on('message', (msg: WorkerOut) => {
      switch (msg.type) {
        case 'ready':
          this.update({ state: 'running', message: null });
          break;
        case 'error':
          this.update({ state: 'error', message: `NDI could not start: ${msg.message}` });
          break;
        case 'sent':
          this.inFlight = Math.max(0, this.inFlight - 1);
          break;
        case 'connections':
          this.update({ connections: msg.count });
          break;
      }
    });
    worker.on('error', (error) => this.update({ state: 'error', message: `NDI stopped: ${error.message}` }));
    worker.on('exit', () => {
      if (this.worker === worker) this.worker = null;
    });
  }

  private update(patch: Partial<NdiStatus>): void {
    this.statusValue = { ...this.statusValue, ...patch };
    this.onChange();
  }

  /** Sends one BGRA frame. Returns false if it was dropped. */
  sendVideo(width: number, height: number, bgra: Buffer): boolean {
    if (!this.worker || this.statusValue.state !== 'running' || this.inFlight >= MAX_FRAMES_IN_FLIGHT) return false;
    const data = ownBuffer(bgra);
    this.inFlight++;
    this.post({ type: 'video', width, height, data }, [data]);
    return true;
  }

  sendAudio(sampleRate: number, channels: number, samples: number, planar: ArrayBuffer): void {
    if (!this.worker || this.statusValue.state !== 'running') return;
    this.post({ type: 'audio', sampleRate, channels, samples, data: planar }, [planar]);
  }

  private post(message: WorkerIn, transfer: ArrayBuffer[]): void {
    this.worker?.postMessage(message, transfer);
  }

  stop(): void {
    const worker = this.worker;
    this.worker = null;
    if (!worker) return;
    worker.postMessage({ type: 'stop' } satisfies WorkerIn);
    setTimeout(() => void worker.terminate(), 500);
  }
}

/** An ArrayBuffer holding exactly this data, safe to transfer to the worker. */
function ownBuffer(buf: Buffer): ArrayBuffer {
  if (buf.byteOffset === 0 && buf.byteLength === buf.buffer.byteLength && buf.buffer instanceof ArrayBuffer) return buf.buffer;
  const copy = new ArrayBuffer(buf.byteLength);
  new Uint8Array(copy).set(buf);
  return copy;
}
