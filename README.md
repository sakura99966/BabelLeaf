# BabelLeaf

**Read beyond language.**

[简体中文](README_cn.md)

BabelLeaf is an open-source, local-first reader for people who read across
languages. The project is aimed first at Simplified Chinese users reading
English and Japanese books and comics, while keeping the original content,
translation results, annotations, and reading state under the user's control.

> **Development status:** BabelLeaf is in its foundation-migration stage. The
> current source tree is based on Readest and already contains its reading
> engine and application structure. BabelLeaf-specific network isolation,
> identity, LLM translation, bilingual reading, and comic OCR/typesetting are
> still being implemented. There is no BabelLeaf release yet.

## Product boundary

The release target is deliberately narrow:

- Books and comics enter the library through **local file import**.
- Library data, reading progress, annotations, dictionaries, caches, and
  translation artifacts remain local by default.
- The only planned external network access is a translation request that the
  user explicitly enables and sends to a user-configured
  **OpenAI-compatible API endpoint**. A loopback endpoint such as Ollama or LM
  Studio is also valid.
- Accounts, cloud sync, OPDS/RSS catalogs, web scraping, resource downloading,
  public sharing, billing, telemetry, online metadata, online dictionaries,
  online TTS, and inherited update services are outside the first release.
- BabelLeaf does not provide DRM removal or access to copyrighted material the
  user is not authorized to use.

The inherited Readest tree still contains implementations and configuration
for several excluded online services. Their presence is not a statement that
BabelLeaf will ship them. Network containment is active migration work; see
[Network Policy](docs/NETWORK_POLICY.md).

## What exists and what is planned

| Area | Current foundation | BabelLeaf direction |
| --- | --- | --- |
| Application shell | Next.js/React in Tauri v2 | Windows first; retain a practical path to macOS, Android, and iOS |
| Local reading | Readest library and reading engine | Preserve and regression-test local import, layout, search, highlights, notes, and progress |
| Formats | The inherited baseline recognizes EPUB, PDF, MOBI, AZW/AZW3, FB2, CBZ/ZIP, TXT, and Markdown | Stabilize legally obtained, DRM-free EPUB/PDF/MOBI and comic samples before expanding compatibility |
| Text translation | Readest contains legacy translation providers | Replace them with one controlled, user-configured OpenAI-compatible adapter |
| Bilingual reading | Not yet a BabelLeaf workflow | Selection/paragraph translation first, then chapter/book translation, aligned original/translation views, cache, glossary, and translation memory |
| Dictionaries and speech | The baseline contains online and system/Edge-backed paths | Prioritize local dictionaries and operating-system TTS; remove unintended online fallbacks |
| Comics | Basic CBZ/ZIP image reading comes from the baseline | Later: local OCR, text-region detection, erasing/inpainting, translated typesetting, overlay editing, and original/translated views |

Format recognition does not guarantee that every file variant will work. Test
documents must be DRM-free and legally available to the tester.

## Roadmap

### Phase 0 — foundation isolation (in progress)

- Rebase the product on the Readest/Tauri architecture while preserving
  project history.
- Replace inherited Readest product identifiers, data paths, credential
  namespaces, links, and release/update configuration.
- Gate or remove background and user-triggered network paths that are outside
  the BabelLeaf policy.
- Establish Windows build, test, packaging, and local-import regression
  baselines.

### Phase 1 — text translation MVP

- Configure an OpenAI-compatible base URL, model, and API key.
- Store credentials through platform secure storage and never include them in
  logs or exported settings.
- Translate selected text and reading units from English/Japanese to
  Simplified Chinese with cancellation, retry, rate limits, and a local cache.
- Add original/translation and bilingual comparison views.
- Add offline dictionary adapters and local/system speech where feasible.

### Phase 2 — structured book translation

- Extract and translate EPUB content without losing headings, paragraphs,
  ruby text, links, footnotes, images, or reading order.
- Add chapter jobs, glossary enforcement, translation memory, review/editing,
  and portable sidecar results without overwriting the source book.
- Evaluate text-layer PDFs separately from scanned PDFs.

### Phase 3 — comics and additional platforms

- Define a replaceable local OCR/translation/typesetting worker protocol.
- Benchmark Japanese, English, and Chinese OCR; vertical text; speech bubbles;
  full-color pages; and long-strip comics on Windows.
- Research native packaging or platform-specific implementations for macOS,
  Android, and iOS. Desktop Python workers are not assumed to be portable to
  mobile.

## Architecture

```text
React / Next.js user interface
        |
        +-- Readest / foliate-js / PDF.js reading foundation
        |
        +-- Tauri v2 platform bridge
                |
                +-- local library, settings, annotations, and caches
                +-- platform secure credential storage
                +-- controlled OpenAI-compatible translation transport
                +-- optional local comic worker (future, desktop first)
```

The current decision and its trade-offs are recorded in
[ADR-001: Readest baseline](docs/ADR-001-READEST-BASELINE.md). Evaluated
upstreams and candidate components are listed in
[Upstream Inventory](docs/UPSTREAM_INVENTORY.md).

## Development

### Prerequisites

- Git with submodule support
- Node.js 24
- pnpm 11 (the repository pins `pnpm@11.1.1`)
- Rust stable and the platform prerequisites required by Tauri v2
- On Windows: WebView2 Runtime and Visual Studio Build Tools with the
  **Desktop development with C++** workload

### Set up

```bash
git clone --recurse-submodules https://github.com/sakura99966/BabelLeaf.git
cd BabelLeaf
git submodule update --init --recursive
corepack enable
pnpm install --frozen-lockfile
pnpm --filter @readest/readest-app setup-vendors
```

The internal workspace package is still named `@readest/readest-app` during
the migration. Renaming it immediately would create unnecessary conflicts
with future upstream updates; it is not the BabelLeaf product name.

Run the desktop application:

```bash
pnpm tauri info
pnpm tauri dev
```

Run only the web development frontend:

```bash
pnpm dev-web
```

### Verification

For frontend/documentation changes:

```bash
pnpm --filter @readest/readest-app test:pr:web:unit
pnpm lint
pnpm format:check
pnpm --filter @readest/readest-app build
```

When the Tauri/Rust backend changes, also run:

```bash
pnpm fmt:check
pnpm clippy:check
pnpm --filter @readest/readest-app test:rust
```

Platform packaging requires the corresponding Tauri toolchain and should be
verified on the target operating system.

## Source history and upstream

The current tree is derived from
[Readest](https://github.com/readest/readest) at upstream commit
`8c212e5b8b019e40e162a7e20cb90f336a308f13`. The migration merge
(`2bc0b11d`) preserves BabelLeaf's earlier Koodo-based history. The last
Koodo baseline remains available as branch `codex/koodo-baseline` at
`93bd8ebbc613906ca730717dfa3261e2ea93327d`.

Koodo was not rejected as Windows-only—it is an Electron desktop application
with support for several desktop operating systems. Readest was selected
because its Tauri v2 structure gives BabelLeaf a more direct desktop-and-mobile
evolution path.

## License and attribution

BabelLeaf is distributed under the
[GNU Affero General Public License v3.0 or later](LICENSE), following the
license of the Readest baseline. Copyright and license notices from Readest,
Koodo, foliate-js, PDF.js, Tauri, and all other dependencies must be retained.
Each bundled dependency, font, dictionary, OCR model, model weight, voice, and
data file remains subject to its own license and distribution terms.

Using an upstream project as a reference does not mean its code has been
incorporated. Any future integration must be recorded, attributed, and
reviewed for source-distribution and notice obligations before release. This
README is a project description, not legal advice.
