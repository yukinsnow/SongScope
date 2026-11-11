# Kontakt file-only decoding follow-up (2026-11-11)

## Result

No additional encrypted instrument name was recovered. Production decoding is
unchanged: readable saved instrument slots still return their actual names;
structurally encrypted states remain “加密音源无法读取”. Product IDs do not
identify the selected patch and are not substituted for names.

## New bounded experiments

The existing research identified a product-derived 65,536-byte XOR stream,
applied before FastLZ. The public LCG base stream is reproducible, but directly
applying it at phase zero previously failed. This follow-up tested whether a
simple phase or byte-order difference explained that failure:

- All 65,536 circular phases of five base orderings: ordinary, reversed, and
  byte-swapped groups of 2, 4 and 8 bytes.
- All three encrypted project states (product IDs 487, 027 and 425): 983,040
  phase/ordering marker checks in total.
- Each candidate first had to match the saved BNI header's 16-bit stream-prefix
  marker, independently established by the public parser and previous real-file
  observations. This avoids depending on a guessed compressed header.
- Fifteen candidates passed that small marker check; **none** inflated with the
  original FastLZ C implementation to the advertised output size or recovered
  a complete `hsin` root. A marker match alone is plainly not successful decoding.

A separate read-only scan of all four supplied project archives (211, 119, 117
and 114 members) found no `.nicnt` member and no UTF-8/UTF-16 XML schema tags
`ProductSpecific`, `HU` or `JDX`. This does not prove there are no arbitrarily
encoded values somewhere in the data; it rules out the documented plain
product-metadata source inside these archives. No installation, activation,
license, registry or external sample-library files were inspected.

## Verification and remaining gap

The existing Kontakt regression passed **39 checks**, including all six real
comparison instances: two actual instrument names, one empty instance, and
three flag-confirmed encrypted states. No parser changes were warranted by
these negative results. No plugin was invoked and no project data was uploaded.

The remaining dependency is still the matching product-derived stream or its
AES key/IV inputs, not merely the public base stream, product identifier, or
16-bit prefix marker. These results reject the tested simple base-table
transformations; they do not establish that decryption is mathematically
impossible or that every Kontakt version uses the same serialization.

## Reproduction and primary evidence

Local-only, ignored artifacts:

- `logs/kontakt-comparison/crypto-next/followup-base-phase.py`
- `logs/kontakt-comparison/crypto-next/followup-base-phase.json`
- `logs/kontakt-followup-regression.json`

Public implementation references (reviewed again; libnki HEAD remains
`ddac2b5a3636f61858da9b48e2b4b12b66689cab`):

- [Product-stream derivation and periodic XOR](https://github.com/ekphore/libnki/blob/ddac2b5a3636f61858da9b48e2b4b12b66689cab/src/protection/keys.cpp)
- [BNI marker validation](https://github.com/ekphore/libnki/blob/ddac2b5a3636f61858da9b48e2b4b12b66689cab/src/patch/headers.cpp)
- [Public base-stream generator](https://github.com/manzing/NKXTool/blob/main/NKXTool.Core/Cryptography/NkxKeystream.cs)

These are independent source observations, not a Native Instruments format
specification. No third-party implementation or key material is shipped.
