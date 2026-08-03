# BabelLeaf 0.2.2

## Release purpose

Version 0.2.2 is a stabilization release for the 0.2 local reading and text
translation baseline. It does not begin the 0.3 batch-translation feature
scope.

## Completed acceptance items

- Anthropic uses a supported fixed translation model.
- An unavailable selected provider fails closed; translation never silently
  switches to another provider.
- AI requests reject redirects and omit ambient browser credentials.
- Translation artifacts are stored in durable application data. Artifacts from
  0.2.1 are migrated from the old cache location on first access.
- The cache manager cannot remove durable translation artifacts.
- Windows browser tests use deterministic local environment and TTS seams;
  Windows layout checks use structural assertions where native rasterization
  differs from the Linux visual baseline.
- Generated-output checks run through cross-platform Node scripts and are part
  of the application CI check job.
- Retired payment URL permissions and unused payment/legacy encryption source
  files were removed.
- PWA and page metadata identify BabelLeaf and no longer advertise device sync.

## Verification required before publishing

- Frontend format, lint, unit, browser, build-output and production-build
  checks.
- Rust format, Clippy and library tests.
- Tauri integration tests and the exact Windows NSIS installation, startup,
  uninstall and user-data preservation smoke test.
- Remote PR checks, code review and a clean merge into `main`.

The release includes only the owner-requested removal of six legacy public
online-service variables from `apps/readest-app/.env`; API keys, credentials,
and all remaining local environment values are preserved and are not copied
into commits or artifacts.

## Deferred to 0.3

Persistent batch task recovery, retry queues, translation memory, glossary
enforcement, human review, the complete format matrix and comic OCR remain out
of scope for this release.
