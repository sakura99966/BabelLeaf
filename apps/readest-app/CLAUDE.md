# BabelLeaf

The canonical repository instructions are in [AGENTS.md](AGENTS.md). Follow
them for every task.

BabelLeaf is a local-first Next.js/React reader packaged with Tauri v2.
Windows is the current release target, while shared code must remain portable
to macOS, Android, and iOS. Local file import, local persistence, local/system
dictionaries, and local/system speech are supported. The only permitted
network path is a user-initiated request to a configured OpenAI-compatible API
or loopback Ollama endpoint.

Do not reintroduce inherited accounts, cloud sync, OPDS/RSS, scraping, public
sharing, billing, telemetry, online dictionaries, online TTS, updater
services, or background network activity.

Use lazy initialization, bounded caches, range-based file access, and explicit
resource disposal. Keep platform-specific work behind typed Tauri or
application-service adapters.

Current commands, run from the repository root:

```bash
pnpm --filter @readest/readest-app dev-web
pnpm tauri dev
pnpm --filter @readest/readest-app test -- --run path/to/test.ts
pnpm --filter @readest/readest-app test -- --run
pnpm lint
pnpm format:check
pnpm --filter @readest/readest-app build
pnpm fmt:check
pnpm clippy:check
pnpm --filter @readest/readest-app test:rust
pnpm --filter @readest/readest-app build-win-x64:unsigned
pnpm --filter @readest/readest-app test:windows-installer
```

For packaging work, build success alone is not sufficient: run the installer
validation, install into a clean location, and launch the installed program.
