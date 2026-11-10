# Kontakt saved-state inspection

SongScope reads project bytes locally. It never loads Kontakt, accesses external
sample libraries, or reads activation/installation data.

## Display rules

- Prefer actual names in occupied saved instrument/program slots, not BANK/Rack names.
- Fall back to typed instrument/snapshot references in the supported path table.
- If there is no recovered name and a validated EncryptionItem enables XOR on
  its associated subtree, display “加密音源无法读取” / “Encrypted instrument cannot be read”.
- Missing, malformed or unsupported data remains unidentified. A decompression
  failure alone is not evidence of encryption. Empty instances are not encrypted.

## Supported structures

Validated VST3 Comp/Cont chunks → size-delimited `hsin` → DSIN 115 subtrees,
DSIN 116 encryption flags, and DSIN 109 single-item Kontakt dictionaries.
Readable subtrees support FastLZ levels 1 and 2 with strict input/output bounds.
For names, follow BANK `0x03` → occupied SLOT_LIST `0x37` →
PROGRAM_CONTAINER `0x29` → PROGRAM_LIST `0x36` → program's public name.
BANK's own name (often `New (default)`) is deliberately ignored.
Fallback references use top-level FILENAME_LIST_EX `0x4b`, version 3, typed
path segments and exact end-of-table validation. Script text is not scanned
for names inside recognized NI containers. Unknown table grammars are skipped.
The DSIN109 trailing word varies between genuine states: it must not be
required to equal `0x8565620d`.

Large NI decoding runs in a dedicated worker with an 8-second deadline.
Limits: 32 MiB input/individual inflation, 64 MiB cumulative inflation, 32
nesting levels, bounded frame/stack/path record counts. A private transferred
copy protects the original archive bytes. Unknown non-NI states only use the
legacy compatibility scanner on the UI thread up to 256 KiB.

## Verification

```sh
node scripts/test-kontakt.cjs
# Optional private six-instance project; never commit the project as a fixture:
SONG=/path/to/comparison.song node scripts/test-kontakt.cjs
SONG=/path/to/comparison.song xvfb-run -a npx electron --no-sandbox scripts/test-kontakt-ui.cjs
```

The private comparison includes empty, guzheng and cello readable states and
three opaque states. Tests verify saved program names, flag-based labels,
locale handling, UI rendering, worker operation, no local-build network traffic,
and malformed/orphaned/truncated state rejection. The UI check expects this
particular comparison's six Kontakt instances and 34 MIDI parts.

## Encryption research (not a shipping decryptor)

An independent local investigation found [libnki](https://github.com/ekphore/libnki):
its `src/protection/authorization.cpp` names the fifth EncryptionItem byte
`xor_enabled`; `src/protection/keys.cpp` applies a product-derived 64 KiB XOR
stream before FastLZ. Observed ciphertext has the exact 65,536-byte period.
The public LCG reconstructs the base table, but the base table alone does not
decode the opaque samples; matching product-derived AES stream inputs are
still missing. Clear product IDs and a 16-bit stream-prefix check in the saved
state are not enough to recover the full stream and are not instrument names.
No new encrypted instrument identity has been recovered. This source was a
research reference; no libnki implementation or key material is shipped.
