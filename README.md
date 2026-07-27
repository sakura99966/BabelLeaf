# BabelLeaf

**Read beyond language.**

BabelLeaf is an open-source, local-first reader for books, documents, and comics. It is being built for readers who move between Simplified Chinese, English, and Japanese and want translation, dictionary lookup, text-to-speech, and manga translation to stay close to the reading experience.

> **Project status:** active foundation work. The repository currently starts from the Koodo Reader codebase. The BabelLeaf product identity, local AI workflow, bilingual reading model, and comic translation workflow are under development; the roadmap below is not a statement that every feature has shipped.

[简体中文](./README_cn.md) · [Upstream inventory](./docs/UPSTREAM_INVENTORY.md)

## Goals

- Keep a user's library local by default.
- Import and read books directly from local files, without a built-in web crawler or resource downloader.
- Make English and Japanese content easy to read in Simplified Chinese with user-configured AI models.
- Support both reflowable text books and image-first comics without destroying original files.
- Build a shared product experience for Windows first, followed by macOS, Android, and iOS.

## Content formats

The inherited reader baseline supports the following local formats. BabelLeaf will keep validating them as the codebase evolves.

| Type | Formats |
| --- | --- |
| E-books | EPUB, MOBI, AZW, AZW3, FB2, TXT, Markdown, DOCX, HTML, XML, XHTML, MHTML |
| Documents | PDF |
| Comics | CBZ, CBR, CBT, CB7, local image collections |

DRM-protected books are out of scope. A DRM-free MOBI or Kindle-format import may be converted into an internal reading representation while the original file remains untouched.

## Reading and language features

### Available in the inherited baseline

- Local library, batch import, metadata, shelves, tags, progress, bookmarks, notes, and highlights.
- EPUB/PDF/text/comic reading modes, including vertical text and common page layouts.
- Dictionary lookup, text-to-speech, OCR options, and configurable translation/AI plug-ins.

### BabelLeaf focus

- Bring-your-own-key model connections, including OpenAI-compatible endpoints.
- Explicit consent before sending selected text or OCR output to an external model.
- Translation memory, terminology, retryable background jobs, and transparent model/cost settings.
- Original-only, translation-only, and aligned bilingual views for text-based books.
- Language-aware word lookup for English and Japanese.
- Language-aware TTS for Chinese, English, and Japanese.

## Comic translation workflow

Comic translation is a first-class workflow, not a flattened image filter:

1. Import a local archive or image collection.
2. Detect text regions and recognize Japanese, English, Chinese, and other configured languages.
3. Translate the extracted text with a user-selected provider.
4. Store original text, translated text, coordinates, style, and confidence separately from the source images.
5. Render an editable translation overlay; users can switch between original, translated, and bilingual views.
6. Export a flattened copy only when the user explicitly asks for one.

We are evaluating open-source OCR and comic-processing projects through a local worker interface. The decision record and license inventory are in [docs/UPSTREAM_INVENTORY.md](./docs/UPSTREAM_INVENTORY.md).

## Architecture direction

```text
Electron + React reader shell
  ├─ Local library, reading state, annotations, settings
  ├─ Translation queue and bilingual content model
  └─ Local worker protocol
       ├─ OCR adapter (for example, PaddleOCR or manga-ocr)
       ├─ Comic layout / typesetting adapter
       └─ User-configured translation and TTS providers
```

Windows is the first delivery target. Cross-platform compatibility is an architectural requirement, but Python- and GPU-based comic workers need separate packaging and validation for macOS, Android, and iOS.

## Privacy principles

- Books, PDFs, comics, annotations, and derived translation data stay on the device by default.
- API keys must use platform-secure storage and must never be synced as plain text.
- External AI calls are opt-in and should show the destination model/provider before content is sent.
- Cloud sync, if added later, will prioritize metadata, progress, notes, and translation results rather than silently uploading a whole library.

## Development

### Prerequisites

- Node.js 20 or later
- Yarn Classic
- A supported desktop build environment for Electron

### Run locally

```bash
yarn
yarn dev
```

Useful commands:

```bash
yarn start    # Web development mode
yarn build    # Production web build
yarn test     # Run tests
yarn release  # Package the Electron application
```

## Repository layout

| Path | Purpose |
| --- | --- |
| `src/` | React UI, reader views, state management, utilities, and i18n |
| `main.js` | Electron main process, IPC, local database access, and native integration |
| `httpserver/` | Optional Go HTTP service used by inherited integrations |
| `docs/` | Product decisions, upstream inventory, and engineering documentation |
| `.upstream/` | Ignored local mirrors used for evaluation; never committed into the application repository |

## Roadmap

1. Establish the BabelLeaf identity and remove upstream branding/service assumptions.
2. Build the local BYOK translation service and a stable bilingual text model.
3. Add translation memory, terminology, and language-aware dictionary/TTS behaviour.
4. Define and implement the comic OCR, translation, overlay, and correction workflow on Windows.
5. Validate import, reader, worker, and sync boundaries for macOS, Android, and iOS.

## License and attribution

BabelLeaf is derived from [Koodo Reader](https://github.com/koodo-reader/koodo-reader) and is distributed under the GNU Affero General Public License v3.0 (AGPL-3.0). It is an independent project and is not affiliated with the Koodo Reader maintainers.

The project must preserve applicable copyright notices and license terms for all reused code, OCR models, fonts, dictionaries, and other bundled assets. See [docs/UPSTREAM_INVENTORY.md](./docs/UPSTREAM_INVENTORY.md) before adding an upstream dependency.
