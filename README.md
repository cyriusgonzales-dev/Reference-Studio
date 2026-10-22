# Vmix Reference Studio

A Windows app for live webinars: search Google Images, YouTube and song lyrics, and show the result on a clean panel that vMix captures. Everything runs in **one window with three panels**:

```
┌──────────────────────────────────┬────────────────────────┐
│ ┌──────┐                         │ 2 · PLAYER             │
│ │Images│                         │ the item you clicked,  │
│ │──────│   1 · SEARCH            │ with YouTube controls  │
│ │YouTube   (each tab keeps its   ├────────────────────────┤
│ │──────│    own page + history)  │ 3 · vMIX OUTPUT        │
│ │Lyrics│                         │ clean copy of panel 2  │
│ └──────┘                         │ (this is what vMix     │
│                                  │  captures)             │
└──────────────────────────────────┴────────────────────────┘
```

## Using it

| Tab | What you do | What happens |
| --- | --- | --- |
| **Images** | Search, then **click any image**. | It appears in panels 2 and 3. Click another image to replace it. If Google opens the full-size version, the panels switch to it automatically. The results page never moves. |
| **YouTube** | Search, then **click a video**. | It plays in panel 2 with YouTube's normal controls (play, pause, seek, volume, speed, captions). Panel 3 plays the same video in sync and shows **only the video picture**: no title, controls, play/pause indicator or "More videos". The results stay in the tab. |
| **Lyrics** | Type the song title (the app adds "lyrics" to the Google search), then **highlight the lyrics with the mouse**. | The highlighted text becomes slides (up to 4 lines each), shown in panels 2 and 3. Use ← → (or the numbered buttons) to change slides, and − / + / AA for text size and uppercase. If the highlight did not register, click **Use highlighted text**. |

- **Black** (top right of panel 2, or **Ctrl+Shift+B**) clears panels 2 and 3 to black.
- Panel 3 always mirrors panel 2. Anything you click in panel 1 is shown immediately.
- Sound comes from panel 3 only (panel 2 is muted), so there is no double audio. Volume and mute changes in panel 2 are copied to panel 3.
- Each tab keeps its own history while the app runs, and reopens on its last page next time.
- The shield at the bottom left turns ad blocking on and off. If a page or video misbehaves, try turning it off.

### Keyboard shortcuts

| Keys | Action |
| --- | --- |
| Ctrl+1 / Ctrl+2 / Ctrl+3 | Images / YouTube / Lyrics tab |
| Ctrl+L | Go to the search box |
| Alt+← / Alt+→ | Back / forward in the current tab |
| ← / → (or Page Up / Page Down) | Previous / next lyrics slide, when a web page does not have focus |
| Ctrl+Shift+← / Ctrl+Shift+→ | Previous / next lyrics slide, from anywhere |
| Ctrl+Shift+B | Clear to black |

## Setting up vMix

1. Start the app with the desktop shortcut and keep the window **maximized**. The capture position depends on the window size.
2. Panel 3's header shows its position, for example `Display 1 crop: X 1153, Y 597, 757×426`.
3. In vMix: **Add Input → Desktop Capture**, then choose the display shown in the header.
4. Open the input's **Crop** settings and enter the X, Y, width and height from the header. Those values are physical screen pixels.
5. Click an image and confirm it appears in the vMix preview; then try a video and a lyrics slide, then **Black**.
6. For audio, capture the system audio, or route the app's audio, in vMix's audio settings.

Notes:
- If the window is moved or resized, the crop values change. Re-check them in panel 3's header.
- Do not minimise the app while live. Windows does not draw minimised windows, so vMix would capture nothing. It is fine to cover it with other windows.

## Installing / building

The installed app is in `%LOCALAPPDATA%\Programs\Vmix Reference Studio`, with a **Vmix Reference Studio** shortcut on the desktop.

To build it yourself (requires Node.js 22 or newer):

```bash
npm install
npm run dev        # run in development mode
npm run check      # type checks, lint, unit tests
npm run package    # build release/Vmix-Reference-Studio-Setup-<version>.exe and a portable .exe
```

The installer and portable exe are **not code-signed**, so Windows SmartScreen may warn the first time ("More info → Run anyway").

If you run `npm run dev` from a VS Code terminal and Electron starts as plain Node.js, unset the `ELECTRON_RUN_AS_NODE` variable VS Code sets. The packaged app ignores it.

## How it works (for developers)

- **Electron + React + TypeScript**, built with electron-vite and packaged with electron-builder (NSIS installer + portable).
- `src/main` is the main process and the single source of truth. It holds the three search tabs (`research/tabs.ts`), the program shown in panels 2/3 (`player/programController.ts`, state machine in `src/shared/program.ts`), settings and ad blocking.
- Each search tab is a sandboxed `WebContentsView` without access to any app API. A small preload (`src/preload/research.ts`) reports only **genuine** clicks and text selections (`event.isTrusted`). The main process validates every message with zod and only accepts each tab's own kind of content.
- Videos use YouTube's **official embedded player**, with two players: panel 2 (controls, muted) and panel 3 (clean, audible). Panel 3 is re-aligned to panel 2 every 250 ms (`src/shared/sync.ts`). If the owner disables embedding, the app retries with the YouTube watch page; only the surrounding page is hidden, and YouTube's player and branding are never altered.
- Security: context isolation, sandboxing, no Node in any page, validated IPC with sender checks, a strict CSP for the app page, navigation and permission restrictions, and Electron fuses in the packaged exe (no `ELECTRON_RUN_AS_NODE`, no `NODE_OPTIONS`/`--inspect`, asar integrity).
- Ad blocking uses Ghostery's maintained engine with EasyList/EasyPrivacy-based prebuilt lists, cached on disk.
- Settings live in `%APPDATA%\Vmix Reference Studio\data\settings.json`, with an automatic backup and recovery if the file is damaged.

## Known limitations

- Some YouTube videos cannot be played outside YouTube: embedding disabled by the owner, age or sign-in restrictions, region locks, or removed videos. The app shows the reason in panel 2; use **YouTube** to open it in your browser.
- Panel 3 hides YouTube's player overlays at the operator's request; YouTube's embed terms ask that they stay visible. Graphics burned into a video itself (for example a song-title banner) cannot be removed.
- Panel 3 is a separate synced player, so after a seek it can take a fraction of a second to line up with panel 2.
- Ad blocking reduces but cannot guarantee removal of all ads, especially on YouTube.
- Google and YouTube change their pages often. If clicking an image or video stops being picked up, right-click it and use **Show this image** / **Play this video**.
- Lyrics shown from Google are licensed to Google's lyrics providers. Displaying them publicly in a broadcast may require a licence (for example CCLI); that is the operator's responsibility.
- The vMix crop must be updated if the window size or position changes.
