// Empties the release folder before packaging, so it only ever holds the latest build.
import fs from 'node:fs';
import path from 'node:path';

const dir = path.resolve('release');
if (fs.existsSync(dir)) {
  for (const entry of fs.readdirSync(dir)) fs.rmSync(path.join(dir, entry), { recursive: true, force: true });
  console.log('Cleared old builds from release/');
}
