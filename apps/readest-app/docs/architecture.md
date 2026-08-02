# BabelLeaf architecture

## Scope

BabelLeaf is a local-first reader packaged with Tauri v2. Windows is the
current delivery target. The shared React and TypeScript application must
remain usable by future macOS, Android, and iOS packages.

The application has no hosted backend. Content is imported from local files
and application state is stored locally. The only supported external request
is a translation explicitly initiated by the user and sent to an endpoint the
user configured.

## Runtime structure

```text
React / Next.js static application
├── library and reader interface
├── reading state and UI stores
├── document adapters
│   ├── foliate-js: EPUB, MOBI-family, FB2, CBZ/ZIP and text formats
│   └── PDF.js: PDF parsing and rendering
├── local feature services
│   ├── annotations, navigation and search
│   ├── local dictionaries
│   ├── native/system speech
│   └── translation cache
└── AppService boundary
    ├── native Tauri implementation
    └── browser-compatible implementation used by development and tests

Tauri native host
├── user-approved filesystem access and persisted scopes
├── native file dialogs and local database
├── platform secure storage
├── native speech and mobile widgets
├── deep links and inbound local-file handling
└── HTTP transport used only by configured translation providers
```

The production package uses a static Next.js export. It does not ship Next.js
API routes, a Cloudflare worker, an account service, or a synchronization
server.

## Main source areas

| Path | Responsibility |
| --- | --- |
| `src/app/library/` | Local library, import, organization, and book actions |
| `src/app/reader/` | Reader views, annotation tools, search, translation, TTS, and layout |
| `src/components/` | Reusable interface and settings components |
| `src/context/` | Runtime dependency and platform contexts |
| `src/hooks/` | React integration for local application services |
| `src/services/` | Reading, persistence, dictionaries, translation, TTS, and platform abstractions |
| `src/store/` | Focused Zustand stores for local UI and reading state |
| `src/libs/` | Document loading and lower-level reusable logic |
| `src/types/` | Shared TypeScript contracts |
| `src-tauri/` | Rust host and platform-specific native implementations |
| `packages/foliate-js/` | Upstream reading engine submodule |
| `packages/js-mdict/` | Local MDict parser submodule |
| `packages/simplecc-wasm/` | Local Chinese conversion submodule |

Internal upstream names can remain where changing them would create migration
or data-compatibility risk. They must not leak into user-visible product
identity, bundle identifiers, secure-storage namespaces, or release endpoints.

## Local data

The application service owns all durable file and database access. React
components do not construct platform-specific paths.

Local state includes:

- library metadata and organization;
- reading positions, bookmarks, highlights, and notes;
- per-book display configuration;
- imported dictionaries, fonts, and textures;
- translation settings and cached results;
- application and accessibility settings.

Existing Readest-named data subdirectories may be read for migration
compatibility. New operating-system identities and secure-storage namespaces
use BabelLeaf so the two applications cannot collide.

## Document pipeline

1. The user selects one or more local files.
2. The platform service grants access only to the selected paths.
3. The importer identifies the format, extracts bounded metadata and a cover,
   and records the local library entry.
4. The reader opens content through range-based or archive-aware adapters
   where available.
5. Rendering, navigation, annotations, and progress remain independent of the
   host operating system.

Imported EPUB/HTML/CSS/SVG content is untrusted. Remote subresources are not
part of the supported document pipeline. Archive and image handling must keep
size, entry-count, path, and allocation limits.

## Translation

Translation is a reader feature, not a general chat assistant.

Supported provider classes are:

- Ollama, normally on a loopback address; and
- an OpenAI-compatible API whose base URL, model, and API key are supplied by
  the user.

Opening or importing a book does not initiate translation. A translation
request starts only from an explicit reader action. The request contains the
selected reading unit, uses bounded concurrency, supports cancellation, and
stores reusable output locally without storing the API key in the translation
cache.

Future chapter, book, and comic translation must use versioned sidecar data
instead of overwriting source documents.

## Dictionaries and speech

Dictionary lookup is local-first. Supported imported formats and
platform-provided dictionary functions are exposed through typed adapters.
There is no automatic Wikipedia, Wiktionary, or web-search fallback.

Speech uses the Tauri native speech plugin on supported packaged platforms and
Web Speech where appropriate. Online Edge/WebSocket speech and downloaded
voice caches are outside the architecture.

## Portability and resource constraints

- Platform-independent behavior belongs in TypeScript services.
- Native capabilities belong behind Tauri or `AppService` contracts.
- Large books, PDFs, dictionaries, and comic archives must use range-based,
  streamed, paged, or lazy access when practical.
- Parsers, AI clients, speech engines, and dictionaries initialize on demand.
- Caches and queues require explicit bounds.
- Object URLs, event listeners, audio sessions, workers, database handles, and
  native resources require deterministic cleanup.
- Desktop-only helpers must not become assumptions in shared mobile code.
- Optional features must not execute on the startup path.

## Packaging

Tauri packages the static web output and required resources into the
application executable. A Windows NSIS installation therefore normally
contains the main executable and uninstaller rather than a visible copy of
every web asset.

The Windows package embeds the WebView2 offline installer. A successful build
is not sufficient for release: the exact installer must be checked, installed
under a clean Windows profile, launched until it creates a responsive window,
and then uninstalled while preserving user data.

Platform packages must be compiled and exercised on their target operating
systems. Source-level checks of Swift, Kotlin, manifests, and entitlements are
useful but do not replace native builds.
