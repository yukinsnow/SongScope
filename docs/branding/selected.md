# Selected identity

- Main name: SongScope
- Descriptive subtitle: Studio One 工程查看器
- Selected concept: round 3, 01 — Signature flow / 手写音乐
- Approved full logo source: `public/brand/round-3/01.png`
- Production lockup: `public/brand/songscope-logo.png`; UI frames the existing image to hide presentation margins and concept numbering without redrawing its wordmark.
- App icon: faithful imagegen extraction of the existing blue note motif and white rhythm dashes, without wordmark / underline / concept number; source saved separately.
- Other concepts remain archived, not active brand choices.

App-icon extraction prompt (built-in imagegen): extract only the original blue musical-note motif and four white rhythm dashes; retain original arrangement and palette; remove wordmark, underline and concept number; center on a near-black softly rounded square tile, with no lens, rings, glow or new elements.

Platform conversion: `node scripts/build-icons.cjs` (requires Python 3 + Pillow). Conversion only resizes/encodes the approved raster; it does not redesign it.

## Client icon update (2026-11-12)

The client icon now uses the full selected handwritten SongScope wordmark, blue notes and underline, as requested. Source: `public/brand/songscope-client-icon.png`; the concept number 01 is removed, with a fully opaque dark square background (transparent-background artifacts were corrected). Converted to `build/icon.png`, `.ico`, `.icns`. Web/PWA note-only icons remain unchanged.

Built-in imagegen edit prompt: preserve the existing central artwork exactly, remove only the lower-left concept number 01, keep a fully opaque near-black square without any transparent pixels; no redesign, added text, glow or borders.
