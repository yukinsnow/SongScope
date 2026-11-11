# SongScope — Studio One / Fender Studio Pro Project Viewer

[简体中文](README.md) | **English**

Explore Studio One / Fender Studio Pro projects, tracks, MIDI, plugins and saved instrument presets without installing those plugins. Available on Windows, macOS, Linux and browser/PWA on mobile and desktop.

**Web app:** https://songscope.response.run · **Downloads:** [private Releases](../../releases) (repository access required).

## Privacy & disclaimer

Project files and their data are processed offline on your device. They are **never uploaded in any form**. SongScope does not collect project contents or media paths, run plugins, or access referenced external audio. Initial website visits and app updates download application assets; offline availability depends on the browser retaining its cache. Open projects are not automatically saved to browser storage.

This is an unofficial project viewer and compatibility-copy exporter, not affiliated with PreSonus / Fender or their trademark owners. Third-party project formats are reverse-adapted: results may be incomplete or inaccurate. Refer to the original application and keep backups. SongScope does not overwrite your project.

## Language

The interface automatically uses Chinese when the system/browser's preferred language is Chinese (`zh-*`); otherwise it uses English. Project titles, track names, preset names and source paths remain unchanged.

## Features

- Song overview: artwork, title, artist, genre, creator, tempo, meter, key and producer application. Studio One / Fender Studio Pro share one product label; saved software version (including build) and document format number are shown separately. Unknown versions are not guessed.
- Read-only arrangement with positioned MIDI and audio clips, zoom, scrolling and multi-selection.
- Piano roll: labeled semitone keys, MIDI pitches (middle C = C4 / 60), bar/beat grid, note names and click-to-inspect pitch, duration, velocity and position. Independent zoom, scrolling and full 128-key range. Trimmed notes respect the part window.
- Tempo and meter maps, change markers and bar lines that follow meter changes.
- Bottom mixer: instrument, inserts, sends and recognizable target effects; selecting a track focuses its channel.
- Saved preset names: Serum 2 metadata, VST2 program names and supported Kontakt saved instrument slots (Guzheng/Cello verified on a real project). Validated empty Kontakt racks show **No instrument loaded**; validated encrypted states without a name show **Encrypted instrument cannot be read**. Unknown states remain unrecognized. Older file-reference extraction is labeled separately.
- Audio clips show their saved position/duration and event name (or sample filename). Repeated samples stay separate, overlaps stack, click shows details and mixer **Audio sources** lists saved paths. Seconds-based positions/durations are converted independently using the tempo map; unknown units are not plotted, curved tempo uses a labeled step approximation. References do not establish file availability. **No audio export, playback, waveform rendering or external audio access.**
- MIDI export: selected clips, the open piano-roll clip or the arrangement. Single clips start at zero; multi-clip exports retain arrangement positions. Tempo and meter events are included. Continuous tempo curves currently use a clearly labeled step approximation.
- Mobile MIDI exports use system sharing when supported, otherwise download. Desktop exports use a save dialog. Audio sources are never added to MIDI export.

Preset coverage and evidence: [support matrix](docs/preset-support.md). Vital, Sylenth1, Omnisphere, StylusRMX and Falcon have readers for limited explicit formats, not all versions or real-host variants. Ten real Nexus instances remain unreadable.

## Older-version compatibility copies (experimental)

The overview has an **Export for an older version** panel targeting Studio One 7 / 6. It checks source versions and supported state before export, lists changes, limitations or blockers, and generates a separate `.song`. The original project and saved generator metadata stay unchanged.

This is not a vendor-supported Save As and does not translate all new features. **Opening in the target DAW is not yet verified.** Existing embedded content and external source references are retained, not rendered or collected. Put the copy next to the original project and verify media, effects, routing and automation in the target application. Third-party plugin states remain unchanged; plugin version compatibility is not guaranteed.

See [conversion scope and evidence](docs/compatibility-export.md).

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

F2 and F3 are mutually exclusive; opening either closes the other. The plugin rack has no MIDI export button.

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
