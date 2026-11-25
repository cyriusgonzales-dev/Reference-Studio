// Stops a release that would ship with placeholder or inconsistent settings:
//  - the GitHub releases repository must be filled in, and be the same in electron-builder.yml,
//    src/shared/product.ts and website/api/_release.js (the updater and the website read from it);
//  - in CI, the pushed tag must match the version in package.json.
// The releases repository is public and may differ from the (private) source repository
// in package.json's repository.url.
import fs from 'node:fs';

const fail = [];
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const builder = fs.readFileSync('electron-builder.yml', 'utf8');
const product = fs.readFileSync('src/shared/product.ts', 'utf8');
const website = fs.readFileSync('website/api/_release.js', 'utf8');

const owner = builder.match(/^\s*owner:\s*(\S+)/m)?.[1];
const repo = builder.match(/^\s*repo:\s*(\S+)/m)?.[1];
const productRepo = product.match(/GITHUB_REPO = '([^']+)'/)?.[1];
const websiteRepo = website.match(/DEFAULT_REPO = '([^']+)'/)?.[1];

if (!owner || !repo) fail.push('electron-builder.yml: publish.owner and publish.repo must be set.');
if (/your-github-username/.test(`${owner} ${productRepo} ${websiteRepo} ${pkg.repository?.url}`)) {
  fail.push('Replace "your-github-username" with the real GitHub account in electron-builder.yml, src/shared/product.ts, website/api/_release.js and package.json.');
}
if (productRepo !== `${owner}/${repo}`) fail.push(`src/shared/product.ts GITHUB_REPO (${productRepo}) does not match electron-builder.yml (${owner}/${repo}).`);
if (websiteRepo !== `${owner}/${repo}`) fail.push(`website/api/_release.js DEFAULT_REPO (${websiteRepo}) does not match electron-builder.yml (${owner}/${repo}).`);

const ref = process.env.GITHUB_REF_NAME;
if (ref && /^v\d/.test(ref) && ref !== `v${pkg.version}`) fail.push(`Tag ${ref} does not match package.json version ${pkg.version}. Run "npm version <x.y.z>" before tagging.`);

if (fail.length) {
  console.error('Release configuration is not ready:\n' + fail.map((f) => `  - ${f}`).join('\n'));
  process.exit(1);
}
console.log(`Release configuration OK: releases go to ${owner}/${repo}, v${pkg.version}`);
