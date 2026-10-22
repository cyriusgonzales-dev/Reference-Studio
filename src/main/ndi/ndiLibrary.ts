import fs from 'node:fs';
import path from 'node:path';

/**
 * Finds the NDI® library. The app does not ship NDI; it uses an installed copy:
 *  1. the official NDI Runtime (environment variables set by its installer),
 *  2. the copy that vMix installs in its own folder.
 * NDI® is a registered trademark of Vizrt NDI AB (https://ndi.video).
 */
export function findNdiLibrary(env: NodeJS.ProcessEnv = process.env): string | null {
  const candidates: string[] = [];
  for (const key of ['NDI_RUNTIME_DIR_V6', 'NDI_RUNTIME_DIR_V5', 'NDI_RUNTIME_DIR_V4']) {
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
  return candidates.find((file) => fs.existsSync(file)) ?? null;
}
