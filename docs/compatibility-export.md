# Experimental older-version project export

The overview displays **the saved software version**, read from
`metainfo.xml` → `Document:Generator`. `Document:FormatVersion` is a separate
archive-format number, not the application's version. Studio One and Fender
Studio Pro are one product lineage; no version is inferred from a song title,
track name, filename, or installed software.

## Implemented scope

- Recognized Studio One 6 (format 7), Studio One 7 (format 8) or Fender Studio
  Pro 8 (format 9) sources can generate a **new** `.song` compatibility copy
  targeting Studio One 7 (format 8), 6 (format 7) or 5 (format 6), strictly
  downward only: **8→7/6/5, 7→6/5, 6→5**. These are attempted compatibility
  copies, not a promise that every input can pass preflight.
- The source application version remains recorded unchanged. Only the format
  field is patched in metadata. We do not pretend an older application saved it.
- Supported saved JSON Pro EQ states are serialized to the legacy native XML
  preset with its legacy class identifier; the state filename, the local
  preset-path reference, device class identity and ghost preset type are
  updated together. The DSP values present in the accepted schema are retained;
  output gain changes units from dB to linear amplitude. Current and legacy
  automatic-gain flags remain distinct.
- Active dynamic/linear-phase modes, unknown fields/components, malformed states,
  missing required parameters, unresolved preset references, path collisions,
  unsupported newer native DSP presets and the newer Compressor are blocked.
  There are no guessed defaults or automatic plugin removals.
- Known structured CLAP-format declarations block Studio One 5 / 6 targets. A
  sample or track merely named “Clap” is not classified as a CLAP plugin.
- Studio One 5 has narrower native-plugin coverage: newer JSON Pro EQ states
  are blocked because a verified EQ³→EQ² parameter/automation mapping is not
  available. A legacy Pro EQ class ID alone is **not** evidence of EQ³ and does
  not cause a block; an explicit dynamic-EQ parameter schema does. Structured
  native factory identities for De-esser, Vocoder, Lead Architect, Surround
  Delay/Chorus and OpenAir2 also block 5. Track names and VST namesakes do not.
  Lyrics/video tracks and spatial-audio features are not converted; the plan
  explicitly warns about this. No plugins or features are silently deleted.
- Unrelated archive members retain their exact uncompressed bytes, including
  third-party plugin states, MIDI performances, song layout and saved media.
  ZIP compression bytes may differ. Original ZIP/XML/model objects are not
  modified, even after repeated exports.
- XML modifications use validated token offsets, not whole-document XML
  serialization or replacements across arbitrary text. Comments, scripts and
  unknown XML attributes are not rewritten.

Keep the exported copy **beside the original project** so relative external
media paths continue to resolve. External audio is not read, embedded, rendered
or copied. Third-party plugins still require compatible installations and their
own libraries/licenses on the destination system.

## What this does not establish

This is not a full reimplementation of older DAW serialization, a vendor-supported
Save As, or a guarantee of equal playback. It does not convert new Launcher
features, new automation semantics, MIDI 2.0, unsupported instruments, or every
new mixing/arrangement feature. New features remain in the archive and may be
ignored or behave differently in the destination. The export plan shows this
before exporting; unsupported states with known incompatible serialization block
export instead of silently dropping them.

No Studio One/Fender Studio Pro or Kontakt is launched by SongScope. Structural
re-reading and preserved data do **not** prove the target DAW opens or plays a
project correctly. Verify the copy in the target version and keep the original.

## Evidence

- [Fender Studio Pro 8 release notes, page 1](https://assets.ctfassets.net/mdpgzc1lmx9t/7ANuWzUqNbkKs6Nfd7qSkw/dab1eb0193d5b3d0ba3dbcecf444ba48/Fender_Studio_Pro_8_-_Release_Notes.pdf)
  explicitly state that projects saved in version 8 cannot be opened in earlier
  Studio One versions. [Studio One 7 release notes, page 8](https://assets.ctfassets.net/b7gl3dxk4jyc/2RnD4exKaDajTrR1zGj9kh/2e44026185d2625d34fde7d10c702d57/Studio_One_7_-_Release_Notes.pdf)
  document the corresponding restriction for version 7, and CLAP support added
  in 7. These are compatibility limitations, not an endorsement of this converter.
- [Fender's Studio Pro 8.2 announcement](https://www.fender.com/newsroom/273556-fender-studio-pro-8-2-expands-mixing-and-creative-production-tools/)
  identifies newer features such as Trim Automation and MIDI 2.0, illustrating why
  adjusting a version field alone cannot guarantee functional equivalence.
- The format numbers and legacy Pro EQ serialization/class-ID observations have
  independent author-implementation evidence in
  [djimc's converter](https://github.com/djimc/Fender-Studio-Pro-Studio-One-.song-converter).
  This is community-observed format evidence, **not a published vendor format
  specification**. SongScope's bounded TypeScript implementation was written
  independently rather than copying that GPL-licensed script.
- [Studio One 6 official release notes](https://www.fmicassets.com/sites/presonus.com/img/studio-one-6/Studio%20One%206%20-%20Release%20Notes-2.pdf)
  document the v6 backward-opening restriction, introduction of Pro EQ³,
  De-esser and Vocoder in 6.0, surround/OpenAir2 in 6.5, and Lead Architect in
  6.6. Native factory-name checks use these release boundaries, not labels that
  users assign to tracks.
- The original author-hosted [Convert Today downgrader](https://convert-today.com/studio-one-downgrader/)
  explicitly declares Studio One 5→format 6 in its public JavaScript target
  table. This is independent implementation evidence, **not an official file
  format specification or a tested v5 playback claim**. No real Studio One 5
  input specimen or installed target DAW was available for this extension.
- Two authorized local real archives save `Studio Pro/8.1.2.113407` and
  `Studio Pro/8.2.0.114903`, both format 9, each with one newer JSON Pro EQ preset.

## Validation

```bash
xvfb-run -a node_modules/.bin/electron --no-sandbox scripts/test-compatibility.cjs
```

Synthetic cases run without private sample files and exercise source/target
validation, duplicate metadata, unsupported DSP states, exact nonzero EQ gain
conversion, distinct auto-gain flags, missing state references, malformed metadata
and archive-name collisions. Available private samples are optional and never
bundled or uploaded.

Synthetic validation covers every allowed downward pair, rejection of same-version
or upward targets, all 5-specific blockers, old shared EQ IDs without dynamic
markers, and native/VST namesake false positives. UI checks actually download
7/6/5 copies in Chinese/English at desktop/mobile sizes.

Local real-archive validation for the existing 7/6 targets:

| Source archive | Files | Unchanged files | Audio events | MIDI parts |
| --- | ---: | ---: | ---: | ---: |
| Main project | 211 | 208 | 783 | 70 |
| Kontakt comparison | 119 | 116 | 590 | 34 |

Only metadata, mixer references and the one declared EQ state change. All
third-party plugin bytes and original members remain unchanged; generated member
contents are deterministic across repeat exports. These are **structural and
parameter-preservation checks, not target-DAW opening/playback tests**.

Both real archives correctly **block target 5** because they contain a newer
JSON Pro EQ state. Their 7/6 exports remain unchanged (same three modified
members). This is an explicit unsupported conversion, not successful v5
compatibility validation. A MIDI/third-party-only synthetic archive passes all
six downward version pairs with its original member bytes preserved.
