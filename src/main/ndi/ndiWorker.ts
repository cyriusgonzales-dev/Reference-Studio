import { parentPort, workerData } from 'node:worker_threads';
import koffi from 'koffi';

/**
 * Worker thread that owns the NDI sender. Sending a 1080p frame takes a few
 * milliseconds (NDI compresses it), so it runs here instead of the main
 * thread. Messages: video frames (BGRA), audio blocks (planar float32), stop.
 */

export type WorkerIn =
  | { type: 'video'; width: number; height: number; data: ArrayBuffer }
  | { type: 'audio'; sampleRate: number; channels: number; samples: number; data: ArrayBuffer }
  | { type: 'stop' };

export type WorkerOut =
  | { type: 'ready'; version: string }
  | { type: 'error'; message: string }
  | { type: 'sent' }
  | { type: 'connections'; count: number };

const port = parentPort;
if (!port) throw new Error('ndiWorker must run as a worker thread');
const { libraryPath, sourceName } = workerData as { libraryPath: string; sourceName: string };

const FOURCC_BGRA = 0x41524742; // 'BGRA'
const FRAME_FORMAT_PROGRESSIVE = 1;
const TIMECODE_SYNTHESIZE = 9223372036854775807n;

function post(message: WorkerOut): void {
  port!.postMessage(message);
}

try {
  const lib = koffi.load(libraryPath);
  // Struct types are registered by name and referenced in the function prototypes below.
  koffi.struct('NDIlib_send_create_t', {
    p_ndi_name: 'const char*',
    p_groups: 'const char*',
    clock_video: 'bool',
    clock_audio: 'bool'
  });
  koffi.struct('NDIlib_video_frame_v2_t', {
    xres: 'int',
    yres: 'int',
    FourCC: 'int',
    frame_rate_N: 'int',
    frame_rate_D: 'int',
    picture_aspect_ratio: 'float',
    frame_format_type: 'int',
    timecode: 'int64_t',
    p_data: 'void*',
    line_stride_in_bytes: 'int',
    p_metadata: 'const char*',
    timestamp: 'int64_t'
  });
  koffi.struct('NDIlib_audio_frame_v2_t', {
    sample_rate: 'int',
    no_channels: 'int',
    no_samples: 'int',
    timecode: 'int64_t',
    p_data: 'void*',
    channel_stride_in_bytes: 'int',
    p_metadata: 'const char*',
    timestamp: 'int64_t'
  });

  const version = lib.func('const char* NDIlib_version()');
  const initialize = lib.func('bool NDIlib_initialize()');
  const sendCreate = lib.func('void* NDIlib_send_create(const NDIlib_send_create_t*)');
  const sendDestroy = lib.func('void NDIlib_send_destroy(void*)');
  const sendVideo = lib.func('void NDIlib_send_send_video_v2(void*, const NDIlib_video_frame_v2_t*)');
  const sendAudio = lib.func('void NDIlib_send_send_audio_v2(void*, const NDIlib_audio_frame_v2_t*)');
  const connections = lib.func('int NDIlib_send_get_no_connections(void*, uint32_t)');

  if (!initialize()) throw new Error('NDI could not start on this computer (unsupported CPU?).');
  const sender = sendCreate({ p_ndi_name: sourceName, p_groups: null, clock_video: false, clock_audio: false }) as unknown;
  if (!sender) throw new Error('The NDI sender could not be created.');
  post({ type: 'ready', version: String(version()) });

  let lastCount = -1;
  const timer = setInterval(() => {
    const count = Number(connections(sender, 0));
    if (count !== lastCount) {
      lastCount = count;
      post({ type: 'connections', count });
    }
  }, 1000);

  port.on('message', (msg: WorkerIn) => {
    switch (msg.type) {
      case 'video':
        sendVideo(sender, {
          xres: msg.width,
          yres: msg.height,
          FourCC: FOURCC_BGRA,
          frame_rate_N: 30000,
          frame_rate_D: 1000,
          picture_aspect_ratio: msg.width / msg.height,
          frame_format_type: FRAME_FORMAT_PROGRESSIVE,
          timecode: TIMECODE_SYNTHESIZE,
          p_data: msg.data,
          line_stride_in_bytes: msg.width * 4,
          p_metadata: null,
          timestamp: 0n
        });
        post({ type: 'sent' });
        break;
      case 'audio':
        sendAudio(sender, {
          sample_rate: msg.sampleRate,
          no_channels: msg.channels,
          no_samples: msg.samples,
          timecode: TIMECODE_SYNTHESIZE,
          p_data: msg.data,
          channel_stride_in_bytes: msg.samples * 4,
          p_metadata: null,
          timestamp: 0n
        });
        break;
      case 'stop':
        clearInterval(timer);
        sendDestroy(sender);
        port.close();
        break;
    }
  });
} catch (error) {
  post({ type: 'error', message: (error as Error).message });
}
