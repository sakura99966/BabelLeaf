# BabelLeaf network policy

## Status

This policy defines the current product boundary and the conditions required
before a BabelLeaf build can be described as local-first. The application is
still pre-release; source-level containment has been implemented, while clean
runtime traffic capture and several credential/transport hardening checks
remain release gates.

## Policy

BabelLeaf accepts reading content through local import and stores application
state locally. The only intended external network operation is a translation
request that the user explicitly starts and sends to an endpoint the user
configured.

A translation endpoint may be:

- a loopback service such as Ollama; or
- a remote OpenAI-compatible HTTPS service selected by the user.

When a remote endpoint is used, the text included in that request leaves the
device and is governed by the selected provider's terms and privacy policy.
BabelLeaf does not implicitly trust or endorse a provider.

## Capability matrix

| Capability | Policy |
| --- | --- |
| Local document import and rendering | Allowed |
| Local application assets and Tauri IPC | Allowed |
| User-configured LLM translation | Allowed after explicit setup and user action |
| Accounts and authentication | Denied |
| Cloud file, progress, annotation, or settings synchronization | Denied |
| OPDS/RSS catalogs, scraping, web clipping, and resource download | Denied |
| Public sharing and send-to-device services | Denied |
| Telemetry, analytics, and remote crash reporting | Denied |
| Automatic update and release checks | Denied |
| Online metadata or cover lookup | Denied |
| Online dictionaries and pronunciation services | Denied |
| Online or cloud TTS | Denied |
| Remote fonts, scripts, styles, or document subresources | Denied |
| Billing, payment, donation, and marketing calls | Denied |

External links opened by an explicit user action are not background runtime
traffic. They must point to BabelLeaf or authoritative third-party
documentation and must never include book text, credentials, tokens, or local
paths.

## Translation transport requirements

1. Translation is disabled until the user supplies the required endpoint,
   model, and credentials.
2. Opening or importing a book must not send its content anywhere.
3. Only `http` and `https` endpoints are accepted. URL credentials and
   unsupported schemes are rejected.
4. Remote plain HTTP requires a clear warning. Loopback HTTP is permitted for
   local services.
5. Redirects must not silently forward credentials or text to another origin.
6. Input and output sizes, timeouts, concurrency, retries, and cancellation
   must be bounded.
7. The interface must identify the reading unit being sent and whether the
   endpoint is local or remote.
8. API keys must use a BabelLeaf-specific secure-storage namespace and must not
   appear in ordinary settings, caches, logs, diagnostics, or exports.
9. Translation output may be cached locally, but the original book must never
   be overwritten.
10. Provider failure must be reported directly. There is no inherited proxy or
    automatic fallback provider.

Future background chapter or full-book jobs require an explicit user-created
job and remain subject to the same visibility, cancellation, and data-handling
rules.

## Imported content

Documents are untrusted input.

- EPUB, HTML, CSS, SVG, and metadata must be sanitized before display.
- HTTP(S) images, fonts, styles, media, frames, and scripts referenced by a
  document must not load automatically.
- Archive handling must defend against path traversal, decompression bombs,
  excessive entry counts, oversized entries, and unreasonable image
  dimensions.
- PDF and image decoding must use bounded resources and maintained libraries.
- Opening an external link requires a clear user action and must not attach
  credentials or document content.

## Source-level enforcement

The current cleanup removes inherited implementations and entry points for:

- Readest/Supabase accounts and authentication;
- WebDAV, S3, Google Drive, OneDrive, KOReader, replica, settings, dictionary,
  font, and texture synchronization;
- OPDS, RSS, URL clipping, Send, browser-extension, and public-share flows;
- Stripe, Apple/Google in-app purchase, subscription, and usage services;
- PostHog, Sentry, Discord presence, and inherited updater behavior;
- online metadata, Wikipedia, Wiktionary, and web-search dictionary providers;
- Edge/WebSocket TTS, audio download caches, and remote font loading;
- DeepL, Azure, Google, and Yandex translation providers;
- the general-purpose reader chat/RAG assistant;
- hosted API routes, Cloudflare/Docker deployment, app-store automation, and
  upstream release assets.

Automated contracts reject the return of key files, dependencies, native
commands, permissions, identifiers, and fixed service endpoints.

Tauri's HTTP and CSP permissions must accept dynamic destinations because the
translation endpoint is user-defined. That platform permission is not itself
authorization for arbitrary feature code to access the network. The source
tree, provider registry, settings model, and runtime tests collectively define
the narrower boundary.

## Release gates

A release candidate must satisfy all of the following:

- dependency installation from the committed lock file;
- TypeScript, formatting, lint, unit, browser, Tauri, and Rust verification;
- static scans for prohibited endpoints, packages, commands, and platform
  capabilities;
- tests for endpoint validation, redirects, cancellation, request bounds, and
  credential handling;
- tests proving imported documents cannot fetch remote subresources;
- clean-profile traffic capture covering startup, import, reading, lookup,
  speech, translation, and shutdown;
- installation, responsive startup, and uninstall validation of the exact
  Windows package;
- equivalent native build and runtime validation before any macOS, Android, or
  iOS release.

Until these gates pass, a development build must not be described as
privacy-hardened or release-ready.

## Reporting

Do not place book text, API keys, access tokens, private endpoint details, or
local paths in a public report. Follow [SECURITY.md](../SECURITY.md) and submit
the smallest redacted reproduction that demonstrates the unexpected
connection.
