// GET /api/latest → { version, publishedAt, notesUrl, assets: { windows, windowsPortable, macArm, macIntel } }
import { CACHE_HEADER, latestRelease, releasesPage } from './_release.js';

export default async function handler(_req, res) {
  try {
    const release = await latestRelease();
    res.setHeader('Cache-Control', CACHE_HEADER);
    res.status(200).json(release);
  } catch (error) {
    res.setHeader('Cache-Control', 'public, s-maxage=60');
    res.status(502).json({ error: error.message, releasesUrl: releasesPage() });
  }
}
