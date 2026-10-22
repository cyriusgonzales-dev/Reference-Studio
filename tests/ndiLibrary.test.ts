import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { findNdiLibrary } from '../src/main/ndi/ndiLibrary';

describe('finding the NDI library', () => {
  it('prefers the official NDI Runtime, then the copy vMix installs', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vrs-ndi-'));
    try {
      const runtime = path.join(root, 'runtime');
      const vmix = path.join(root, 'x86', 'vMix', 'ndi', 'x64');
      fs.mkdirSync(runtime, { recursive: true });
      fs.mkdirSync(vmix, { recursive: true });
      fs.writeFileSync(path.join(vmix, 'Processing.NDI.Lib.dll'), '');
      const env = { ProgramFiles: path.join(root, 'pf'), 'ProgramFiles(x86)': path.join(root, 'x86'), NDI_RUNTIME_DIR_V6: runtime };

      expect(findNdiLibrary(env)).toBe(path.join(vmix, 'Processing.NDI.Lib.dll'));
      fs.writeFileSync(path.join(runtime, 'Processing.NDI.Lib.x64.dll'), '');
      expect(findNdiLibrary(env)).toBe(path.join(runtime, 'Processing.NDI.Lib.x64.dll'));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('returns null when NDI is not installed', () => {
    expect(findNdiLibrary({ ProgramFiles: 'Z:\none', 'ProgramFiles(x86)': 'Z:\none' })).toBeNull();
  });
});
