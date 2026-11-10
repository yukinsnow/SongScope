# Additional saved-state preset readers

These are **offline, read-only metadata readers**, not plugin compatibility or
playback support. No instrument is instantiated. Project files and external
audio/sample libraries are not uploaded or opened.

## Evidence and current coverage

| Family | Implemented form | Verification and limits |
| --- | --- | --- |
| Nexus | Recognizes `NEXUS5 Bank` opaque component states, leaving the name unknown | Ten actual Studio One instances inspected. **No names recovered**; no encryption flag is inferred. |
| Sylenth1 | `1lys` selected-program records, plain or the version-3045 zlib wrapper; standard VST2 FPCh/FBCh containers | A public, author-created FPCh example (version 2211, one program, 243 fields) reads `Init`. Multi-slot selection, compressed 3045, malformed states and inflation cap are synthetic tests. No real Studio One Sylenth1 state is available. |
| Omnisphere / Keyscape / Trilian | Clear `SynthMaster/SynthSubEngine/SynthEngine/ENTRYDESCR@name` | Primary implementation evidence and synthetic XML tests only. Excludes the master's Multi/Rack name. No real Studio One host state verified. |
| Stylus RMX | Clear `StylusRMXMaster` XML, explicit `Loop` attributes | Primary implementation evidence and synthetic XML tests only. Reports loop labels, not a guessed Multi name. No real Studio One host state verified. |
| UVI Falcon | Clear `UVI4/Program@DisplayName` | Official UVI FX Controls program reads `FX Controls`; synthetic structure tests exclude layer/keygroup names. This is **not** support for opaque UFS banks, compressed/private plugin states, or all Falcon Multi layouts. No real Studio One host state verified. |

Unknown schema variants remain unknown. A recognized but malformed/private
schema yields a definitive unknown result so a generic text scan cannot turn
embedded script strings into a preset name. Sylenth versions outside the
explicit allowlist and unsupported record field counts are rejected.

## Sources

- Sylenth authored binary example and its author's parser:
  [AudioVSTToolbox example](https://github.com/perivar/AudioVSTToolbox/blob/master/SynthAnalysisStudio/Per%20Ivar%20-%20Test%20Preset%20(Zebra%20vs%20Sylenth).fxp),
  [Sylenth1Preset.cs](https://github.com/perivar/AudioVSTToolbox/blob/master/PresetConverter/Sylenth1Preset.cs).
- Selected-bank/3045 schema observations:
  [sylenth1_bank.dart](https://github.com/bandpassrecords/daw-project-manager/blob/main/lib/services/plugin_presets/sylenth1_bank.dart),
  [format research and explicit fixture caveats](https://github.com/bandpassrecords/daw-project-manager/blob/main/docs/plugin-preset-extraction-plan.md).
- Spectrasonics clear state and per-part name implementation:
  [reaper-mcp/presets.py](https://github.com/Oisub/reaper-mcp/blob/main/src/reaper_mcp/presets.py).
  This is the implementation author's format observation, **not a vendor specification**.
- Official UVI clear XML program:
  [FXControls.uvip](https://lua.uvi.net/FXControls.uvip),
  [UVI examples gallery](https://lua.uvi.net/_examples_page.html).

## Bounds and reproducibility

`src/lib/vendor-presets.ts` limits accepted state/inflation output to 8 MiB.
Streaming zlib aborts when output exceeds that cap. XML declarations of DTDs
or entities are rejected and element count is bounded. Readers use explicit
container boundaries and fields, not a sweep of arbitrary text/name strings.

Run `xvfb-run -a node_modules/.bin/electron --no-sandbox scripts/test-vendor-presets.cjs`.
The script's optional real examples are ignored local research artifacts, not
redistributed test fixtures. It clearly distinguishes synthetic tests from
actual Nexus states and official/authored example files.

The local Nexus probe tested 1,920 offset/mode combinations across ten Comp
chunks (zlib, raw DEFLATE and gzip at offsets 0–63), recovering no valid
structured state. The research script/results are under ignored
`logs/vendor-preset-research/`. A coincidental tiny raw-DEFLATE decode is not
treated as success. High entropy does not establish an encryption algorithm.
