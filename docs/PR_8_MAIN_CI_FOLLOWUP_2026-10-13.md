# PR 8 canonical-main headless-CI follow-up

PR 8 merged normally to e9f2810881dcccfd23458e6152679931d01b06fe after
all twelve PR lanes and three CodeQL analyses passed. Main then reproduced
the native browser-session timeout before any integration test executed.
This record is CI maintenance, not 0.5 implementation or a new reader release.

Failed main workflow:
https://github.com/sakura99966/BabelLeaf/actions/runs/38276206007.
Job: build_tauri_app. Source and PR trees were identical.

## Evidence and bounded correction

The retained main-tauri-failure.log reports GTK portal processes failing to
open a display, an EGL DRI3-device warning and a sixty-second Vitest browser
connection timeout with zero tests executed. This is not an assertion failure,
the earlier Cargo warning-deny problem or the repaired Windows sampler failure.

The old shell started dbus-run-session before xvfb-run. Only its child test
command received DISPLAY; services activated by the existing session bus did
not inherit that virtual display. Start Xvfb first, then the bus, keyring and
test command inside that display. Keep a 24-bit X11 screen and choose explicit
software rendering for the GPU-less test host.

Apply GDK_BACKEND=x11, LIBGL_ALWAYS_SOFTWARE=1,
WEBKIT_DISABLE_DMABUF_RENDERER=1 and WEBKIT_DISABLE_COMPOSITING_MODE=1 to
the Linux native CI job only. Preserve sandboxing, permissions, all 120 native
assertions, timeouts and failure exits. No retry wrapper or success-on-failure.

Upstream corroboration for Xvfb/WebKitGTK rendering:
https://github.com/tauri-apps/tauri/issues/15936,
https://github.com/tauri-apps/tauri/issues/9394.
Those reports support the environment choice; they are not proof that graphics
alone caused this repository's timeout. Fresh native execution is the acceptance
gate, and the initial failing main receipt must remain available.

Pin this native lane to the already-qualified ubuntu-24.04 image and label its
apt cache accordingly. GitHub warns ubuntu-latest will move to Ubuntu 26 from
October 19; that uncontrolled native-library change is not part of this fix.
Other jobs are outside this lane-specific image correction.

## Verification and closure

Add a workflow regression before editing the environment. It fails against
the original main and requires the image, software flags, Xvfb-before-D-Bus
ordering, native test command and absence of a sandbox-disabling flag.

Run the regression, full unit suite, lint, formatting and diff checks.
Use a protected follow-up PR; fresh required/native/installer/CodeQL checks
on that exact head must pass before normal merge. Qualify the exact subsequent
main, save its run identities and native receipt, then remove merged branches.

Raw evidence stays under target/pr-8. Shipping Rust/TypeScript, Windows
capabilities, package versions and v0.4.5 artifacts are unchanged. Keep the
deterministic Foliate security preparation and all release hashes/reports.
No local compiler cache rebuild is needed for this YAML/test-only correction.
