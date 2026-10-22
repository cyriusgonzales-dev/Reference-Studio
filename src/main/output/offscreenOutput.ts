import { BrowserWindow, ipcMain, type IpcMainEvent, type NativeImage, type WebContents } from 'electron';
import { MAX_AUDIO_BLOCK, NDI_AUDIO_CHANNEL } from '../../shared/audioChannels';
import { OUTPUT_READY_CHANNEL, OUTPUT_RENDER_CHANNEL, type OutputPageState } from '../../shared/outputPage';
import type { NdiSender } from '../ndi/ndiSender';
import { isAppPageUrl, preloadPath, rendererPage } from '../paths';
import { lockNavigation } from '../security';

/** Size of the program picture sent over NDI. */
export const OUTPUT_SIZE = { width: 1920, height: 1080 } as const;
/**
 * Offscreen windows are laid out at half size and rendered at scale 2, so they
 * fit on any screen (Windows clamps windows larger than the screen) yet paint
 * full 1920×1080 frames. Chromium adds a few pixels; frames are centre-cropped.
 */
export const OFFSCREEN_LAYOUT = { width: OUTPUT_SIZE.width / 2, height: OUTPUT_SIZE.height / 2, scale: 2 } as const;
/** Size and rate of the panel 3 preview sent to the operator window. */
const PREVIEW_WIDTH = 960;
const PREVIEW_INTERVAL_MS = 33;
/** NDI receivers are sent a frame at least this often, even when nothing changes. */
const KEEPALIVE_MS = 500;

/**
 * Produces the program picture for NDI. Two offscreen sources exist:
 *  - the output page (images, lyrics, black), always present;
 *  - the output YouTube player while a video is shown.
 * Frames of whichever source is live are sent to NDI at full size and, scaled
 * down, to panel 3 as a preview, so panel 3 shows exactly what vMix receives.
 * The video player's audio arrives from its audio preload and goes to NDI too.
 */
export class OffscreenOutput {
  private readonly page: BrowserWindow;
  private pageReady = false;
  private pageState: OutputPageState = { kind: 'black', rev: 0 };
  private video: WebContents | null = null;
  private lastFrameAt = 0;
  private lastPreviewAt = 0;
  private readonly keepalive: NodeJS.Timeout;

  constructor(
    private readonly ndi: NdiSender,
    private readonly onPreview: (jpeg: Buffer) => void
  ) {
    this.page = new BrowserWindow({
      show: false,
      frame: false,
      width: OFFSCREEN_LAYOUT.width,
      height: OFFSCREEN_LAYOUT.height,
      useContentSize: true,
      backgroundColor: '#000000',
      webPreferences: {
        offscreen: { deviceScaleFactor: OFFSCREEN_LAYOUT.scale },
        preload: preloadPath('outputPage'),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true,
        backgroundThrottling: false,
        spellcheck: false
      }
    });
    const wc = this.page.webContents;
    wc.setFrameRate(30);
    lockNavigation(wc, (url) => isAppPageUrl(url, 'output'));
    wc.on('paint', (_e, _dirty, image) => this.frame(wc, image));
    wc.on('render-process-gone', () => {
      this.pageReady = false;
      setTimeout(() => {
        if (!wc.isDestroyed()) wc.reload();
      }, 300);
    });
    const target = rendererPage('output');
    if (target.kind === 'url') void this.page.loadURL(target.url);
    else void this.page.loadFile(target.file);

    ipcMain.on(OUTPUT_READY_CHANNEL, (event) => {
      if (event.sender !== wc) return;
      this.pageReady = true;
      wc.send(OUTPUT_RENDER_CHANNEL, this.pageState);
    });
    ipcMain.on(NDI_AUDIO_CHANNEL, (event, payload: unknown) => this.audio(event, payload));

    // Static pictures do not repaint by themselves; ask for a frame regularly so NDI receivers stay live.
    this.keepalive = setInterval(() => {
      if (Date.now() - this.lastFrameAt >= KEEPALIVE_MS) this.liveContents()?.invalidate();
    }, KEEPALIVE_MS / 2);
  }

  /** What the output page should draw (ignored while a video is live, but kept up to date). */
  render(state: OutputPageState): void {
    this.pageState = state;
    if (this.pageReady && !this.page.isDestroyed()) this.page.webContents.send(OUTPUT_RENDER_CHANNEL, state);
  }

  /** Makes a video player's offscreen window the live source, or returns to the output page. */
  setVideo(window: BrowserWindow | null): void {
    const wc = window && !window.isDestroyed() ? window.webContents : null;
    if (wc === this.video) return;
    this.video = wc;
    if (wc) wc.on('paint', (_e, _dirty, image) => this.frame(wc, image));
    this.liveContents()?.invalidate();
  }

  private liveContents(): WebContents | null {
    const live = this.video ?? (this.page.isDestroyed() ? null : this.page.webContents);
    return live && !live.isDestroyed() ? live : null;
  }

  private frame(source: WebContents, painted: NativeImage): void {
    if (source !== this.liveContents() || painted.isEmpty()) return;
    const now = Date.now();
    const image = cropToOutput(painted);
    const { width, height } = image.getSize();
    if (this.ndi.sendVideo(width, height, image.toBitmap())) this.lastFrameAt = now;
    if (now - this.lastPreviewAt >= PREVIEW_INTERVAL_MS) {
      this.lastPreviewAt = now;
      this.onPreview(image.resize({ width: PREVIEW_WIDTH, quality: 'good' }).toJPEG(82));
    }
  }

  /** Audio blocks from the output video player's preload. */
  private audio(event: IpcMainEvent, payload: unknown): void {
    if (!this.video || event.sender !== this.video || !event.senderFrame || event.senderFrame !== event.sender.mainFrame) return;
    if (typeof payload !== 'object' || payload === null) return;
    const { sampleRate, channels, samples, data: raw } = payload as Record<string, unknown>;
    // IPC may deliver the samples as an ArrayBuffer or a typed array; work on a private copy either way.
    const data =
      raw instanceof ArrayBuffer ? raw : ArrayBuffer.isView(raw) ? new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength).slice().buffer : null;
    if (
      typeof sampleRate !== 'number' ||
      typeof channels !== 'number' ||
      typeof samples !== 'number' ||
      !data ||
      !Number.isInteger(sampleRate) ||
      sampleRate < 8000 ||
      sampleRate > 192_000 ||
      (channels !== 1 && channels !== 2) ||
      !Number.isInteger(samples) ||
      samples <= 0 ||
      samples > MAX_AUDIO_BLOCK ||
      data.byteLength !== samples * channels * 4
    ) {
      return;
    }
    this.ndi.sendAudio(sampleRate, channels, samples, data);
  }

  destroy(): void {
    clearInterval(this.keepalive);
    if (!this.page.isDestroyed()) this.page.destroy();
  }
}

/** Centre-crops a painted frame to the NDI size when Chromium painted a few extra pixels. */
function cropToOutput(image: NativeImage): NativeImage {
  const { width, height } = image.getSize();
  if (width <= OUTPUT_SIZE.width && height <= OUTPUT_SIZE.height) return image;
  const w = Math.min(width, OUTPUT_SIZE.width);
  const h = Math.min(height, OUTPUT_SIZE.height);
  return image.crop({ x: Math.floor((width - w) / 2), y: Math.floor((height - h) / 2), width: w, height: h });
}
