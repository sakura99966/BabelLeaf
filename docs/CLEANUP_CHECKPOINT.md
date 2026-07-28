# Cleanup checkpoint — 2026-07-29

Branch: `codex/readest-migration`

This is an intentionally incomplete WIP checkpoint created when development
was paused. Do not merge or release this commit yet.

Completed slices:

- Removed hosted API routes, account/payment pages, cloud workers, browser
  extension, Calibre/KOReader sync add-ons, Docker/cloud deployment files,
  telemetry, Sentry, and the updater.
- Decoupled the active library and reader entry points from account, cloud
  sync, OPDS/RSS, Send, URL clipping, public sharing, Readwise, Hardcover, and
  KOReader Sync.
- Removed the matching top-level Tauri commands/plugins for OAuth, remote file
  transfer, URL clipping, Discord presence, updater, telemetry, and WebSocket
  TTS.
- Added a Windows NSIS install/start/uninstall smoke gate. The offline WebView2
  installer setting remains enabled.

Paused work:

- The retired-service deletion batch was stopped after 25 of 194 source files.
  Finish the remaining source and dedicated test deletion as one coherent
  slice.
- Edge TTS cleanup was interrupted after several files/tests were deleted.
  Reconcile callers and keep Native TTS plus Web Speech.
- Legacy translator/online-dictionary cleanup was only audited and must be
  completed while preserving OpenAI-compatible/Ollama translation and local
  dictionaries.
- Reconcile `package.json`, `pnpm-lock.yaml`, Rust/native bridge permissions,
  and mobile platform manifests after source deletion.
- Run TypeScript/Biome/Vitest, Rust fmt/clippy/test, release NSIS build, then
  install/start/uninstall smoke validation before making a release-ready commit.

Compatibility items that must remain:

- Tauri identifier `io.github.sakura99966.babelleaf`
- Existing internal `Readest` data subdirectories and migration readers
- `offlineInstaller`, file associations, persisted file scopes
- Local Turso database, native bridge secure storage, local/system dictionary,
  Native TTS, Web Speech, and mobile inbound file import
- `tauri-plugin-http` for user-configured OpenAI-compatible endpoints
