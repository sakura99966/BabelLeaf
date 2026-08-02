# BabelLeaf Development Guide

## Product Scope

BabelLeaf is a local-first, cross-platform reader built on a reduced Readest
foundation. Windows is the immediate release target. The architecture must
remain portable to macOS, Android, and iOS through Tauri v2.

The first-release boundary is strict:

- Books, comics, and dictionaries enter through local file import.
- Reading state, annotations, caches, settings, and translation results remain
  local.
- Network access is limited to translation requests explicitly initiated by
  the user through the built-in DeepSeek V4 preset or a loopback Ollama
  endpoint.
- Accounts, cloud sync, OPDS/RSS, resource scraping, public sharing, billing,
  telemetry, online dictionaries, online TTS, and inherited update services
  are outside the product boundary.
- Do not restore a removed Readest service, route, dependency, background task,
  or platform capability unless the product scope is explicitly changed.

## Architecture

- `src/` contains the Next.js 16 and React 19 interface and TypeScript services.
- `src-tauri/` contains the Tauri v2 shell, Rust commands, and native platform
  integrations.
- `packages/foliate-js/` and the vendored PDF.js assets provide the reading
  foundation.
- Zustand stores persist local application state through the platform service.
- Translation providers are limited to the built-in DeepSeek V4 preset and
  loopback Ollama. A future provider must use a named adapter, an in-app
  official endpoint preset, provider-specific secure credential storage, and
  explicit network capability review; do not reintroduce arbitrary endpoints.
- Dictionaries are local StarDict, MDict, DICT, or SLOB bundles, plus an
  operating-system dictionary where the platform supports it.
- Speech uses local or operating-system engines. No online fallback is allowed.

Keep platform-independent reading and translation logic in TypeScript. Put
filesystem, secure-storage, native speech, and other operating-system work
behind the Tauri or application-service boundary. Do not make React components
depend directly on one desktop platform.

### Source Layout

| Path | Responsibility |
| --- | --- |
| `src/app/` | Application routes and reader screens |
| `src/components/` | Reusable React UI and settings panels |
| `src/services/` | Local reading, translation, dictionary, TTS, and persistence logic |
| `src/store/` | Zustand state stores |
| `src/hooks/` | React integration hooks |
| `src/libs/` | Document loading and reusable lower-level libraries |
| `src/types/` | Shared TypeScript contracts |
| `src-tauri/` | Rust backend and platform-specific implementations |

The TypeScript alias `@/*` resolves to `src/*`.

## Resource and Portability Requirements

- Prefer lazy initialization for parsers, AI clients, dictionaries, workers,
  and media engines.
- Do not start network requests, timers, large file scans, or IndexedDB
  hydration at module import time.
- Bound caches and queues. Dispose object URLs, event listeners, audio
  sessions, workers, and native handles when their owner is released.
- Avoid loading an entire large book, PDF, dictionary, or comic into memory
  when range-based or streaming access is available.
- Keep optional features out of the startup path and remove orphaned code and
  dependencies after verifying that no supported path uses them.
- Preserve behavior across Windows, macOS, Android, and iOS; isolate unavoidable
  platform differences behind typed adapters.

## Development Commands

Run commands from the repository root unless stated otherwise.

```bash
# Install and prepare vendored reader assets
pnpm install --frozen-lockfile
pnpm --filter @readest/readest-app setup-vendors

# Development
pnpm --filter @readest/readest-app dev-web
pnpm tauri dev

# Targeted and full frontend verification
pnpm --filter @readest/readest-app test -- --run path/to/test.ts
pnpm --filter @readest/readest-app test -- --run
pnpm lint
pnpm format:check
pnpm --filter @readest/readest-app build

# Rust verification after src-tauri changes
pnpm fmt:check
pnpm clippy:check
pnpm --filter @readest/readest-app test:rust

# Windows validation package
pnpm --filter @readest/readest-app build-win-x64:unsigned
pnpm --filter @readest/readest-app test:windows-installer
```

The internal package and Rust crate still use inherited Readest identifiers in
some commands. Do not treat those implementation identifiers as the product
name.

## Working Rules

- Follow `.claude/rules/test-first.md`, `typescript.md`, and `verification.md`.
- Use the retained `.claude/skills/i18n/` workflow for localization work.
- Write a failing regression test before fixing a defect, then run the narrow
  test and the relevant surrounding suite.
- Keep changes within the requested scope and preserve unrelated worktree
  changes.
- Use typed contracts; do not introduce `any`.
- Reuse existing settings primitives and verify e-ink presentation for new UI.
- Preserve upstream copyright, license, and attribution notices.

For Windows packaging changes, a successful compiler exit is insufficient.
Build the unsigned installer, run the installer validation script, install it
in a clean test location, launch the installed executable, and inspect the
startup result. Validate packaged resources through execution and logs rather
than by counting visible files in the installation directory.
