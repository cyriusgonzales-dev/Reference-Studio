import { ipcRenderer } from 'electron';
import { MAX_AUDIO_BLOCK, NDI_AUDIO_CHANNEL } from '../shared/audioChannels';

/**
 * Runs (isolated from the page) in the offscreen output video player. It
 * routes the YouTube <video> element's sound through Web Audio, keeps playing
 * it on the speakers, and sends a copy of the samples to the main process for
 * the NDI output. Nothing is exposed to the page.
 */

const BLOCK = 2048;
let tapped: HTMLVideoElement | null = null;
let context: AudioContext | null = null;

function tap(video: HTMLVideoElement): void {
  if (tapped === video) return;
  try {
    context ??= new AudioContext({ latencyHint: 'interactive' });
    const ctx = context;
    const source = ctx.createMediaElementSource(video);
    source.connect(ctx.destination); // keep it audible locally
    // ScriptProcessorNode needs no module file, which YouTube's CSP could block for an AudioWorklet.
    const processor = ctx.createScriptProcessor(BLOCK, 2, 2);
    source.connect(processor);
    processor.connect(ctx.destination); // its output stays silent; it only reads the input
    processor.onaudioprocess = (event) => {
      const input = event.inputBuffer;
      const channels = Math.min(2, input.numberOfChannels);
      const samples = Math.min(input.length, MAX_AUDIO_BLOCK);
      const planar = new Float32Array(samples * channels);
      for (let c = 0; c < channels; c++) planar.set(input.getChannelData(c).subarray(0, samples), c * samples);
      ipcRenderer.send(NDI_AUDIO_CHANNEL, { sampleRate: ctx.sampleRate, channels, samples, data: planar.buffer });
    };
    tapped = video;
    void ctx.resume();
  } catch {
    // A video element can only be tapped once; YouTube occasionally swaps it.
  }
}

function scan(): void {
  const video = document.querySelector<HTMLVideoElement>('video.html5-main-video') ?? document.querySelector('video');
  if (video) tap(video);
}

let scanPending = false;
function scheduleScan(): void {
  if (scanPending) return;
  scanPending = true;
  setTimeout(() => {
    scanPending = false;
    scan();
  }, 250);
}

if (window.top === window) {
  window.addEventListener('DOMContentLoaded', () => {
    scan();
    new MutationObserver(scheduleScan).observe(document.documentElement, { childList: true, subtree: true });
  });
}
