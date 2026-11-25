// Shared by /api/latest and /api/download: finds the newest published release on
// GitHub and picks each platform's installer from its assets by file name.
//
// Vercel environment variables:
//   GITHUB_REPO   "owner/repository" (required unless the default below is right)
//   GITHUB_TOKEN  optional; raises GitHub's rate limit (fine-grained, read-only "Contents")

const DEFAULT_REPO = 'cyriusgonzales-dev/Reference-Studio';

export function repo() {
  return (process.env.GITHUB_REPO || DEFAULT_REPO).trim();
}

export function releasesPage() {
  return `https://github.com/${repo()}/releases/latest`;
}

/** Which asset is which: names come from electron-builder.yml (artifactName). */
const MATCHERS = {
  windows: (n) => /Setup-[\d.]+.*\.exe$/i.test(n),
  windowsPortable: (n) => /portable\.exe$/i.test(n),
  macArm: (n) => /mac-arm64\.dmg$/i.test(n),
  macIntel: (n) => /mac-x64\.dmg$/i.test(n)
};

export async function latestRelease() {
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'release-download-site', 'X-GitHub-Api-Version': '2022-11-28' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const response = await fetch(`https://api.github.com/repos/${repo()}/releases/latest`, { headers });
  if (!response.ok) throw new Error(`GitHub answered ${response.status}`);
  const release = await response.json();
  const assets = {};
  for (const [platform, matches] of Object.entries(MATCHERS)) {
    const asset = (release.assets || []).find((a) => matches(a.name));
    if (asset) assets[platform] = { name: asset.name, url: asset.browser_download_url, size: asset.size };
  }
  return {
    version: String(release.tag_name || '').replace(/^v/, ''),
    publishedAt: release.published_at,
    notesUrl: release.html_url,
    assets
  };
}

/** Edge cache: fresh for 5 minutes, then served stale for up to a day while it refreshes. */
export const CACHE_HEADER = 'public, s-maxage=300, stale-while-revalidate=86400';
