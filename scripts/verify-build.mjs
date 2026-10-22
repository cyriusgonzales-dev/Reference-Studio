// Fails the build if a preload script would require anything other than Electron.
// Sandboxed preloads can only load a small set of built-in modules.
import fs from 'node:fs';
import path from 'node:path';

const dir = path.resolve('out/preload');
const files = fs.readdirSync(dir, { withFileTypes: true });
let ok = true;
for (const entry of files) {
  if (entry.isDirectory()) {
    console.error(`Unexpected directory in preload output: ${entry.name} (shared chunk?)`);
    ok = false;
    continue;
  }
  const text = fs.readFileSync(path.join(dir, entry.name), 'utf8');
  for (const match of text.matchAll(/require\(["']([^"']+)["']\)/g)) {
    if (match[1] !== 'electron') {
      console.error(`${entry.name} requires "${match[1]}", which a sandboxed preload cannot load.`);
      ok = false;
    }
  }
}
if (!ok) process.exit(1);
console.log('Preload bundles are self-contained.');
