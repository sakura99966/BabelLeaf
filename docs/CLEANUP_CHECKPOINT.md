# Repository cleanup checkpoint — 2026-07-30

Branch: `codex/readest-migration`

This is an intentionally incomplete WIP checkpoint created at the user's
requested stopping point. Do not merge, release, or publish an installer from
this state.

## Completed or substantially completed

- Removed the account, payment, cloud sync, OPDS/RSS, Send, public sharing,
  telemetry, updater, hosted API, general AI assistant, WordLens, and online
  TTS implementation paths that are outside BabelLeaf's local-first scope.
- Reduced TTS to native platform speech and Web Speech, while retaining local
  playback and highlighting behavior.
- Reduced translation providers to Ollama and a user-configured
  OpenAI-compatible endpoint. API-key secure-storage migration and persistence
  tests have been added.
- Removed unused desktop bridge commands and permissions; Rust formatting,
  clippy, and check passed for the completed native cleanup slice.
- Pruned JavaScript dependencies, development dependencies, scripts, and the
  lockfile. Offline frozen-lockfile validation passed for that completed slice.
- Reworked the active CI workflows, repository documentation, network policy,
  and Windows installer smoke/preflight script for the BabelLeaf project.
- Verified the Windows Rust/MSVC/WebView2/NSIS toolchain. The installer smoke
  script preserves existing user data and refuses unsafe destructive tests.

## Work interrupted at this checkpoint

- The final stale-runtime sweep was interrupted while removing remaining demo
  CDN, online metadata/Goodreads, runtime-config, Supabase, and legacy Readest
  link paths. Inspect the resulting diff before continuing.
- Reconcile any imports, tests, and settings types left by the final deletion
  batch. In particular, verify the secure translation-key integration as one
  complete unit.
- Update any test configuration that still refers to a removed package script.
- The final repository state has not received a full TypeScript, Biome, Vitest,
  Rust, or production-build pass.
- A release NSIS package has not been rebuilt. Do not reuse the earlier package.

## Required resume order

1. Review `git status` and the complete checkpoint diff; do not discard the WIP
   checkpoint.
2. Finish the stale-runtime and prohibited-endpoint scan, then repair imports
   and type errors.
3. Remove generated caches before validation.
4. Run TypeScript, Biome, focused and full Vitest suites, Rust checks, and a
   production Tauri build.
5. Build a fresh NSIS package and run preflight plus install/start/uninstall
   validation in a clean test environment.
6. Only then create a release-ready commit and update the remote branch.

## Compatibility constraints

- Keep the Tauri identifier `io.github.sakura99966.babelleaf`.
- Keep migration readers for existing internal `Readest` data directories.
- Keep the offline WebView2 installer, file associations, persisted file
  scopes, local database, native secure storage, local/system dictionaries,
  native/Web Speech TTS, mobile inbound-file import, and HTTP support for
  user-configured OpenAI-compatible endpoints.
