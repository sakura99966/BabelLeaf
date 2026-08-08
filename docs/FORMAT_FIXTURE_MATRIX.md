# BabelLeaf 0.4.3 format, OCR, and comic-pipeline fixture matrix

This matrix is the release gate for local text extraction and translation. It
uses only repository-owned or legally obtained DRM-free samples. The test
suite never downloads a book, contacts an online catalog, removes DRM, or
rewrites an imported source.

| Format | Valid sample | Malformed/hostile case | Empty/image-only case | Encrypted/DRM case | Expected route |
| --- | --- | --- | --- | --- | --- |
| EPUB | `sample-alice.epub` | malformed ZIP/container | empty spine | encryption marker | text extraction |
| PDF | `sample-alice.pdf` | malformed header/xref | `sample-paper.pdf` or image-only page | encrypted document | text-layer/mixed/image-only diagnostic |
| MOBI | `sample-war-peace.mobi` | truncated PalmDB | empty record | DRM marker | MOBI parser |
| AZW/AZW3 | extension-preserving MOBI samples | truncated record | empty record | DRM marker | MOBI-family parser |
| FB2 | `sample-metadata.fb2` | malformed XML/entity | empty body | rights marker | XML parser |
| CBZ | `sample-metadata.cbz` | malformed ZIP/traversal entry | image-only archive | encrypted ZIP | local OCR text layer |
| TXT | `sample-alice.txt` | invalid/oversized input | zero-byte file | rights marker | bounded text conversion |
| Markdown | repository Markdown sample | malformed front matter | empty document | rights marker | sanitized Markdown rendering |

The executable matrix is represented by
`TRANSLATION_FORMAT_FIXTURE_MATRIX` in
`apps/readest-app/src/services/translators/formatMatrix.ts`. Existing binary
fixtures are reused where available; generated malformed, empty, encrypted,
and oversized cases remain test-only and must not be distributed as books.

Resource limits are explicit: 512 MiB input files, 20,000 archive entries,
and 2 GiB uncompressed archive content. A limit violation is reported as
`oversized`; malformed input is reported as `malformed`; encrypted or DRM
content is reported as `drm`; and image-only content is reported as
`image-only`. No partial translation artifact is written after a failed
validation.

## OCR workflow matrix

The OCR-specific fixtures are represented by `OCR_FORMAT_FIXTURE_MATRIX` in
`apps/readest-app/src/services/translators/formatMatrix.ts`. They cover local
CBZ/FBZ pages, image-only and mixed PDFs, and platform-provided image-folder
manifests. Each route has a valid, malformed, image-only, and oversized case.
The matrix is a manifest of legal local inputs; it does not cause directory
scanning or network downloads.

## Comic workspace matrix

`COMIC_WORKSPACE_FIXTURE_MATRIX` covers the correction and translation-overlay
sidecar boundary. Each source fixture has a valid workspace, malformed
workspace, and interrupted-workspace recovery case. Tests verify that machine
OCR remains available after manual edits, rerunning OCR does not overwrite an
approved edit, stale translations are reviewable, and the source file remains
unchanged. Workspace files contain no page bytes, credentials, or arbitrary
remote endpoints.

## 0.4.2-0.4.3 service matrix

The image pipeline tests cover deterministic mask rasterization, expansion,
feathering, local fill, optional worker cancellation, vertical/RTL typesetting,
hostile edit sidecars, source-preserving image-set/CBZ/ZIP export, and ordered
pipeline recovery. Binary page fixtures are intentionally not bundled in the
base package; release candidates use legally obtained local samples and record
their checksum, license, dimensions, and expected diagnostics separately.
