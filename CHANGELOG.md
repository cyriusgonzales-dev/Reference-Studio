# Changelog

All notable changes to Vmix Reference Studio. Copy the section for a version into its GitHub release notes.

## 0.8.1

### Fixed
- The Mac app is now signed ad hoc, so on first launch macOS offers **Open Anyway** (System Settings → Privacy & Security) instead of refusing to open it.
- The download website gives the right installer straight away on Windows and Mac, and shows short install steps for each.

## 0.8.0

### Added
- **macOS app** for Apple silicon and Intel Macs. It sends NDI to vMix on another computer over the network and uses the NDI runtime from NDI Tools for Mac.
- **Settings window** (gear button in the left rail, Ctrl+, or ⌘,) with General, Slides, Updates and About sections.
- **In-app updates.** New versions are checked for and downloaded in the background, and install only when you restart or quit, never during a show. Automatic checking and downloading can each be turned off.
- Ad-blocking filter lists can be updated from Settings.
- A log file for diagnosing problems (Settings → About → Open logs folder).
- **Slide appearance** (Settings → Slides) with a live preview: font, text and background colours, position (top, middle, or bottom as a lower third), alignment, shadow and lines per slide. One-click presets: Full screen, Lower third, Green screen and Blue screen (for chroma key in vMix).
- **Custom NDI source name**, so several computers on one network show up separately in vMix.
- **Open at login**, for dedicated broadcast computers.
- New logo: an "R" monogram whose leg is a play mark, with full-logo artwork for dark and light backgrounds.

### Changed
- macOS keyboard shortcuts use ⌘. Back and forward are ⌘[ and ⌘].
- Window title bars follow the app's dark theme.

## 0.7.0
- Song credits under lyrics. Research tab with sources. NDI output to vMix with sound.
