---
name: release-desktop
description: Build and publish the Windows/Linux desktop installers (electron-builder + GitHub Releases + auto-update). Use when cutting a desktop release.
disable-model-invocation: true
---

# Releasing the desktop app

Config: `agent/electron-builder.yml` (Windows NSIS `.exe`, Linux `AppImage`; `publish` → GitHub Releases, repo `Trivedi-Kartik/voice-assistant`). Installed apps auto-update from those releases (`agent/src/main/updater/autoUpdate.ts`, checked every 4h, never restarts mid-conversation).

## Before building
- Server first: if the release needs new server behavior or a DB migration, deploy those first (see `db-migration`). Old clients keep working against a new server only if the change is backward compatible — WS protocol and tool-name changes must be.
- Bump `version` in `agent/package.json` (auto-update compares versions).
- `cd agent && npm run typecheck`, `cd ../server && npm test`.
- The packaged app ignores `agent/.env`: `SERVER_HTTP_URL`/`SERVER_WS_URL` fall back in code to `https://karvix-server.onrender.com` — verify that default is the intended server.

## Build
```bash
cd agent && npm run package    # outputs to agent/release/
```
electron-builder builds only for the OS you run it on — the Windows installer must be built on Windows (or CI), the AppImage on Linux. Artifacts: `Karvix-Setup-<v>.exe`, `Karvix-<v>.AppImage`, plus `latest.yml` / `latest-linux.yml` (required for auto-update — upload them too).

## Publish (only on the user's go-ahead — this is public)
Create a GitHub Release tagged `v<version>` and attach the installers + `latest*.yml`. There is no CI yet (`docs/TECH_DEBT.md` #2).

## Known limits to repeat to testers
- Windows installer is unsigned → SmartScreen warning ("More info → Run anyway").
- Linux AppImage often needs terminal launch with `--no-sandbox` (documented in `docs/SETUP.md`; not fixable in-app).
- Launch the built artifact once before publishing — packaging bugs (missing resources, wrong default URL) have shipped before.
