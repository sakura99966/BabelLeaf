# BabelLeaf 0.4.4

## Release purpose

0.4.4 is a traceability and PC release-closure patch. It does not expand the
0.4 feature boundary. It publishes the reviewed acceptance, persistence,
native-speech, installer, security, and CI corrections that were completed
after the historical `v0.4.3` tag.

The public `v0.4.3` tag remains immutable. This release uses a new version and
tag so source, version metadata, tests, package hashes, SBOM, and the remote
release record can agree without rewriting published history.

## Delivered scope

- Complete the PC 0.4 acceptance implementation and retain immutable-source
  local sidecars for text and comic translation workflows.
- Preserve the local Tesseract WASM OCR and explicitly imported LaMa/ONNX
  cleanup paths without bundling or automatically downloading model weights.
- Retain bounded format, translation, dictionary, native speech, comic editing,
  export, recovery, cache, and resource controls.
- Await native settings persistence at the application-service boundary so a
  completed save is durable before the caller proceeds.
- Stabilize native Windows speech acceptance while keeping strict completion
  checks on release machines and a separately declared hosted-runner policy.
- Restore all required release CI lanes, including Windows installer smoke,
  browser, native E2E, coverage, security, build, and Rust checks.
- Make Git hooks and SBOM dependency enumeration prefer Corepack so they use
  the repository-declared pnpm version instead of an unrelated PATH fallback.
- Align the application package, Rust crate, NSIS package, roadmap, acceptance
  record, and release metadata on version `0.4.4`.

## Release evidence

The authoritative source commit, remote checks, artifact sizes and SHA-256
values, SBOM identity, package verification, and unresolved external gates are
recorded in `PC_0.4.4_RELEASE_ACCEPTANCE_2026-08-23.md` and in the GitHub
release for `v0.4.4`.

## Distribution boundary

The Windows package produced without a protected Authenticode identity is
explicitly an unsigned build. Its hash and source provenance remain
verifiable, but unsigned publication does not satisfy the signing gate or the
human/clean-host acceptance gates. No credential, source book, sidecar, local
model weight, or user data is included in the release artifact.

## Remaining external gates

- Credentialed DeepSeek, OpenAI, and Anthropic lifecycle and traffic-capture
  tests explicitly authorized by the credential owner.
- Representative legally supplied manga, comic, and scanned-book visual-quality
  review.
- Exact-package workflow verification on a separate clean minimum-spec Windows
  host.
- Human English, Japanese, and Simplified-Chinese speech review.
- Authenticode signing and protected-key procedure.
- Owner or legal approval of notices, model/font terms, and AGPL corresponding
  source obligations.

These are formal PC acceptance gates. They are not represented as completed by
the automated 0.4.4 publication.
