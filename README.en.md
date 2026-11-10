# SongScope — Studio One Project Viewer

[简体中文](README.md) | **English**

Explore Studio One projects, tracks, MIDI, plugins and saved instrument presets without installing those plugins. Available on Windows, macOS, Linux and browser/PWA on mobile and desktop.

**Web app:** https://songscope.response.run · **Downloads:** [private Releases](../../releases) (repository access required).

## Privacy & disclaimer

Project files and their data are processed offline on your device. They are **never uploaded in any form**. SongScope does not collect project contents or media paths, run plugins, or access referenced external audio. Initial website visits and app updates download application assets; offline availability depends on the browser retaining its cache. Open projects are not automatically saved to browser storage.

This is an unofficial, read-only viewer, not affiliated with PreSonus / Fender or their trademark owners. Third-party project formats are reverse-adapted: results may be incomplete or inaccurate. Refer to the original application and keep backups. SongScope does not overwrite your project.

## Language

The interface automatically uses Chinese when the system/browser's preferred language is Chinese (`zh-*`); otherwise it uses English. Project titles, track names, preset names and source paths remain unchanged.

## Features

- Song overview: artwork, title, artist, genre, creator, tempo, meter, key and producer application.
- Read-only arrangement with MIDI note previews, zoom, scrolling and multi-selection.
- Tempo and meter maps, change markers and bar lines that follow meter changes.
- Bottom mixer: instrument, inserts, sends and recognizable target effects; selecting a track focuses its channel.
- Saved preset names: Serum 2 metadata, VST2 program names, readable Kontakt preset/snapshot metadata and `.nki` / `.nkm` / `.nksn` references. File references are labeled; unknown or encrypted formats remain unrecognized. Kontakt has synthetic coverage but no equivalent real-user-project validation.
- Audio tracks show saved source filenames, event names and paths in expandable **Audio sources** sections in the arrangement and mixer. Missing paths are explicitly labeled. References do not establish that the files still exist. **No audio export, playback, waveform rendering or external audio access.**
- MIDI export: selected clips, a track or the arrangement. Single clips start at zero; multi-clip exports retain arrangement positions. Tempo and meter events are included. Continuous tempo curves currently use a clearly labeled step approximation.
- Mobile MIDI exports use system sharing when supported, otherwise download. Desktop exports use a save dialog. Audio sources are never added to MIDI export.

## Usage & shortcuts

1. Open or drop a `.song` project.
2. Explore the overview, then switch to Arrangement.
3. Select tracks to inspect plugins and audio references; select MIDI clips for export.
4. Optionally install the PWA using your browser's Add to Home Screen command.

| Key | Action |
| --- | --- |
| F1 | Toggle help |
| F2 | Toggle read-only MIDI inspector |
| F3 | Toggle bottom mixer |
| Esc | Close help |

Mac may require Fn. Text input, modifier combinations and key repeat do not trigger panel toggles. No project editing or MIDI import is exposed.

## Limitations

ZIP projects containing `Song/song.xml`, `Song/mediapool.xml` and `.musicx` are the main supported format. Older binary/encrypted projects, all Studio One / Fender Studio Pro versions, special event types, loops and MIDI controllers are not guaranteed. No automation, chord/lyric visualization, audio rendering or VST hosting. Large projects may exceed mobile memory. Desktop packages are not commercially signed or notarized.

## Development & packaging

Node.js 20+ (22 recommended), npm; graphical Electron requires a desktop or Xvfb.

```bash
npm ci
npm run dev
npm run build
npm start
npm run dist:win
npm run dist:mac
npm run dist:linux
```

Packages are written to `release/`. macOS builds require macOS. [GitHub Actions](.github/workflows/build.yml) builds Windows x64, Linux x64/ARM64 and macOS Intel/Apple Silicon; tagged builds attach artifacts to private Releases.

```bash
xvfb-run -a npx electron --no-sandbox scripts/test-i18n-audio.cjs
xvfb-run -a npx electron --no-sandbox scripts/test-timing-shortcuts.cjs
xvfb-run -a npx electron --no-sandbox scripts/test-presets.cjs
```

Tests cover bilingual UI, local-only project loading, audio references, MIDI exclusion, timing maps, MIDI round-trips, shortcuts and preset metadata. Real user projects are not distributed.

## Deployment & source layout

Cloudflare Pages project `songscope-web` is connected directly to private repository `yukinsnow/SongScope`. Pushing `main` triggers `npm run build`, output `dist/`, using Node 22 and `ELECTRON_SKIP_BINARY_DOWNLOAD=1`. No manual dist uploads. The historical `songscope.pages.dev` direct-upload project is no longer updated.

- `src/App.tsx`: viewer and MIDI export UI; `src/i18n.ts`: UI translations and locale detection.
- `src/lib/song.ts`: ZIP/XML, media references and plugin routing.
- `src/lib/musicx.ts`, `timing.ts`, `presets.ts`, `midi.ts`: note decoding, tempo/meter, saved presets and MIDI export.
- `electron/`: desktop file bridge; `public/`: PWA and branding; `build/`: platform icons.
- `scripts/`, `fixtures/`: verification and synthetic samples.

## Credits & branding

**Github@Yukinsnow · Bilibili@純白**

SongScope uses selected handwritten-music logo 01. See [branding notes](docs/branding/selected.md) and [concept gallery](https://songscope.response.run/brand/round-3/). Other concepts are retained as design history, not active branding.

Kontakt saved-state parsing and encrypted-state labels are supported without launching Kontakt.
