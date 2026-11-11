# Saved preset support and confidence

SongScope reads saved project/plugin-state data only. No installed plugin,
external sample path, network request or live plugin API is used to obtain names.
A recognized plugin brand is **not** proof that all its state versions are readable.
The host's generated `.vstpreset` filename is never treated as a patch name.

| Plugin | Reader | Validation / limits |
| --- | --- | --- |
| Kontakt | NI container + occupied program slots; validated empty and encryption flags | Real six-instance project: two names, one empty, three unreadable encrypted states. Not general Kontakt decryption. |
| Serum 2 | Explicit XferJson preset metadata | Two real project instances verified. |
| Generic VST2 | Saved FXP program name | Standard field only, not arbitrary binary strings. |
| Vital | Root JSON `preset_name` with `synth_version` / `settings`; supported JUCE wrappers | Official source format + synthetic cases, no real Vital Studio One state yet. Nested sample/LFO/wavetable names excluded. |
| Sylenth1 | Supported `1lys` selected-program records, including supported zlib wrapper and standard FXP | Authored FXP example plus synthetic selected-bank / compressed cases; not real Studio One host-state verified. |
| Omnisphere | Clear `SynthMaster` XML: part-scoped `SynthSubEngine/SynthEngine/SYNTHENG/ENTRYDESCR@name` and supported older forms | One real Studio One audio-transform state verified: `CLUB │ Bad Boy Icon Bells` and saved `Default` slots. Audio-transformed tracks expose the archived state with a visible label, not a claim that the plugin is running. Master/Multi/Rack and layer names excluded; opaque variants unsupported. |
| StylusRMX | Clear `StylusRMXMaster` XML loop labels | Schema cases only; opaque variants unsupported. |
| UVI Falcon | Clear `UVI4` XML direct `Program@DisplayName` | Official UVI program example plus synthetic cases; not real Studio One host-state verified. Layer/script/oscillator labels excluded. |
| Nexus | Detect known opaque `NEXUS5 Bank` component state | Ten actual host instances inspected; **no patch names recovered**. Not falsely marked encrypted, since no validated encryption flag is available. |

XML readers reject malformed XML and entity/doctype declarations. Compressed
Sylenth decoding stops at an 8 MiB output budget; unknown versions/record shapes
remain unrecognized. Fallback generic explicit metadata extraction is best effort,
not a universal plugin decoder.

## Primary source / implementation evidence

- Vital host serialization: <https://github.com/mtytel/vital/blob/main/src/plugin/synth_plugin.cpp>.
- Vital JSON fields: <https://github.com/mtytel/vital/blob/main/src/common/load_save.cpp>.
- Additional authored-format evidence and exact links: [vendor format research](vendor-preset-support.md).

## Regression commands

```bash
node scripts/test-vital-preset.cjs
xvfb-run -a npx electron --no-sandbox scripts/test-vendor-presets.cjs
xvfb-run -a npx electron --no-sandbox scripts/test-presets.cjs
```

Real plugin/project files and downloaded example presets remain outside fixtures
and public assets. Synthetic cases establish reader behavior, not compatibility
with every version of the named product. Additional authorized `.song` instances
are needed to validate the untested real-host variants.

Additional Kontakt decoding attempts and remaining limits are recorded in
[the file-only follow-up](kontakt-decode-followup.md). No additional encrypted
Kontakt names were recovered; recognition of an encryption flag is not decryption.

`scripts/test-transformed-presets.cjs` checks ownership and ambiguity guards for
archived audio-transform states, plus bilingual mobile/desktop labels. The real
Omnisphere sample is optional and stays local.
