# BabelLeaf network policy

## Status

This document defines the **release target** for BabelLeaf. Enforcement is
currently in progress.

The Readest-derived source tree still contains code and configuration capable
of contacting Readest services and other third parties. Until the containment
work below is implemented and tested, a development build must not be
represented as fully local-only or privacy-hardened.

## Policy statement

BabelLeaf accepts reading content through local import and keeps application
state local by default. The only intended external network capability is
translation through an OpenAI-compatible endpoint that the user has explicitly
configured and enabled.

A configured endpoint may be:

- a loopback/local service such as Ollama or LM Studio; or
- a remote HTTPS service chosen by the user.

No provider is implicitly trusted or endorsed. When a remote endpoint is used,
the text required for the requested translation leaves the device and is
subject to that provider's terms and privacy policy.

## Target capability matrix

| Capability | Release target | Notes |
| --- | --- | --- |
| Local document import and rendering | Allowed | Local files only; remote resources embedded or referenced by a document must not be fetched |
| Local application assets and Tauri IPC | Allowed | Includes loopback/custom-protocol traffic required internally by the desktop runtime |
| User-configured LLM translation | Allowed, opt-in | Only after explicit configuration and a user translation action |
| Account and authentication services | Denied | No BabelLeaf account in the first release |
| Cloud/file/progress/annotation sync | Denied | Includes Readest, WebDAV, S3, Google Drive, OneDrive, KOReader, Readwise, and similar paths |
| OPDS, RSS, web clipping, scraping, and resource search/download | Denied | Local import is the content acquisition boundary |
| Public sharing and send-to-device services | Denied | Not part of the first release |
| Telemetry, analytics, and remote crash reporting | Denied | Diagnostics should remain local unless a user deliberately exports them |
| Automatic updates and release checks | Denied initially | A BabelLeaf-controlled update design may be proposed in a later ADR |
| Online book metadata and cover lookup | Denied | Metadata editing and extraction should work locally |
| Online Wikipedia/Wiktionary lookup | Denied | Offline dictionary adapters are the target |
| Online or cloud TTS | Denied | Prefer bundled/local voices or operating-system speech APIs |
| Remote fonts, scripts, styles, images, or document resources | Denied | Required assets must be bundled or locally installed |
| Billing, donation, payment, and marketing calls | Denied | Not part of the reader runtime |

## LLM translation requirements

The translation transport must be narrower than a general-purpose HTTP bridge.
Before release it must satisfy all of the following:

1. The user supplies the endpoint, model, and API key. Translation is disabled
   until configuration is complete and the user enables it.
2. API keys use platform secure storage. They must not be written to ordinary
   settings, translation caches, logs, crash reports, analytics, exports, or
   prompt histories.
3. Only `http` and `https` endpoints are accepted. URL credentials, ambiguous
   host syntax, and unsupported schemes are rejected. Remote plain HTTP should
   require an explicit warning; loopback HTTP is expected for local servers.
4. Redirects must not silently send credentials or document text to a
   different origin.
5. Requests have bounded input/output sizes, timeouts, cancellation, and
   concurrency/rate controls.
6. The UI shows what unit is being sent (for example, a selection or paragraph)
   and whether the endpoint is local or remote.
7. Translation is initiated by an explicit reading or queued-translation
   action. Opening a book must not upload its content.
8. Responses and reusable translation results are cached locally without the
   API key. The original book is never overwritten.
9. Endpoint errors are handled directly. BabelLeaf must not fall back to an
   inherited provider or a developer-operated proxy.

Future background chapter/book jobs may run after an explicit user request,
but they remain subject to the same endpoint, visibility, cancellation, and
data-handling rules.

## Imported-content requirements

Documents are untrusted input.

- EPUB/HTML/CSS/SVG and metadata sanitization must prevent scripts and active
  navigation from escaping the reader.
- HTTP(S) images, fonts, styles, media, frames, and links referenced by a book
  must not load automatically.
- Archive extraction must defend against path traversal, decompression bombs,
  excessive files, and unreasonable dimensions.
- PDF and image decoding should use bounded resources and patched libraries.
- Clicking an external link requires a clear user action and must not attach
  LLM credentials or document contents.

## Inherited Readest paths to contain

The migration audit identified, at minimum, these categories:

- Readest/Supabase authentication and environment initialization;
- cloud and third-party synchronization;
- application updater endpoints and keys;
- PostHog/Sentry telemetry;
- OPDS/RSS, web clipping, public sharing, and send-to-device flows;
- online metadata and cover lookup;
- Wikipedia/Wiktionary and remote dictionary resources;
- Edge/cloud speech and pronunciation;
- remote fonts and remotely referenced book resources;
- DeepL, Azure, Google, Yandex, or other legacy translation providers;
- generic Rust HTTP, WebSocket, OAuth, download, and upload bridges;
- broad Tauri HTTP permissions and content-security-policy origins.

This list is a starting point, not proof of completeness.

## Enforcement plan

- [x] Add a typed product capability table whose BabelLeaf defaults deny every
      external capability except `llmTranslation`.
- [x] Gate the first audited startup paths: Supabase account restoration,
      PostHog, Replica cloud synchronization, settings synchronization, and
      inherited updater checks.
- [x] Gate persisted transfer queues, third-party file-sync passes, OPDS
      subscriptions, replica pull hooks, and inherited remote-font injection at
      their startup and service boundaries.
- [x] Hard-disable native Sentry initialization and DSN propagation for
      BabelLeaf builds.
- [ ] Complete the startup audit and gate every remaining denied service.
- [ ] Remove denied UI entry points and reject the same operations at the
      service/native boundary.
- [x] Park inherited Readest publishing/deployment workflows and remove its
      updater endpoints from the BabelLeaf Tauri configuration.
- [x] Isolate the existing desktop secure-storage service name and park the
      inherited NSIS thumbnail hook until BabelLeaf has a separately verified
      CLSID and native installer.
- [x] Remove custom deep-link registration until the BabelLeaf scheme and every
      producing/consuming runtime path are migrated together.
- [ ] Remove or fully isolate the remaining inherited authentication, sync,
      billing, telemetry/crash-reporting, and update implementations.
- [ ] Bundle or replace remote fonts and other runtime assets.
- [ ] Block remote subresources from imported documents.
- [ ] Replace legacy translators with a single controlled adapter.
- [ ] Store LLM credentials under a BabelLeaf-specific secure-storage
      namespace.
- [ ] Reduce Tauri CSP and permissions to the origins and commands actually
      required.
- [ ] Add automated tests that fail on unapproved URLs, capabilities, redirects,
      startup calls, and remote document resources.
- [ ] Capture and inspect network traffic from clean install, import, reading,
      lookup, TTS, translation, and shutdown test scenarios.

All items above must be completed or explicitly revised in a reviewed decision
before a build is described as conforming to this policy.

## Reporting a network-policy issue

Do not include book text, API keys, tokens, local paths, or private endpoint
details in a public report. Follow the private reporting instructions in
[`SECURITY.md`](../SECURITY.md) and provide the smallest redacted reproduction
that demonstrates the unexpected connection.
