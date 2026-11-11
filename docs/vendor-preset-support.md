# Additional saved-state preset readers

These are **offline, read-only metadata readers**, not plugin compatibility or
playback support. No instrument is instantiated. Project files and external
audio/sample libraries are not uploaded or opened.

## Evidence and current coverage

| Family | Implemented form | Verification and limits |
| --- | --- | --- |
| Nexus | Recognizes `NEXUS5 Bank` opaque component states, leaving the name unknown | Ten actual Studio One instances inspected. **No names recovered**; no encryption flag is inferred. |
| Sylenth1 | `1lys` selected-program records, plain or the version-3045 zlib wrapper; standard VST2 FPCh/FBCh containers | A public, author-created FPCh example (version 2211, one program, 243 fields) reads `Init`. Multi-slot selection, compressed 3045, malformed states and inflation cap are synthetic tests. No real Studio One Sylenth1 state is available. |
| Omnisphere / Keyscape / Trilian | Clear `SynthMaster/SynthSubEngine/SynthEngine/SYNTHENG/ENTRYDESCR@name`, legacy `SYNTHENG@name`, and direct engine metadata | One actual Omnisphere 3 Studio One transformed-synth state verified, plus synthetic tests. Reads `CLUB │ Bad Boy Icon Bells` and explicit `Default` slots. Excludes the master's Multi/Rack name and nested layers. Keyscape/Trilian host states remain unverified. |
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
- Additional original Spectrasonics format implementation:
  [omnitools OmnisphereMulti.cs](https://github.com/maranite/omnitools/blob/main/Vst.Presets/Omnisphere/OmnisphereMulti.cs),
  [OmnispherePatch.cs](https://github.com/maranite/omnitools/blob/main/Vst.Presets/Omnisphere/OmnispherePatch.cs).
  These explicitly document the `SYNTHENG` metadata level, including older multis
  that store the patch attributes on that element itself.
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

## Additional file-only investigation (2026-11-11)

An actual Omnisphere 3 state was found in the original archive's
`Presets/Transformed Synths/Omnisphere.vstpreset`, not its active instrument
folder. Its VST3 component holds a 24-byte prefix followed by a declared,
NUL-terminated XML region. This is **clear saved metadata, not decrypted data**.
The previous reader stopped one level too early (`SynthEngine/ENTRYDESCR`);
the actual part metadata is `SynthEngine/SYNTHENG/ENTRYDESCR`. The corrected
reader validates that exact path, permits at most eight direct part engines,
and rejects ambiguous duplicate metadata or nested decoys. Its saved patch is
`CLUB │ Bad Boy Icon Bells`; the remaining seven slots explicitly store
`Default` from `User`. Those labels are retained, not guessed to be empty.
The outer Multi is `default multi` and is not reported as the patch.
The actual private file stays local and is optional in the regression script.

For the ten real Nexus 5 component states, a new bounded local probe tested
13,470 alternate decoding hypotheses: bzip2, LZMA/XZ, Brotli, LZ4 and Zstandard
at seven framing offsets; single-byte XOR followed by standard decompressors;
and byte-reversal, 32-bit swap and adjacent-byte transforms. Outputs are capped
at 8 MiB; LZMA also has a 32 MiB memory cap. No complete structured state or
preset name was recovered. This rejects only those narrow hypotheses; the
four-byte payload alignment, entropy and failures do not establish a cipher,
an encryption flag or a general impossibility. The product continues to show
unknown instead of inventing names. Reproduction and machine-readable results:
`logs/vendor-preset-research/nexus-followup.py` / `nexus-followup.json` (ignored,
local-only research artifacts). No plugin was started and no project uploaded.
