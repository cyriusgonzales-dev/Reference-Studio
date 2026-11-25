// Stops a release that would ship with placeholder or inconsistent settings:
//  - the GitHub repository must be filled in, and be the same in electron-builder.yml,
//    src/shared/product.ts and package.json (the updater reads releases from it);
//  - in CI, the pushed tag must match the version in package.json.
import fs from 'node:fs';

const fail = [];
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const builder = fs.readFileSync('electron-builder.yml', 'utf8');
const product = fs.readFileSync('src/shared/product.ts', 'utf8');

const owner = builder.match(/^\s*owner:\s*(\S+)/m)?.[1];
const repo = builder.match(/^\s*repo:\s*(\S+)/m)?.[1];
const productRepo = product.match(/GITHUB_REPO = '([^']+)'/)?.[1];

if (!owner || !repo) fail.push('electron-builder.yml: publish.owner and publish.repo must be set.');
if (/your-github-username/.test(`${owner} ${productRepo} ${pkg.repository?.url}`)) {
  fail.push('Replace "your-github-username" with the real GitHub account in electron-builder.yml, src/shared/product.ts and package.json.');
}
if (productRepo !== `${owner}/${repo}`) fail.push(`src/shared/product.ts GITHUB_REPO (${productRepo}) does not match electron-builder.yml (${owner}/${repo}).`);
if (pkg.repository?.url && !pkg.repository.url.includes(`${owner}/${repo}`)) fail.push('package.json repository.url does not match electron-builder.yml.');

const ref = process.env.GITHUB_REF_NAME;
if (ref && /^v\d/.test(ref) && ref !== `v${pkg.version}`) fail.push(`Tag ${ref} does not match package.json version ${pkg.version}. Run "npm version <x.y.z>" before tagging.`);

if (fail.length) {
  console.error('Release configuration is not ready:\n' + fail.map((f) => `  - ${f}`).join('\n'));
  process.exit(1);
}
console.log(`Release configuration OK: ${owner}/${repo} v${pkg.version}`);
