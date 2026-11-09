# Hosting and release operations

## Production

- URL: https://songscope.response.run
- Cloudflare Pages project: `songscope-web`
- Source provider: native GitHub integration, `yukinsnow/SongScope` (private), production branch `main`
- Build command: `npm run build`; output directory: `dist`; repository root
- Build environment: `NODE_VERSION=22`, `ELECTRON_SKIP_BINARY_DOWNLOAD=1`
- DNS: proxied `songscope.response.run` CNAME to `songscope-web.pages.dev`
- The first deployment was seeded from the connected Git repository via the Pages deployment API; no dist/assets were uploaded from the host.
- Main pushes automatically trigger native repository builds. Verified deployment `dd3d4361-a7b2-4233-8a10-dbf2fde39efe`: trigger `github:push`, main commit `555bebf2f10bc257c8752a20b26140565b1465aa`, all clone/build/deploy stages succeeded.
- Legacy direct-upload `songscope.pages.dev` is archival and is not the current production site. Do not upload a second copy of production there.

## Browser checks

```bash
WEB_URL=https://songscope.response.run xvfb-run -a npx electron --no-sandbox scripts/test-timing-shortcuts.cjs
WEB_URL=https://songscope.response.run xvfb-run -a npx electron --no-sandbox scripts/test-presets.cjs
```

These checks load the live app in a clean session, use synthetic timing/preset cases, and may optionally verify an authorized local real sample when present. The actual song is never copied to public/ or sent to a server.

## Desktop release

Tag-triggered `.github/workflows/build.yml` builds Windows x64 ZIP, Linux x64/ARM64 AppImage, and macOS Intel/Apple Silicon DMG. Linux runs timing/shortcut/preset regression checks before packaging. Assets are attached to a private Release; preserve repository privacy. Source-only pushes update Pages without creating a desktop release.

Do not store credentials in this file, the repository, or public assets. The Cloudflare Git integration holds its own GitHub authorization; desktop CI uses the built-in repository token.
