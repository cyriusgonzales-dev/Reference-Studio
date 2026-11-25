# Releasing and deploying

This project ships two things:

| What | Where it lives | How it is published |
| --- | --- | --- |
| The desktop app (Windows + macOS) | GitHub Releases in the public `Reference-Studio` repo | `.github/workflows/release.yml`, started by pushing a version tag |
| The download website | `website/` | Vercel, redeployed on every push to `main` |

The in-app updater (Settings → Updates) reads the **latest published GitHub Release**, so publishing a release is all it takes to update every installed copy.

---

## 1. One-time setup

### GitHub repository

Releases are published to `cyriusgonzales-dev/Reference-Studio`, which must be **public**: the website and the in-app updater download installers from it without logging in. The release workflow checks this and stops if the repository is private.

1. The repository is named in three places, which `npm run release:check` keeps in agreement:
   - `electron-builder.yml`: `publish.owner` / `publish.repo`
   - `src/shared/product.ts`: `GITHUB_REPO` (and `WEBSITE_URL`)
   - `website/api/_release.js`: `DEFAULT_REPO`
2. In the repository, open **Settings → Actions → General → Workflow permissions** and choose **Read and write permissions**, so the workflow can create releases.

**Want the source code private?** Publish releases to a second, public repository instead: create it with a README, point the three places above at it, and add a `RELEASES_TOKEN` secret (fine-grained token, *Contents: Read and write* on that repository only). The workflow uses that token when it is set.

### Vercel (download website)

1. On vercel.com: **Add New → Project**, then import the GitHub repository.
2. Leave every build setting at its default. The root `vercel.json` serves `website/public` and the functions in `api/` (thin wrappers around `website/api`), and skips installing or building the desktop app. Setting **Root Directory** to `website` also works, using `website/vercel.json`; keep the two `vercel.json` files in sync.
3. Under **Environment Variables**, add:
   - `GITHUB_REPO` = `cyriusgonzales-dev/Reference-Studio` (optional; that is the built-in default)
   - `GITHUB_TOKEN` = a fine-grained token with read-only *Contents* access to the repo (optional; avoids GitHub's API rate limit on busy days)
4. Deploy. Copy the site's address (for example `https://vmix-reference-studio.vercel.app`) into `WEBSITE_URL` in `src/shared/product.ts` and `homepage` in `package.json`. The app links there from Settings → About, and portable copies send users there to update.

The site serves short links that always point to the newest installer:

- `/download/windows`: Windows installer
- `/download/windows-portable`: portable exe
- `/download/mac`: Apple silicon `.dmg`
- `/download/mac-intel`: Intel `.dmg`

---

## 2. Releasing a new version

```bash
npm run check                 # everything green locally
npm version 1.2.3             # bumps package.json and creates the tag v1.2.3
git push --follow-tags        # starts the Release workflow
```

1. GitHub Actions builds on real Windows and macOS machines (about 10–15 minutes), then uploads everything to a **draft** release:
   - `Vmix-Reference-Studio-Setup-1.2.3.exe`, `latest.yml`, `.blockmap` (Windows installer and update feed)
   - `Vmix-Reference-Studio-1.2.3-portable.exe`
   - `Vmix-Reference-Studio-1.2.3-mac-arm64.dmg` / `-mac-x64.dmg` (downloads)
   - `Vmix-Reference-Studio-1.2.3-mac-arm64.zip` / `-mac-x64.zip`, `latest-mac.yml` (macOS update feed)
2. When both platforms have uploaded, the workflow **publishes the release automatically**, using that version's section of `CHANGELOG.md` as the release notes. So rename `## Unreleased` to the new version number in `CHANGELOG.md` before tagging.
3. Within a few minutes the website shows the new version, and installed apps find it on their next check (shortly after start-up, then every 4 hours, or straight away with **Check for updates**).

**Do not delete or rename assets** in a published release. `latest.yml` and `latest-mac.yml` hold their checksums.

### Rolling back

You can't downgrade installed copies automatically. Release a new, higher version that contains the fix or the reverted code (for example `1.2.4`).

---

## 3. Code signing (strongly recommended before a wide launch)

Without signing, the builds work, but:

- **Windows** shows "Windows protected your PC" (SmartScreen) until the app builds reputation. The user clicks *More info → Run anyway*. Updates work normally.
- **macOS** blocks the app on first open. The user clicks *Done*, then *System Settings → Privacy & Security → Open Anyway* (on macOS 15 and later, right-click → *Open* no longer works). Unsigned builds are signed ad hoc in CI so macOS offers *Open Anyway* instead of calling the app "damaged". **In-app updates cannot install on an unsigned Mac build.** The app detects this and sends the user to the website to download the new version instead.

To sign, add these **repository secrets** (Settings → Secrets and variables → Actions). The workflow uses them automatically:

| Secret | What it is |
| --- | --- |
| `WIN_CSC_LINK` | Windows code-signing certificate (`.pfx`), base64-encoded |
| `WIN_CSC_KEY_PASSWORD` | Its password |
| `MAC_CSC_LINK` | Apple **Developer ID Application** certificate (`.p12`), base64-encoded. Needs the Apple Developer Program, $99/year |
| `MAC_CSC_KEY_PASSWORD` | Its password |
| `APPLE_API_KEY_BASE64` | App Store Connect API key (`.p8`), base64-encoded, for notarization |
| `APPLE_API_KEY_ID` | The key's ID |
| `APPLE_API_ISSUER` | The issuer ID |

Base64-encode a file with `base64 -i cert.p12 | pbcopy` (macOS) or `[Convert]::ToBase64String([IO.File]::ReadAllBytes("cert.pfx")) | Set-Clipboard` (PowerShell).

---

## 4. Building locally

```bash
npm run package:win   # on Windows → release/
npm run package:mac   # on a Mac   → release/
```

macOS builds can only be made on a Mac. CI covers both platforms.

## 5. Updating the logo

Edit `build/icon.svg`, then run `npm run icon`. That regenerates the Windows `.ico`, the macOS icon, the in-app logo and every website icon, including the social preview image. Commit the results.
