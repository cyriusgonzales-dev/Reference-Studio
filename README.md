<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="build/logo-dark.png" />
    <img src="build/logo-light.png" width="560" alt="Vmix Reference Studio: Search · Present · Broadcast" />
  </picture>
</p>

# Vmix Reference Studio

[![CI](https://github.com/cyriusgonzales-dev/Reference-Studio/actions/workflows/ci.yml/badge.svg)](https://github.com/cyriusgonzales-dev/Reference-Studio/actions/workflows/ci.yml)

**Download:** https://vmix-reference-studio.vercel.app · Windows 10/11 and macOS 11+

A Windows and macOS app for live webinars: search Google Images, YouTube, song lyrics and research topics, and show the result on a clean panel that vMix captures. Everything runs in **one window with three panels**:

```
┌──────────────────────────────────┬────────────────────────┐
│ ┌──────┐                         │ 2 · PLAYER             │
│ │Images│                         │ the item you clicked,  │
│ │──────│   1 · SEARCH            │ with YouTube controls  │
│ │YouTube   (each tab keeps its   ├────────────────────────┤
│ │──────│    own page + history)  │ 3 · vMIX OUTPUT (NDI)  │
│ │Lyrics│                         │ clean copy of panel 2, │
│ │──────│                         │ sent to vMix over NDI  │
│ │Resrch│                         │ with sound             │
│ └──────┘                         │                        │
└──────────────────────────────────┴────────────────────────┘
```

## Using it

| Tab | What you do | What happens |
| --- | --- | --- |
| **Images** | Search, then **click any image**. | It appears in panels 2 and 3. Click another image to replace it. If Google opens the full-size version, the panels switch to it automatically. The results page never moves. |
| **YouTube** | Search, then **click a video**. | It plays in panel 2 with YouTube's normal controls (play, pause, seek, volume, speed, captions). Panel 3 plays the same video in sync and shows **only the video picture**: no title, controls, play/pause indicator or "More videos". The results stay in the tab. |
| **Lyrics** | Type the song title (the app adds "song lyrics" to the Google search so the lyrics come first). The results are cleaned up: Google's AI overview and lyrics box stay at the top, and below them only lyrics pages are listed. Videos, social posts, "People also ask" and other sites are hidden on the page (nothing is blocked). Then **highlight the lyrics with the mouse**. | The highlighted text becomes slides (up to 4 lines each), shown in panels 2 and 3. Use ← → (or the numbered buttons) to change slides, and − / + / AA for text size and uppercase. If the highlight did not register, click **Use highlighted text**. Under the slides, the song's credits are shown when the page states them, for example **Lupang Hinirang · Music: Julián Felipe · Lyrics: José Palma**: the title, composer, lyricist (or writers) and year, read from Google's lyrics box or the lyrics site. A release date says "Released". Nothing is guessed; with no credits on the page, no line is shown. |
| **Research** | Search a topic (the app adds "definition" to the Google search, unless you type a question such as "what is…"). Research uses Google's **Web** filter, so the results are only web pages: no AI overview, videos or panels. Open a trusted page (for example NASA or Britannica), then **highlight the text with the mouse**. | The text becomes slides of whole sentences, with the source under each slide: **Source: NASA · Overview · September 1, 2020**. The source is read from the page itself (its publisher, title and publication date) and never guessed: a page that states no date shows no date, and on editable sites such as Wikipedia the date is the last update. Panel 2 shows how far the site can be trusted (**Official source**, **Check source** for sites anyone can edit, **Verify source** for others) and an **Open source** button. Text from Google's AI overview is refused because it has no single source; text from a Google result snippet is credited to that result, and text from Google's dictionary box is credited to Oxford Languages. |

- **One search, all four tabs:** whatever you search in any tab is searched in Images, YouTube, Lyrics and Research too, so switching tabs shows results for the same words. YouTube searches right away; the other Google tabs run the search when you open them, because several Google searches at the same moment trigger Google's "unusual traffic" check. A typed web address opens only in the current tab.
- **Black** (top right of panel 2, or **Ctrl+Shift+B**) clears panels 2 and 3 to black.
- Panel 3 always mirrors panel 2. Anything you click in panel 1 is shown immediately.
- Sound comes from panel 3 only (panel 2 is muted), so there is no double audio. Volume and mute changes in panel 2 are copied to panel 3.
- Each tab keeps its own history while the app runs, and reopens on its last page next time.
- The shield at the bottom left turns ad blocking on and off. If a page or video misbehaves, try turning it off. Google Search and Images pages are never filtered: blocking Google's own background requests makes Google more likely to show its "confirm you're human" check.

### Keyboard shortcuts

| Windows | macOS | Action |
| --- | --- | --- |
| Ctrl+1 / 2 / 3 / 4 | ⌘1 / 2 / 3 / 4 | Images / YouTube / Lyrics / Research tab |
| Ctrl+L | ⌘L | Go to the search box |
| Alt+← / Alt+→ | ⌘[ / ⌘] | Back / forward in the current tab |
| ← / → (or Page Up / Page Down) | ← / → | Previous / next lyrics slide, when a web page does not have focus |
| Ctrl+Shift+← / → | ⇧⌘← / → | Previous / next lyrics slide, from anywhere |
| Ctrl+Shift+B | ⇧⌘B | Clear to black |
| Ctrl+, | ⌘, | Settings |

### Settings and updates

Open **Settings** with the gear button at the bottom of the left rail (or Ctrl+, / ⌘,):

- **General:** open at login, ad blocking and its filter lists, the NDI source name (give each computer its own, so vMix tells them apart) and status, and the keyboard shortcuts.
- **Slides:** how lyrics and research text look, with a live preview: font, size, colours, uppercase, shadow, position (top, middle, or bottom as a lower third), alignment and lines per slide. Presets: **Full screen**, **Lower third**, **Green screen** and **Blue screen** (key the background out in vMix).
- **Updates:** the app checks for new versions shortly after start-up and then every few hours, and downloads them in the background. **It never restarts by itself:** a downloaded update installs when you click **Restart and install**, or the next time you quit. Automatic checking and downloading can each be turned off. A dot on the gear button means an update is waiting.
- **About:** version, website, release notes and **Open logs folder** (send the log with a problem report).

The portable Windows exe and unsigned macOS builds can't replace themselves. They still tell you when an update exists, and **Download from website** gets it.

## Setting up vMix

The app sends panel 3 to vMix as an **NDI® source**: full 1920×1080 at up to 30 fps, **with the YouTube sound**, and no screen cropping.

1. Start the app. Panel 3's header shows `NDI · Vmix Reference Studio · waiting for vMix`.
2. In vMix: **Add Input → NDI / Desktop Capture**, then pick **`<YOUR-PC-NAME> (Vmix Reference Studio)`** and click OK.
3. The header changes to `1 receiving`. Click an image, a video and a lyrics slide, then **Black**, and confirm each in the vMix preview.
4. The NDI input carries the video's sound. In vMix's audio mixer, turn that input's audio on (and use it instead of capturing the computer's sound).

Notes:
- Panel 3 is a live preview of exactly what NDI sends. When a video plays, the NDI picture shows only the video: no YouTube title, controls or captions.
- NDI keeps working when the app window is minimised or covered.
- NDI must be installed. vMix installs it in its own folder, so a computer with vMix needs nothing more. On a computer without vMix (for example, sending to vMix on another PC over the network), install the free **NDI Runtime / NDI Tools** from ndi.video. If NDI is missing, panel 3's header says so.
- **On a Mac**, install **NDI Tools for Mac** from ndi.video. vMix runs on Windows, so the Mac sends to the vMix computer over the local network: in vMix, choose **Add Input → NDI** and pick `<MAC-NAME> (Vmix Reference Studio)`.
- The computer's speakers also play the video sound. If you monitor through vMix, mute the speakers or lower the Windows volume for this app.
- Alternative without NDI: vMix **Desktop Capture** of the display, cropped to panel 3. Hover over panel 3 to see the crop values; they change if the window is moved or resized.

NDI® is a registered trademark of Vizrt NDI AB. The app uses the NDI library installed on the computer and does not include it.

## Installing

Download the installer from the website: https://vmix-reference-studio.vercel.app

- **Windows:** run `Vmix-Reference-Studio-Setup-<version>.exe`. The app installs to `%LOCALAPPDATA%\Programs\Vmix Reference Studio` with Desktop and Start-menu shortcuts. A portable exe that needs no install is also available.
- **macOS:** open the `.dmg` for your Mac (Apple silicon or Intel) and drag the app to **Applications**.

Until the builds are code-signed, Windows SmartScreen may warn the first time (**More info → Run anyway**). macOS may refuse to open the app the first time: right-click it in Applications and choose **Open**, or use **System Settings → Privacy & Security → Open Anyway**.

Settings live in `%APPDATA%\Vmix Reference Studio` (Windows) or `~/Library/Application Support/Vmix Reference Studio` (macOS). Updating or uninstalling keeps them.

## Building from source

Requires Node.js 22 or newer.

```bash
npm install
npm run dev          # run in development mode
npm run check        # type checks, lint, unit tests
npm run package:win  # Windows installer + portable exe in release/ (on Windows)
npm run package:mac  # macOS .dmg + .zip for Apple silicon and Intel in release/ (on a Mac)
npm run icon         # regenerate every icon from build/icon.svg
```

Releases are built by GitHub Actions and published to GitHub Releases, where the in-app updater finds them. The download website in `website/` is deployed on Vercel. See **[docs/RELEASING.md](docs/RELEASING.md)** for the full release, signing and deployment steps.

If you run `npm run dev` from a VS Code terminal and Electron starts as plain Node.js, unset the `ELECTRON_RUN_AS_NODE` variable VS Code sets. The packaged app ignores it.

## How it works (for developers)

- **Electron + React + TypeScript**, built with electron-vite and packaged with electron-builder (Windows: NSIS installer + portable; macOS: dmg + zip for arm64 and x64).
- **Updates** use electron-updater against GitHub Releases (`src/main/updater.ts`). The Settings window (`src/main/settingsWindow.ts`, `src/renderer/src/settings`) is a separate window, because the search tabs and players are native views drawn above the main page. Logs go through electron-log (`src/main/logging.ts`).
- **Platform differences** are kept small: NDI library discovery (`src/main/ndi/ndiLibrary.ts`), shortcuts (`src/shared/shortcuts.ts`), the macOS menu bar (`src/main/menu.ts`) and the browser user agent.
- `src/main` is the main process and the single source of truth. It holds the four search tabs (`research/tabs.ts`), the program shown in panels 2/3 (`player/programController.ts`, state machine in `src/shared/program.ts`), settings and ad blocking.
- Each search tab is a sandboxed `WebContentsView` without access to any app API. A small preload (`src/preload/research.ts`) reports only **genuine** clicks and text selections (`event.isTrusted`). The main process validates every message with zod and only accepts each tab's own kind of content.
- Videos use YouTube's **official embedded player**, with two players: panel 2 (controls, muted) and an offscreen output player (video only, audible). The output player is re-aligned to panel 2 every 250 ms (`src/shared/sync.ts`).
- **NDI output** (`src/main/output`, `src/main/ndi`): the program is rendered offscreen at 1920×1080 (an output page for images and lyrics, and the output YouTube player for video). Frames go to an NDI sender on a worker thread (the installed NDI library called through koffi), and a scaled JPEG preview goes to panel 3. The video's sound is captured from the output player with Web Audio (`src/preload/audioTap.ts`) and sent as NDI audio. If the owner disables embedding, the app retries with the YouTube watch page; only the surrounding page is hidden, and YouTube's player and branding are never altered.
- Security: context isolation, sandboxing, no Node in any page, validated IPC with sender checks, a strict CSP for the app page, navigation and permission restrictions, and Electron fuses in the packaged exe (no `ELECTRON_RUN_AS_NODE`, no `NODE_OPTIONS`/`--inspect`, asar integrity).
- Ad blocking uses Ghostery's maintained engine with EasyList/EasyPrivacy-based prebuilt lists, cached on disk.
- Settings live in `<userData>/data/settings.json`, with an automatic backup and recovery if the file is damaged.

## Known limitations

- Google may still ask you to confirm you're human, for example after many quick searches or when many people share one internet connection. Complete it once in the tab; the app keeps Google's cookies, so it should not come back often. Signing in to a Google account in the Images or Lyrics tab makes it rarer. The app does not bypass this check.

- Some YouTube videos cannot be played outside YouTube: embedding disabled by the owner, age or sign-in restrictions, region locks, or removed videos. The app shows the reason in panel 2; use **YouTube** to open it in your browser.
- Panel 3 hides YouTube's player overlays at the operator's request; YouTube's embed terms ask that they stay visible. Graphics burned into a video itself (for example a song-title banner) cannot be removed.
- Panel 3 is a separate synced player, so after a seek it can take a fraction of a second to line up with panel 2.
- Ad blocking reduces but cannot guarantee removal of all ads, especially on YouTube.
- Google and YouTube change their pages often. If clicking an image or video stops being picked up, right-click it and use **Show this image** / **Play this video**.
- Lyrics shown from Google are licensed to Google's lyrics providers. Displaying them publicly in a broadcast may require a licence (for example CCLI); that is the operator's responsibility.
- The vMix crop must be updated if the window size or position changes.
