/**
 * Public product information: where the app is downloaded and where releases
 * are published. Keep GITHUB_REPO in sync with `publish` in electron-builder.yml
 * (scripts/check-release-config.mjs verifies this before a release).
 */
export const PRODUCT_NAME = 'Vmix Reference Studio';

/** "owner/repository" on GitHub. Releases there are what the in-app updater installs. */
export const GITHUB_REPO = 'cyriusgonzales-dev/Reference-Studio';

/** The download website (deployed from website/ on Vercel). */
export const WEBSITE_URL = 'https://vmix-reference-studio.vercel.app';

export const RELEASES_URL = `https://github.com/${GITHUB_REPO}/releases`;

export function releaseNotesUrl(version: string): string {
  return `${RELEASES_URL}/tag/v${version.replace(/^v/, '')}`;
}
