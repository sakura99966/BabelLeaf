use ::windows::core::Interface;
use tauri::WebviewWindow;
use webview2_com::Microsoft::Web::WebView2::Win32::{
    ICoreWebView2_19, COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL,
};

/// Select WebView2's supported memory target without suspending scripts or
/// network connections. The frontend only requests `Low` after the app becomes
/// inactive and restores `Normal` before handling the next user interaction.
#[tauri::command]
pub fn set_webview_memory_usage(window: WebviewWindow, low: bool) -> Result<(), String> {
    window
        .with_webview(move |platform_webview| {
            let result = (|| -> ::windows::core::Result<()> {
                let webview = unsafe { platform_webview.controller().CoreWebView2()? };
                let webview = webview.cast::<ICoreWebView2_19>()?;
                let level = COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL(if low { 1 } else { 0 });
                unsafe { webview.SetMemoryUsageTargetLevel(level) }
            })();

            if let Err(error) = result {
                // Runtime versions before 114 do not expose ICoreWebView2_19.
                // Memory targeting is an optimization, never a launch blocker.
                log::warn!("Unable to set WebView2 memory usage target: {error}");
            }
        })
        .map_err(|error| error.to_string())
}
