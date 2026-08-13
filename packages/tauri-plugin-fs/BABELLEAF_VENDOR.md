# BabelLeaf vendored Tauri filesystem plugin

This directory is derived from `readest/tauri-plugins-workspace`, subdirectory
`plugins/fs`, at commit `4350ca652d33e3face88d7c97a78830553545550`.

BabelLeaf vendors the Rust package, platform glue, permissions, licenses, and
the compiled `api-iife.js` required by the plugin build script instead of
retaining the full plugins-workspace submodule because the root Cargo workspace
patches `tauri-plugin-fs` to this source. The unused `guest-js` source package
and its upstream monorepo build configuration are intentionally omitted; the
application consumes the official JavaScript package through pnpm. Keeping the
compiled Rust boundary in the main repository ensures that a normal clone,
source archive, and CI checkout all compile the same reviewed bytes.

Local delta from the pinned upstream commit:

- Preserve the `permission` identifier in the forbidden-path diagnostic while
  avoiding an unused-variable warning on target configurations that compile
  out the diagnostic branch.

Retain `LICENSE_APACHE-2.0`, `LICENSE_MIT`, `LICENSE.spdx`, upstream notices,
and source headers when modifying or redistributing this directory.
