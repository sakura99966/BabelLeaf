# BabelLeaf local LaMa inpainting runtime

Status: implemented and locally verified on Windows x64 on 2026-08-13. This
document records the concrete runtime and release boundary; it does not by
itself close the complete PC 0.4 acceptance verdict.

## Selected upstream components

- Runtime: `onnxruntime-web` 1.27.0, MIT. BabelLeaf packages only the
  single-thread CPU/WASM loader and binary required by this adapter.
- Model: OpenCV `inpainting_lama_2025jan.onnx`, revision
  `aee6d22f0a13e5e35af1c9a1c3afd62841fc6f3f`, Apache-2.0, 92,591,623 bytes,
  SHA-256
  `7df918ac3921d3daf0aae1d219776cf0dc4e4935f035af81841b40adcf74fdf2`.
- The original LaMa implementation remains the algorithm reference. BabelLeaf
  follows the OpenCV published adapter contract: `image` is BGR float32
  `[1,3,512,512]`, `mask` is binary float32 `[1,1,512,512]`, and `output` is
  BGR float32 `[1,3,512,512]` in byte-scale values.

The application neither bundles nor downloads model weights. The approved
model and its license are imported together from a local folder. The
manifest's identity, source revision, license, file names, sizes, and SHA-256
values must all match the repository catalog before installation. Each
artifact is hashed again when it is used.

## Product flow and privacy boundary

1. The user imports `manifest.json`, `inpainting_lama_2025jan.onnx`, and
   `LICENSE.txt` in AI settings.
2. The comic workspace remains on deterministic cleanup by default.
3. A model session is created only after the user explicitly requests a
   preview or enables LaMa for a separate export.
4. Source pixels and the sidecar mask are resized in memory and passed to a
   single local WASM session. No HTTP API exists in this path.
5. Only masked RGB pixels are composited. Alpha and every unmasked source byte
   are preserved.
6. The session and model memory are released after each preview or bounded
   export batch. The original image and comic archive are never overwritten.

The final rerun observed 747.08 MiB verification-process RSS, 3.49-second model
load, and 11.06-second single-page CPU inference. It is therefore intentionally
excluded from startup and idle paths. Concurrency remains one. This is a slow,
explicit quality option; the bounded deterministic cleanup remains the
lower-resource fallback.

## Reproducible local verification

After placing the two exact upstream artifacts under
`target/inpaint-models/opencv-inpainting-lama`:

```powershell
corepack pnpm build:inpaint-model-pack:local
corepack pnpm verify:inpaint-model:local
```

The first command creates the local import folder. The second executes the
actual model through ONNX Runtime WASM and writes transient input/output images
and machine-readable measurements under `target/inpaint-models`. The curated
result is `docs/evidence/INPAINT_LAMA_ONNXRUNTIME_WIN32_X64_2026-08-13.json`.

## Remaining release evidence

The synthetic gate proves runtime compatibility, finite output, material
masked-region changes, local-only execution, and resource characteristics. It
does not prove quality across representative legally usable Japanese,
English, and Simplified Chinese manga/scanned-book pages. The exact installed
NSIS workflow must also import the pack, render a preview, export CBZ and PDF,
restart, retry a failed page, and confirm that source hashes are unchanged.
