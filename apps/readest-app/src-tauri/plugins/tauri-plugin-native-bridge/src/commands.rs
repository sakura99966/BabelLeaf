use std::path::PathBuf;
use tauri::{command, AppHandle, Runtime, State};

use crate::models::*;
use crate::DirectoryCallbackState;
use crate::NativeBridgeExt;
use crate::Result;

#[command]
pub(crate) async fn copy_uri_to_path<R: Runtime>(
    app: AppHandle<R>,
    payload: CopyURIRequest,
) -> Result<CopyURIResponse> {
    app.native_bridge().copy_uri_to_path(payload)
}

#[command]
pub(crate) async fn save_image_to_gallery<R: Runtime>(
    app: AppHandle<R>,
    payload: SaveImageToGalleryRequest,
) -> Result<SaveImageToGalleryResponse> {
    app.native_bridge().save_image_to_gallery(payload)
}

#[command]
pub(crate) async fn use_background_audio<R: Runtime>(
    app: AppHandle<R>,
    payload: UseBackgroundAudioRequest,
) -> Result<()> {
    app.native_bridge().use_background_audio(payload)
}

#[command]
pub(crate) async fn set_text_selection_suppressed<R: Runtime>(
    app: AppHandle<R>,
    payload: SetTextSelectionSuppressedRequest,
) -> Result<()> {
    app.native_bridge().set_text_selection_suppressed(payload)
}

#[command]
pub(crate) async fn set_system_ui_visibility<R: Runtime>(
    app: AppHandle<R>,
    payload: SetSystemUIVisibilityRequest,
) -> Result<SetSystemUIVisibilityResponse> {
    app.native_bridge().set_system_ui_visibility(payload)
}

#[command]
pub(crate) async fn get_status_bar_height<R: Runtime>(
    app: AppHandle<R>,
) -> Result<GetStatusBarHeightResponse> {
    app.native_bridge().get_status_bar_height()
}

#[command]
pub(crate) async fn get_sys_fonts_list<R: Runtime>(
    app: AppHandle<R>,
) -> Result<GetSysFontsListResponse> {
    app.native_bridge().get_sys_fonts_list()
}

#[command]
pub(crate) async fn intercept_keys<R: Runtime>(
    app: AppHandle<R>,
    payload: InterceptKeysRequest,
) -> Result<()> {
    app.native_bridge().intercept_keys(payload)
}

#[command]
pub(crate) async fn lock_screen_orientation<R: Runtime>(
    app: AppHandle<R>,
    payload: LockScreenOrientationRequest,
) -> Result<()> {
    app.native_bridge().lock_screen_orientation(payload)
}

#[command]
pub(crate) async fn get_system_color_scheme<R: Runtime>(
    app: AppHandle<R>,
) -> Result<GetSystemColorSchemeResponse> {
    app.native_bridge().get_system_color_scheme()
}

#[command]
pub(crate) async fn get_safe_area_insets<R: Runtime>(
    app: AppHandle<R>,
) -> Result<GetSafeAreaInsetsResponse> {
    app.native_bridge().get_safe_area_insets()
}

#[command]
pub(crate) async fn get_screen_brightness<R: Runtime>(
    app: AppHandle<R>,
) -> Result<GetScreenBrightnessResponse> {
    app.native_bridge().get_screen_brightness()
}

#[command]
pub(crate) async fn set_screen_brightness<R: Runtime>(
    app: AppHandle<R>,
    payload: SetScreenBrightnessRequest,
) -> Result<SetScreenBrightnessResponse> {
    app.native_bridge().set_screen_brightness(payload)
}

#[command]
pub(crate) async fn get_external_sdcard_path<R: Runtime>(
    app: AppHandle<R>,
) -> Result<GetExternalSDCardPathResponse> {
    app.native_bridge().get_external_sdcard_path()
}

/// See [`ShowLookupPopoverRequest`] in `models.rs` for platform-by-
/// platform behavior. The mobile bridge dispatches into the iOS /
/// Android plugin; desktop returns `UnsupportedPlatformError` and the
/// TS layer keeps the macOS-specific path going through the
/// top-level `show_lookup_popover` Tauri command (AppKit HUD).
#[command]
pub(crate) async fn show_lookup_popover<R: Runtime>(
    app: AppHandle<R>,
    payload: ShowLookupPopoverRequest,
) -> Result<ShowLookupPopoverResponse> {
    app.native_bridge().show_lookup_popover(payload)
}

#[command]
pub(crate) async fn select_directory<R: Runtime>(
    app: AppHandle<R>,
    callback_state: State<'_, DirectoryCallbackState<R>>,
) -> Result<SelectDirectoryResponse> {
    let result = app.native_bridge().select_directory()?;

    if let Some(dir_path) = &result.path {
        let path = PathBuf::from(dir_path);

        if let Ok(callback_guard) = callback_state.callback.lock() {
            if let Some(callback) = callback_guard.as_ref() {
                callback(&app, &path);
            }
        }
    }

    Ok(result)
}

#[command]
pub(crate) async fn request_manage_storage_permission<R: Runtime>(
    app: AppHandle<R>,
) -> Result<RequestManageStoragePermissionResponse> {
    app.native_bridge().request_manage_storage_permission()
}

#[command]
pub(crate) async fn set_secure_item<R: Runtime>(
    app: AppHandle<R>,
    payload: SetSecureItemRequest,
) -> Result<SecureItemResponse> {
    app.native_bridge().set_secure_item(payload)
}

#[command]
pub(crate) async fn get_secure_item<R: Runtime>(
    app: AppHandle<R>,
    payload: GetSecureItemRequest,
) -> Result<GetSecureItemResponse> {
    app.native_bridge().get_secure_item(payload)
}

#[command]
pub(crate) async fn clear_secure_item<R: Runtime>(
    app: AppHandle<R>,
    payload: GetSecureItemRequest,
) -> Result<SecureItemResponse> {
    app.native_bridge().clear_secure_item(payload)
}

#[command]
pub(crate) async fn refresh_eink_screen<R: Runtime>(
    app: AppHandle<R>,
) -> Result<RefreshEinkScreenResponse> {
    app.native_bridge().refresh_eink_screen()
}

#[command]
pub(crate) async fn update_reading_widget<R: Runtime>(
    app: AppHandle<R>,
    payload: UpdateReadingWidgetRequest,
) -> Result<()> {
    app.native_bridge().update_reading_widget(payload)
}

/// Snapshot a region of the calling webview and return it as binary PNG
/// (`tauri::ipc::Response`, no JSON encoding) for the mesh page-curl
/// texture (#555). Platforms without a capture implementation reject,
/// which the JS side treats as "fall back to the CSS curl".
#[command]
pub(crate) async fn capture_webview_region<R: Runtime>(
    app: AppHandle<R>,
    window: tauri::WebviewWindow<R>,
    payload: CaptureWebviewRegionRequest,
) -> Result<tauri::ipc::Response> {
    let png = app
        .native_bridge()
        .capture_webview_region(&window, payload)?;
    Ok(tauri::ipc::Response::new(png))
}
