import fs from 'node:fs';
import path from 'node:path';

/**
 * Finds the NDI® library. The app does not ship NDI; it uses an installed copy.
 *
 * Windows:
 *  1. the official NDI Runtime (environment variables set by its installer),
 *  2. the copy that vMix installs in its own folder.
 * macOS:
 *  1. the NDI Runtime environment variables, if set,
 *  2. the runtime installed by NDI Tools / the NDI SDK in their standard locations.
 *
 * NDI® is a registered trademark of Vizrt NDI AB (https://ndi.video).
 */
export function findNdiLibrary(env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform): string | null {
  const candidates = platform === 'darwin' ? macCandidates(env) : windowsCandidates(env);
  return candidates.find((file) => fs.existsSync(file)) ?? null;
}

const RUNTIME_VARS = ['NDI_RUNTIME_DIR_V6', 'NDI_RUNTIME_DIR_V5', 'NDI_RUNTIME_DIR_V4'];

function windowsCandidates(env: NodeJS.ProcessEnv): string[] {
  const candidates: string[] = [];
  for (const key of RUNTIME_VARS) {
    const dir = env[key];
    if (dir) candidates.push(path.join(dir, 'Processing.NDI.Lib.x64.dll'));
  }
  const programFiles = env['ProgramFiles'] ?? 'C:\\Program Files';
  const programFilesX86 = env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)';
  candidates.push(
    path.join(programFiles, 'NDI', 'NDI 6 Runtime', 'v6', 'Processing.NDI.Lib.x64.dll'),
    path.join(programFiles, 'NDI', 'NDI 5 Runtime', 'v5', 'Processing.NDI.Lib.x64.dll'),
    path.join(programFilesX86, 'vMix', 'ndi', 'x64', 'Processing.NDI.Lib.dll'),
    path.join(programFiles, 'vMix', 'ndi', 'x64', 'Processing.NDI.Lib.dll')
  );
  return candidates;
}

function macCandidates(env: NodeJS.ProcessEnv): string[] {
  const candidates: string[] = [];
  for (const key of RUNTIME_VARS) {
    const dir = env[key];
    if (dir) candidates.push(path.posix.join(dir, 'libndi.dylib'));
  }
  candidates.push(
    // NDI Runtime (installed by NDI Tools for Mac)
    '/usr/local/lib/libndi.dylib',
    '/Library/NDI/lib/libndi.dylib',
    // NDI SDK for Apple (developer install)
    '/Library/NDI 6 SDK for Apple/lib/macOS/libndi.dylib',
    '/Library/NDI SDK for Apple/lib/macOS/libndi.dylib',
    // Homebrew on Apple silicon
    '/opt/homebrew/lib/libndi.dylib'
  );
  return candidates;
}

/** How to get NDI on this platform, shown when it is missing. */
export function ndiInstallHint(platform: NodeJS.Platform = process.platform): string {
  return platform === 'darwin'
    ? 'NDI is not installed. Install the free NDI Tools for Mac from ndi.video, then restart the app.'
    : 'NDI is not installed. Install the free NDI Runtime from ndi.video (or vMix on this computer), then restart the app.';
}
