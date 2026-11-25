// GET /api/download?platform=windows|windows-portable|mac|mac-intel
// (also reachable as /download/<platform>, see vercel.json)
// Redirects to that platform's installer in the latest release, or to the
// releases page if it cannot be found.
import { CACHE_HEADER, latestRelease, releasesPage } from './_release.js';

const KEYS = { windows: 'windows', 'windows-portable': 'windowsPortable', mac: 'macArm', 'mac-arm': 'macArm', 'mac-intel': 'macIntel' };

export default async function handler(req, res) {
  const key = KEYS[String(req.query.platform || '').toLowerCase()];
  let target = releasesPage();
  try {
    const asset = key ? (await latestRelease()).assets[key] : null;
    if (asset) target = asset.url;
    res.setHeader('Cache-Control', CACHE_HEADER);
  } catch {
    res.setHeader('Cache-Control', 'no-store');
  }
  res.redirect(302, target);
}
