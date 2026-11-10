# Read-only arrangement and MIDI inspector

## Saved audio positions

`S1Track.audioEvents` preserves every `AudioEvent` occurrence (including repeated
references to one sample), separately from the deduplicated `audioFiles` source
list. Names prefer the saved event name, then the decoded sample filename.
The track `timeFormat` controls event start positions; the event `timeFormat`
controls duration and source offset. Verified Studio One formats: 2 = quarter-note
beats, 0 = seconds. Unknown formats retain null positions/durations and are listed
as unpositioned instead of being drawn at an invented location.

Seconds-based positions and durations integrate the tempo map separately; a
seconds duration is converted using its actual arrangement origin. Continuous
curves remain a clearly labeled node/step approximation, as with MIDI export.
No external audio is fetched, decoded, exported, played or used to draw a fake
waveform. Overlapping occurrences get separate visual rows.

## Piano roll

F2 opens the most recently clicked MIDI clip, or the selected track's first clip.
F3 closes F2 and vice versa, consistently for buttons and keyboard shortcuts.
The plugin rack intentionally has no track-MIDI export button. MIDI exports
remain in the arrangement bar and the open clip's inspector.

The inspector draws actual semitone rows and labels (`C4` = MIDI 60), with a
sticky keyboard and arrangement-aware bar/beat ruler. Full range is MIDI 0–127
(`C-1` through `G9`). Time and pitch zoom are independent. Selecting a note
shows exact pitch/MIDI number, start, duration and velocity; it never edits the
song or invokes a plugin. Source offsets and both clip boundaries trim notes.
The first note is brought into view when opening a clip.

## Validation

- `scripts/test-audio-events.cjs`: independent start/duration units, tempo-node
  integration, unknown-unit handling, repeated references and naming fallback.
- `scripts/test-arrangement-inspector.cjs`: synthetic project in Chinese/English
  at desktop/mobile sizes; real rendered audio positions, late audio extending
  timeline, labels, note details, initial visible note, partial-bar ruler, zoom,
  full keyboard, exclusive panels, no rack export and local-only processing.
- `scripts/test-note-window.cjs`: boundary trimming and pitch-number convention.
- `scripts/test-kontakt-ui.cjs`: optional authorized local comparison project;
  known names, encrypted badges, validated empty rack badge in both languages.

Private fixtures are never bundled, copied to `public/` or uploaded. The locally
available larger project was checked to contain 783 audio events on 27 tracks
and 70 MIDI parts. Format/source-based synthetic cases are not a substitute for
real-host validation of an unsupported plugin state.
