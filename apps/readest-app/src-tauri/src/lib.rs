#[cfg(target_os = "macos")]
#[macro_use]
extern crate cocoa;

#[cfg(target_os = "macos")]
#[macro_use]
extern crate objc;

#[cfg(target_os = "windows")]
mod windows;

#[cfg(target_os = "android")]
mod android;

use tauri::utils::config::BackgroundThrottlingPolicy;
#[cfg(target_os = "macos")]
use tauri::TitleBarStyle;

use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use tauri_plugin_fs::FsExt;

#[cfg(desktop)]
use tauri::{Listener, Url};
mod dir_scanner;
mod epub_parser;
#[cfg(target_os = "macos")]
mod macos;
mod mobi_parser;
mod parser_common;
mod range_file;
#[cfg(all(desktop, not(feature = "webdriver")))]
mod window_state;
#[cfg(target_os = "windows")]
use tauri::{command, Emitter, WebviewUrl, WebviewWindowBuilder};
#[cfg(target_os = "android")]
use tauri_plugin_native_bridge::register_select_directory_callback;

#[cfg(any(desktop, target_os = "ios"))]
fn allow_file_in_scopes(app: &AppHandle, files: Vec<PathBuf>) {
    let fs_scope = app.fs_scope();
    let asset_protocol_scope = app.asset_protocol_scope();
    for file in &files {
        if let Err(e) = fs_scope.allow_file(file) {
            log::error!("Failed to allow file in fs_scope: {e}");
        } else {
            log::debug!("Allowed file in fs_scope: {file:?}");
        }
        if let Err(e) = asset_protocol_scope.allow_file(file) {
            log::error!("Failed to allow file in asset_protocol_scope: {e}");
        } else {
            log::debug!("Allowed file in asset_protocol_scope: {file:?}");
        }
    }
}
fn allow_dir_in_scopes(app: &AppHandle, dir: &PathBuf) {
    let fs_scope = app.fs_scope();
    let asset_protocol_scope = app.asset_protocol_scope();
    if let Err(e) = fs_scope.allow_directory(dir, true) {
        log::error!("Failed to allow directory in fs_scope: {e}");
    } else {
        log::info!("Allowed directory in fs_scope: {dir:?}");
    }
    if let Err(e) = asset_protocol_scope.allow_directory(dir, true) {
        log::error!("Failed to allow directory in asset_protocol_scope: {e}");
    } else {
        log::info!("Allowed directory in asset_protocol_scope: {dir:?}");
    }
}

/// Frontend-callable shim around [`allow_file_in_scopes`] /
/// [`allow_dir_in_scopes`]. Used after dialog-based file/folder pickers
/// because the Tauri `dialog` plugin only auto-grants `fs_scope`, not
/// `asset_protocol_scope` — and our importer relies on the asset
/// protocol (`RemoteFile`) to read user-selected files. Without this,
/// importing a book from e.g. `~/Downloads/...` fails with
/// "asset protocol not configured to allow the path".
///
/// Granted scopes are persisted across app restarts thanks to
/// `tauri_plugin_persisted_scope`, so re-picking the same file isn't
/// required after the first allow call.
///
/// Security:
///
///   - On desktop, this command refuses to extend `asset_protocol_scope`
///     for any path that is not already allowed in `fs_scope`. The
///     `fs_scope` there is populated only by the Tauri `dialog` plugin
///     (when the user picks through the OS picker) or by
///     `tauri_plugin_persisted_scope` (which restores prior dialog
///     grants on startup). That gate constrains the command to
///     user-selected paths only — otherwise any frontend code
///     (including a future XSS via book content, OPDS HTML, dictionary
///     lookups, or a compromised dependency) could invoke it with an
///     arbitrary path like `/` or `~/.ssh` and gain persistent read
///     access to the entire user home directory via the asset
///     protocol.
///
///   - On iOS, the `fs_scope` gate is intentionally skipped: the iOS
///     directory/file picker (`UIDocumentPickerViewController`) does
///     not flow through Tauri's dialog plugin, and we keep the only
///     persistent record of user-authorised paths inside the
///     native-bridge plugin's security-scoped bookmark store
///     (`FolderBookmarkStore` in NativeBridgePlugin.swift). The
///     OS sandbox itself is the access-control boundary: the process
///     can only read paths for which it holds a security-scoped
///     resource (granted by the system picker, persisted via
///     bookmark). Widening Tauri's `fs_scope`/`asset_protocol_scope`
///     to those same paths cannot escalate access beyond what the OS
///     already grants — it just lets the fs / dir-scanner layers
///     route reads through the path the WebView gave them. The
///     frontend layer also keeps the list of folder roots in
///     `settings.externalLibraryFolders` and re-issues this call on
///     every launch, so the in-memory scope set stays in sync with
///     the user's persisted intent.
#[command]
fn allow_paths_in_scopes(_app: AppHandle, _paths: Vec<String>, _is_directory: bool) {
    #[cfg(desktop)]
    {
        let fs_scope = _app.fs_scope();
        for raw in _paths {
            if raw.is_empty() {
                continue;
            }
            let path = PathBuf::from(&raw);
            if !fs_scope.is_allowed(&path) {
                log::warn!("allow_paths_in_scopes refused (path not in fs_scope): {path:?}");
                continue;
            }
            if _is_directory {
                allow_dir_in_scopes(&_app, &path);
            } else {
                allow_file_in_scopes(&_app, vec![path]);
            }
        }
    }
    #[cfg(target_os = "ios")]
    {
        // The iOS picker hands us a security-scoped URL whose POSIX
        // path lives outside any of our static fs_scope globs (e.g.
        // File Provider Storage, iCloud Drive, third-party providers).
        // Without explicitly widening fs_scope/asset_protocol_scope
        // here, both `dir_scanner::read_dir` and the fs plugin's
        // `readDir` would reject the path even though the OS sandbox
        // already grants us access via the held security-scoped
        // resource. See the security comment above.
        for raw in _paths {
            if raw.is_empty() {
                continue;
            }
            let path = PathBuf::from(&raw);
            if _is_directory {
                allow_dir_in_scopes(&_app, &path);
            } else {
                allow_file_in_scopes(&_app, vec![path]);
            }
        }
    }
    #[cfg(target_os = "android")]
    {
        // Android picker already routes through register_select_directory_callback
        // for directories; files go through SAF / content-URIs and don't use
        // asset_protocol_scope. Nothing to do here.
    }
}

#[cfg(desktop)]
fn get_files_from_argv(argv: Vec<String>) -> Vec<PathBuf> {
    let mut files = Vec::new();
    // NOTICE: `args` may include URL protocol (`your-app-protocol://`)
    // or arguments (`--`) if your app supports them.
    // files may also be passed as `file://path/to/file`
    for (_, maybe_file) in argv.iter().enumerate().skip(1) {
        // skip flags like -f or --flag
        if maybe_file.starts_with("-") {
            continue;
        }
        // handle `file://` path urls and skip other urls
        if let Ok(url) = Url::parse(maybe_file) {
            if let Ok(path) = url.to_file_path() {
                files.push(path);
            } else {
                files.push(PathBuf::from(maybe_file))
            }
        } else {
            files.push(PathBuf::from(maybe_file))
        }
    }
    files
}

#[cfg(desktop)]
fn set_window_open_with_files(app: &AppHandle, files: Vec<PathBuf>) {
    let files = files
        .into_iter()
        .map(|f| {
            let file = f
                .to_string_lossy()
                .replace("\\", "\\\\")
                .replace("\"", "\\\"");
            format!("\"{file}\"",)
        })
        .collect::<Vec<_>>()
        .join(",");
    let window = app.get_webview_window("main").unwrap();
    let script = format!("window.OPEN_WITH_FILES = [{files}];");
    if let Err(e) = window.eval(&script) {
        eprintln!("Failed to set open files variable: {e}");
    }
}

#[tauri::command]
fn get_executable_dir() -> String {
    std::env::current_exe()
        .ok()
        .and_then(|path| path.parent().map(|p| p.to_path_buf()))
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default()
}

#[derive(Clone, serde::Serialize)]
#[allow(dead_code)]
struct SingleInstancePayload {
    args: Vec<String>,
    cwd: String,
}

#[cfg(feature = "webdriver")]
fn webdriver_port() -> u16 {
    std::env::var("TAURI_WEBDRIVER_PORT")
        .ok()
        .and_then(|value| value.parse::<u16>().ok())
        .unwrap_or(tauri_plugin_webdriver::DEFAULT_PORT)
}

#[cfg(feature = "webdriver")]
fn publish_webdriver_stage(stage: &str) -> std::io::Result<()> {
    std::fs::write(
        std::env::temp_dir().join(format!("babelleaf-webdriver-{}.stage", webdriver_port())),
        stage,
    )
}

#[cfg(feature = "webdriver")]
fn publish_webdriver_pid() -> std::io::Result<()> {
    let process_id = std::process::id().to_string();
    let fallback_pid_file =
        std::env::temp_dir().join(format!("babelleaf-webdriver-{}.pid", webdriver_port()));
    std::fs::write(&fallback_pid_file, &process_id)?;

    if let Ok(pid_file) = std::env::var("BABELLEAF_WEBDRIVER_PID_FILE") {
        let pid_file = PathBuf::from(pid_file);
        if pid_file != fallback_pid_file {
            std::fs::write(pid_file, &process_id)?;
        }
    }
    Ok(())
}

#[cfg(feature = "webdriver")]
fn start_webdriver_exit_watcher(app_handle: tauri::AppHandle) -> std::io::Result<()> {
    let Some(exit_file) = std::env::var_os("BABELLEAF_WEBDRIVER_EXIT_FILE") else {
        return Ok(());
    };
    let exit_file = PathBuf::from(exit_file);
    std::thread::Builder::new()
        .name("babelleaf-webdriver-exit".into())
        .spawn(move || loop {
            if exit_file.is_file() {
                app_handle.exit(0);
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(100));
        })
        .map(|_| ())
}

#[cfg(desktop)]
fn portable_runtime_directory() -> Option<PathBuf> {
    let executable = std::env::current_exe().ok()?;
    let directory = executable.parent()?.to_path_buf();
    directory
        .join("settings.json")
        .is_file()
        .then_some(directory)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(desktop)]
    let portable_runtime_directory = portable_runtime_directory();
    #[cfg(not(desktop))]
    let portable_runtime_directory: Option<PathBuf> = None;
    let is_portable_runtime = portable_runtime_directory.is_some();
    let builder = tauri::Builder::default();

    // The WebDriver build runs inside an isolated test profile. The log plugin
    // resolves its default target through the OS profile APIs, which are not
    // redirectable on Windows and are read-only in the test sandbox. Keep the
    // production logger enabled while omitting it from the test-only binary.
    #[cfg(not(feature = "webdriver"))]
    let builder = {
        let logger = tauri_plugin_log::Builder::new()
            .level(log::LevelFilter::Info)
            .level_for("tracing", log::LevelFilter::Warn)
            .level_for("tantivy", log::LevelFilter::Warn);
        #[cfg(desktop)]
        let logger = if let Some(directory) = portable_runtime_directory.as_ref() {
            use tauri_plugin_log::{Target, TargetKind};
            logger.targets([
                Target::new(TargetKind::Stdout),
                Target::new(TargetKind::Folder {
                    path: directory.join("logs"),
                    file_name: None,
                }),
            ])
        } else {
            logger
        };
        builder
            .plugin(logger.build())
            .plugin(tauri_plugin_process::init())
    };

    #[cfg(feature = "webdriver")]
    let builder = builder.plugin(tauri_plugin_process::init());

    let builder = builder
        .invoke_handler(tauri::generate_handler![
            get_executable_dir,
            allow_paths_in_scopes,
            #[cfg(target_os = "windows")]
            windows::set_webview_memory_usage,
            dir_scanner::read_dir,
            epub_parser::parse_epub_metadata,
            epub_parser::extract_epub_cover_full,
            epub_parser::parse_epub_full,
            mobi_parser::parse_mobi_metadata,
            mobi_parser::extract_mobi_cover_full,
            #[cfg(target_os = "macos")]
            macos::traffic_light::set_traffic_lights,
            #[cfg(target_os = "macos")]
            macos::system_dictionary::show_lookup_popover,
        ])
        .plugin(tauri_plugin_fs::init());

    // Portable mode stores its library, settings, cache, logs and WebView
    // profile beside the executable. Do not load Tauri's system AppData-backed
    // scope state in that mode; the executable directory is granted on every
    // launch below, so local portable content remains readable.
    #[cfg(desktop)]
    let builder = if is_portable_runtime {
        builder
    } else {
        builder.plugin(tauri_plugin_persisted_scope::init())
    };
    #[cfg(not(desktop))]
    let builder = builder.plugin(tauri_plugin_persisted_scope::init());

    let builder = builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_device_info::init())
        .plugin(tauri_plugin_turso::init())
        .plugin(tauri_plugin_native_bridge::init())
        .plugin(tauri_plugin_native_tts::init())
        // Serves local file byte-ranges to `RemoteFile` via `?path=&start=&end=`
        // (range-in-URL, not a `Range` header) so Android's WebView doesn't
        // re-apply the offset. Scope-gated by `asset_protocol_scope`.
        .register_asynchronous_uri_scheme_protocol(range_file::SCHEME, range_file::handle);

    // Native share UI is only used on Apple/mobile targets. Windows and Linux
    // deliberately use the Web Share/clipboard fallback, so registering the
    // plugin there adds launch state without exposing a usable code path.
    #[cfg(any(target_os = "macos", target_os = "ios", target_os = "android"))]
    let builder = builder.plugin(tauri_plugin_sharekit::init());

    // This plugin exists solely to attach its Android startup initializer; its
    // Rust implementation is otherwise a no-op on every platform.
    #[cfg(target_os = "android")]
    let builder = builder.plugin(tauri_plugin_webview_upgrade::init());

    #[cfg(desktop)]
    let builder = builder.plugin(
        tauri_plugin_single_instance::Builder::new()
            .callback(move |app, argv, cwd| {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.set_focus();
                }
                let files = get_files_from_argv(argv.clone());
                if !files.is_empty() {
                    allow_file_in_scopes(app, files.clone());
                }
                app.emit("single-instance", SingleInstancePayload { args: argv, cwd })
                    .unwrap();
            })
            .dbus_id("io.github.sakura99966.babelleaf".to_owned())
            .build(),
    );

    let builder = builder.plugin(tauri_plugin_deep_link::init());

    // Strip invalid geometry from the saved window state before the
    // window-state plugin loads it, so a bad `.window-state.json` (e.g. the
    // Windows minimized `-32000` sentinel) can't crash WebView2 on launch.
    // See https://github.com/readest/readest/issues/4398.
    #[cfg(all(desktop, not(feature = "webdriver")))]
    let builder = if is_portable_runtime {
        builder
    } else {
        builder
            .plugin(window_state::init())
            .plugin(tauri_plugin_window_state::Builder::default().build())
    };

    #[cfg(target_os = "macos")]
    let builder = builder.plugin(macos::traffic_light::init());

    #[cfg(any(target_os = "ios", target_os = "android"))]
    let builder = builder.plugin(tauri_plugin_haptics::init());

    #[cfg(any(target_os = "ios", target_os = "android"))]
    let builder = builder.plugin(tauri_plugin_biometric::init());

    #[cfg(feature = "webdriver")]
    let builder = builder.plugin(tauri_plugin_webdriver::init());

    builder
        .setup(move |#[allow(unused_variables)] app| {
            #[cfg(feature = "webdriver")]
            publish_webdriver_stage("app-setup-started")?;
            // When running with the webdriver feature (E2E/integration tests),
            // grant all default permissions to remote URLs (http://127.0.0.1:*)
            // so that Vitest browser-mode tests can call plugin commands.
            #[cfg(feature = "webdriver")]
            {
                use tauri::Manager;
                app.add_capability(include_str!("../capabilities-extra/webdriver.json"))?;
                start_webdriver_exit_watcher(app.handle().clone())?;
                publish_webdriver_stage("capability-added")?;
            }
            #[cfg(desktop)]
            {
                let files = get_files_from_argv(std::env::args().collect());
                if !files.is_empty() {
                    let app_handle = app.handle().clone();
                    allow_file_in_scopes(&app_handle, files.clone());
                    app.listen("window-ready", move |_| {
                        println!("Window is ready, proceeding to handle files.");
                        set_window_open_with_files(&app_handle, files.clone());
                    });
                }
            }

            #[cfg(desktop)]
            {
                allow_dir_in_scopes(app.handle(), &PathBuf::from(get_executable_dir()));
                #[cfg(feature = "webdriver")]
                publish_webdriver_stage("executable-scope-added")?;
            }

            #[cfg(target_os = "android")]
            register_select_directory_callback(app.handle(), move |app, path| {
                allow_dir_in_scopes(app, path);
            });

            #[cfg(all(
                any(target_os = "windows", target_os = "linux"),
                not(feature = "webdriver")
            ))]
            {
                if !is_portable_runtime {
                    use tauri_plugin_deep_link::DeepLinkExt;
                    let _ = app.deep_link().register_all();
                }
            }

            #[cfg(desktop)]
            {
                app.handle().plugin(tauri_plugin_cli::init())?;
                #[cfg(feature = "webdriver")]
                publish_webdriver_stage("cli-plugin-initialized")?;
            }

            // Check for e-ink device on Android before building the window
            #[cfg(target_os = "android")]
            let is_eink = android::is_eink_device();
            #[cfg(not(target_os = "android"))]
            let is_eink = false;

            #[cfg(desktop)]
            let cli_access = true;
            #[cfg(not(desktop))]
            let cli_access = false;

            #[cfg(target_os = "linux")]
            let is_appimage = std::env::var("APPIMAGE").is_ok()
                || std::env::current_exe()
                    .map(|path| path.to_string_lossy().contains("/tmp/.mount_"))
                    .unwrap_or(false);
            #[cfg(not(target_os = "linux"))]
            let is_appimage = false;

            let init_script = format!(
                r#"
                    if ({is_eink}) window.__READEST_IS_EINK = true;
                    if ({cli_access}) window.__READEST_CLI_ACCESS = true;
                    if ({is_appimage}) window.__READEST_IS_APPIMAGE = true;
                    window.addEventListener('DOMContentLoaded', function() {{
                        document.documentElement.classList.add('edge-to-edge');
                        const isTauriLocal = window.location.protocol === 'tauri:' ||
                                            window.location.protocol === 'about:' ||
                                            window.location.hostname === 'tauri.localhost';
                        const needsSafeArea = !isTauriLocal;
                        if (needsSafeArea && !document.getElementById('safe-area-style')) {{
                            const style = document.createElement('style');
                            style.id = 'safe-area-style';
                            style.textContent = `
                                body {{
                                    padding-top: env(safe-area-inset-top) !important;
                                    padding-bottom: env(safe-area-inset-bottom) !important;
                                    padding-left: env(safe-area-inset-left) !important;
                                    padding-right: env(safe-area-inset-right) !important;
                                }}
                            `;
                            document.head.appendChild(style);
                        }}
                    }});
                "#,
                is_eink = is_eink,
                cli_access = cli_access,
                is_appimage = is_appimage
            );

            // Keep hidden/background WebViews from consuming an unrestricted
            // renderer budget on platforms that support this policy. Foreground
            // reading remains unaffected, while the launch-hidden window and
            // future auxiliary views may yield CPU/memory when not visible.
            let win_builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::default())
                .background_throttling(BackgroundThrottlingPolicy::Throttle)
                .background_color(if is_eink {
                    tauri::window::Color(255, 255, 255, 255)
                } else {
                    tauri::window::Color(50, 49, 48, 255)
                })
                .initialization_script(&init_script);

            // WebView2 otherwise writes its browser profile to LocalAppData
            // even when the JavaScript data resolver is in portable mode.
            #[cfg(target_os = "windows")]
            let win_builder = if let Some(directory) = portable_runtime_directory.as_ref() {
                win_builder.data_directory(directory.join("EBWebView"))
            } else {
                #[cfg(feature = "webdriver")]
                {
                    match std::env::var_os("BABELLEAF_WEBDRIVER_WEBVIEW_DATA_DIR") {
                        Some(directory) => win_builder.data_directory(PathBuf::from(directory)),
                        None => win_builder,
                    }
                }
                #[cfg(not(feature = "webdriver"))]
                {
                    win_builder
                }
            };

            // Test-only marker for deterministic native file-import workflows.
            // The JavaScript side also requires a compile-time E2E flag, so
            // neither condition can be enabled in a production package by page
            // content or a runtime environment variable.
            #[cfg(feature = "webdriver")]
            let win_builder = win_builder.initialization_script(
                r#"
                (() => {
                    Object.defineProperty(window, '__BABELLEAF_WEBDRIVER__', {
                        value: true,
                        writable: false,
                        configurable: false
                    });
                    const failures = [];
                    Object.defineProperty(window, '__BABELLEAF_WEBDRIVER_INVOKE_FAILURES__', {
                        value: failures,
                        writable: false,
                        configurable: false
                    });
                    const traffic = [];
                    Object.defineProperty(window, '__BABELLEAF_WEBDRIVER_TRAFFIC__', {
                        value: traffic,
                        writable: false,
                        configurable: false
                    });
                    const recordTraffic = (kind, target) => {
                        traffic.push({ kind, target: String(target) });
                    };
                    const originalFetch = window.fetch.bind(window);
                    window.fetch = (...args) => {
                        recordTraffic('fetch', args[0] instanceof Request ? args[0].url : args[0]);
                        return originalFetch(...args);
                    };
                    const originalXhrOpen = XMLHttpRequest.prototype.open;
                    XMLHttpRequest.prototype.open = function(method, url, ...args) {
                        recordTraffic('xhr', url);
                        return originalXhrOpen.call(this, method, url, ...args);
                    };
                    const OriginalWebSocket = window.WebSocket;
                    window.WebSocket = class TrackingWebSocket extends OriginalWebSocket {
                        constructor(url, protocols) {
                            recordTraffic('websocket', url);
                            super(url, protocols);
                        }
                    };
                    if (window.EventSource) {
                        const OriginalEventSource = window.EventSource;
                        window.EventSource = class TrackingEventSource extends OriginalEventSource {
                            constructor(url, options) {
                                recordTraffic('event-source', url);
                                super(url, options);
                            }
                        };
                    }
                    const internals = window.__TAURI_INTERNALS__;
                    if (!internals || typeof internals.invoke !== 'function') return;
                    const originalInvoke = internals.invoke.bind(internals);
                    internals.invoke = async (command, args, options) => {
                        if (String(command).startsWith('plugin:http|')) {
                            recordTraffic('tauri-http', command);
                        }
                        try {
                            return await originalInvoke(command, args, options);
                        } catch (error) {
                            failures.push({ command, error: String(error) });
                            throw error;
                        }
                    };
                })();
                "#,
            );

            // Keep the reader's idle WebView2 process tree bounded on Windows.
            // WebView2 background update/telemetry channels are disabled;
            // BabelLeaf's explicit provider requests use the application HTTP
            // boundary and are unaffected by these Chromium background flags.
            // V8's size policy trades peak throughput for a smaller young
            // generation. A single raster worker bounds compositor thread
            // stacks without disabling hardware acceleration or WebGL, which
            // the page-curl renderer requires. Reader, translation and comic
            // workload gates cover the resulting execution path before release.
            #[cfg(target_os = "windows")]
            let win_builder = win_builder.additional_browser_args(
                "--disable-background-networking --disable-component-update \
                 --disable-domain-reliability \
                 --num-raster-threads=1 \
                 --js-flags=--optimize-for-size \
                 --disable-features=msWebOOUI,msPdfOOUI",
            );

            #[cfg(target_os = "macos")]
            let win_builder = win_builder.inner_size(1280.0, 800.0).resizable(true);
            #[cfg(all(not(target_os = "macos"), desktop))]
            let win_builder = win_builder.inner_size(800.0, 600.0).resizable(true);
            #[cfg(desktop)]
            let win_builder = win_builder.min_inner_size(480.0, 360.0);

            #[cfg(target_os = "macos")]
            let win_builder = win_builder
                .decorations(true)
                .title_bar_style(TitleBarStyle::Overlay)
                .title("");

            #[cfg(all(not(target_os = "macos"), desktop))]
            let win_builder = {
                let mut builder = win_builder
                    .decorations(false)
                    .visible(false)
                    .shadow(true)
                    .title("BabelLeaf");

                #[cfg(target_os = "windows")]
                {
                    builder = builder.transparent(false);
                }
                #[cfg(target_os = "linux")]
                {
                    // Keep the window opaque on Linux. A transparent WebKitGTK
                    // window (previously used to draw rounded corners, #1982)
                    // composites as fully transparent whenever its web process is
                    // too busy to repaint damaged regions (e.g. during a library
                    // backup), so the app "turns invisible" on any interaction
                    // (#3682). An opaque window instead retains its last painted
                    // frame, at the cost of square corners.
                    builder = builder.transparent(false);
                }

                builder
            };

            #[cfg(not(target_os = "macos"))]
            {
                #[cfg(feature = "webdriver")]
                publish_webdriver_stage("window-build-started")?;
                let _window = win_builder.build()?;
                #[cfg(feature = "webdriver")]
                {
                    publish_webdriver_stage("window-built")?;
                    publish_webdriver_pid()?;
                }
            }
            // let win = win_builder.build().unwrap();
            // win.open_devtools();

            #[cfg(target_os = "macos")]
            {
                let window = win_builder.build()?;
                #[cfg(feature = "webdriver")]
                publish_webdriver_pid()?;
                // On macOS, closing a window (via Cmd+W or the red traffic light)
                // should not quit the app — only Cmd+Q should — and normally hides
                // instead of minimizing (#5240): the app keeps running in the dock
                // and the window is restored when the user reopens the app from the
                // dock. On Tahoe the hide is defensive against the `orderOut:`
                // phantom-window regression (#4875); see
                // `macos::window::hide_main_window` for the fullscreen-failure
                // fallback.
                let window_for_close = window.clone();
                window.on_window_event(move |event| match event {
                    tauri::WindowEvent::CloseRequested { api, .. } => {
                        api.prevent_close();
                        macos::window::hide_main_window(&window_for_close);
                    }
                    // Safety net for JS-side `show()` callers (e.g.
                    // `ensureMainLibraryWindow` in src/utils/nav.ts re-shows a hidden
                    // main window from a reader window without a dock Reopen): the
                    // window can only become key after it is back on screen, so any
                    // pending defensively-zeroed frame must be restored by now.
                    tauri::WindowEvent::Focused(true) => {
                        macos::window::restore_main_window_frame(&window_for_close);
                    }
                    _ => {}
                });
            }

            #[cfg(target_os = "macos")]
            macos::menu::setup_macos_menu(app.handle())?;

            app.handle().emit("window-ready", ()).unwrap();

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(
            #[allow(unused_variables)]
            |app_handle, event| {
                #[cfg(target_os = "macos")]
                match event {
                    tauri::RunEvent::Opened { urls } => {
                        let files = urls
                            .into_iter()
                            .filter_map(|url| url.to_file_path().ok())
                            .collect::<Vec<_>>();

                        let app_handler_clone = app_handle.clone();
                        allow_file_in_scopes(app_handle, files.clone());
                        app_handle.listen("window-ready", move |_| {
                            println!("Window is ready, proceeding to handle files.");
                            set_window_open_with_files(&app_handler_clone, files.clone());
                        });
                    }
                    // When the user reopens the app from the dock after closing all
                    // windows, re-show the main window instead of leaving the dock
                    // icon inert.
                    tauri::RunEvent::Reopen {
                        has_visible_windows: false,
                        ..
                    } => {
                        if let Some(window) = app_handle.get_webview_window("main") {
                            // Undo a pending Tahoe defensive hide (zeroed frame) before
                            // showing so the window reappears at its real position and
                            // size. No-op when the window was hidden plainly.
                            macos::window::restore_main_window_frame(&window);
                            let _ = window.show();
                            let _ = window.set_focus();
                            let _ = window.unminimize();
                        }
                    }
                    // A programmatic exit emits ExitRequested before the window-state
                    // plugin performs its final save. Restore any zeroed frame while
                    // the window is still hidden so live geometry remains valid.
                    tauri::RunEvent::ExitRequested { .. } => {
                        if let Some(window) = app_handle.get_webview_window("main") {
                            macos::window::restore_main_window_frame(&window);
                        }
                    }
                    _ => {}
                }
            },
        );
}
