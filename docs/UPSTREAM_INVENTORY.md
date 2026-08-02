# Upstream inventory and integration policy

This inventory records source provenance and candidates already evaluated for
BabelLeaf. A repository appearing here does **not** mean that all of its code,
assets, models, or behavior is included in BabelLeaf.

## Active application baseline

| Component | Source / revision | License recorded in source | BabelLeaf use |
| --- | --- | --- | --- |
| [Readest](https://github.com/readest/readest) | `8c212e5b8b019e40e162a7e20cb90f336a308f13` | AGPL-3.0-or-later | Active React/Next.js + Tauri v2 application and reading baseline |
| [Koodo Reader](https://github.com/koodo-reader/koodo-reader) | BabelLeaf baseline `93bd8ebbc613906ca730717dfa3261e2ea93327d` | AGPL-3.0 | Historical Electron baseline retained in main Git history; not the current tree |

The baseline migration merge is `2bc0b11d`. Readest and Koodo remotes are
configured as read-only upstreams for review; BabelLeaf publishes to
`sakura99966/BabelLeaf`.

## Git submodules in the current tree

The revision pins below are part of the Readest baseline and must remain
reproducible.

| Path / project | Pinned revision | License recorded in the submodule |
| --- | --- | --- |
| `packages/foliate-js` | `df623dbe6610fd98a7c2d5d7a5c23bfcfc7d19f3` | MIT |
| `packages/tauri` | `6914700e04bfc391a2adfa9c3393a2afe376c154` | Apache-2.0 OR MIT |
| `packages/tauri-plugins` | `4350ca652d33e3face88d7c97a78830553545550` | Apache-2.0 OR MIT |
| `packages/simplecc-wasm` | `5e5b56f5b82394e7df07f9171ac70f4578b24a32` | MIT |
| `packages/qcms` | `fc23a407f1ed9ccfea15875d27e0936dcc798a1f` | MIT |
| `packages/js-mdict` | `d01bf62af872b1fbeacb2f18446460960e7400de` | AGPL-3.0 at this revision |
| `packages/tao` | `da30a3b9df2ff9ef01d461c446d3cdbc82304e92` | Apache-2.0 |
| `apps/readest-app/src-tauri/plugins/tauri-plugin-turso` | `204dc954b2e1e7811565b0c4217aa04ea741a224` | MIT (declared in `Cargo.toml`) |
| `apps/readest-app/src-tauri/plugins/tauri-plugin-webview-upgrade` | `c7c04abee8a12e32823febec44779c075e076e25` | MIT |

This table is not a replacement for dependency-level software-bill-of-materials
generation. Transitive npm and Cargo dependencies must also be audited for a
release.

## Local evaluation mirrors

When present, the ignored `.upstream/` directory contains shallow/local source
mirrors used for architecture and license evaluation. They are not committed,
are not submodules, and are not evidence that a GitHub fork exists. They are
disposable local research data rather than build input, so a new checkout is
not expected to contain them and they may be deleted after evaluation.

| Repository | Local evaluation snapshot | License recorded in that snapshot | Evaluation purpose | Integration state |
| --- | --- | --- | --- | --- |
| [Readest](https://github.com/readest/readest) | `7786400` | AGPL-3.0-or-later | Earlier Tauri/reader evaluation | Superseded as a mirror by the newer active baseline above |
| [calibre](https://github.com/kovidgoyal/calibre) | `e94b07d` | GPL-3.0-only | Format conversion and metadata strategy | Reference only; no Calibre application code copied |
| [YACReader](https://github.com/YACReader/yacreader) | `da08f0f` | GPL-3.0 family; exact notices must be rechecked before use | Comic library, RTL, double-page, zoom, archive UX | Reference only; no Qt application code copied |
| [BallonsTranslator](https://github.com/dmMaze/BallonsTranslator) | `7fb91b6` | GPL-3.0-or-later | Text detection, OCR, inpainting, typesetting, editing | Candidate desktop worker; not integrated |
| [manga-image-translator](https://github.com/zyddnys/manga-image-translator) | `95227a2` | GPL-3.0-only | End-to-end comic/image translation | Alternative candidate desktop worker; not integrated |
| [mokuro](https://github.com/kha-white/mokuro) | `9f79b12` | GPL-3.0 family; exact notices must be rechecked before use | Selectable OCR overlay and Japanese-learning workflow | Coordinate/sidecar reference; not integrated |
| [manga-ocr](https://github.com/kha-white/manga-ocr) | `c333b5d` | Apache-2.0 | Lightweight Japanese manga OCR | Candidate replaceable OCR adapter; not integrated |
| [PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR) | `2661c7c` | Apache-2.0 | Chinese/English/Japanese document and image OCR | Candidate replaceable OCR adapter; not integrated |

BallonsTranslator and manga-image-translator overlap substantially. BabelLeaf
will not combine both complete applications. If comic translation work starts,
the candidates should be benchmarked against the same legally obtained sample
set, then one primary worker selected behind a BabelLeaf-owned local protocol.

## Integration rules

1. BabelLeaf maintains one library, settings model, task model, and reader UI.
   Complete external applications are not pasted together.
2. Candidate conversion or OCR components connect through a narrow local
   adapter or worker protocol. The protocol must keep the engine replaceable.
3. No candidate becomes a dependency merely because it exists in `.upstream/`.
   The chosen revision and integration commit must be added to this inventory.
4. Source code, copyright notices, license texts, modification notices, build
   instructions, and corresponding-source obligations must be reviewed before
   distribution.
5. GPL/AGPL compatibility must be assessed for the actual linking and process
   boundary used. A separate process is not an automatic exemption from license
   obligations.
6. Model weights, OCR language data, fonts, dictionaries, TTS voices, test
   documents, and API services require separate license and redistribution
   review; a repository's software license does not automatically cover them.
7. No DRM-removal component or unlicensed content source is in scope.

## Planned comic-worker result model

The future worker should return a BabelLeaf-owned, versioned sidecar rather
than overwrite source pages. At minimum it will need:

- source page identity and dimensions;
- detected text-region polygon and reading order;
- source language, OCR text, confidence, and optional ruby;
- translated text, model/glossary provenance, and review state;
- mask/inpainting reference;
- typesetting geometry, orientation, font/style, and overflow state;
- cancellation/error information.

This is a design target only. No production comic worker has been selected or
integrated yet.

## Attribution and release checks

BabelLeaf's root [`LICENSE`](../LICENSE) contains the AGPL text used by the
current application baseline. Before each release:

- retain Readest and other upstream copyright/license notices;
- update this inventory and generated dependency notices;
- verify every submodule is present at its recorded revision;
- inventory bundled fonts, voices, dictionaries, native libraries, model
  weights, and data assets;
- publish corresponding source and build information as required by the
  applicable licenses.

This inventory supports engineering and compliance review; it is not legal
advice.
