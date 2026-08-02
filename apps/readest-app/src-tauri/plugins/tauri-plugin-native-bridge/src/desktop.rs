use serde::de::DeserializeOwned;
use std::collections::HashMap;
use tauri::{plugin::PluginApi, AppHandle, Runtime};

use crate::models::*;

pub fn init<R: Runtime, C: DeserializeOwned>(
    app: &AppHandle<R>,
    _api: PluginApi<R, C>,
) -> crate::Result<NativeBridge<R>> {
    // keyring v4 split the library into `keyring-core` plus a
    // per-platform credential-store crate. The default store is a
    // process-wide global that must be installed before the first
    // `Entry::new` call. `set_default_store` is idempotent — calling
    // it again on plugin re-init just replaces the previous handle.
    // We log and swallow errors so a misconfigured keychain doesn't
    // block plugin init; downstream calls then fail with NoDefaultStore
    // and the TS layer falls back to the ephemeral store.
    install_default_keyring_store();
    Ok(NativeBridge(app.clone()))
}

#[cfg(target_os = "macos")]
fn install_default_keyring_store() {
    match apple_native_keyring_store::keychain::Store::new() {
        Ok(store) => keyring_core::set_default_store(store),
        Err(err) => eprintln!("[native-bridge] keychain store init failed: {err}"),
    }
}

#[cfg(target_os = "windows")]
fn install_default_keyring_store() {
    match windows_native_keyring_store::Store::new() {
        Ok(store) => keyring_core::set_default_store(store),
        Err(err) => eprintln!("[native-bridge] credential manager init failed: {err}"),
    }
}

#[cfg(target_os = "linux")]
fn install_default_keyring_store() {
    match dbus_secret_service_keyring_store::Store::new() {
        Ok(store) => keyring_core::set_default_store(store),
        Err(err) => eprintln!("[native-bridge] secret service init failed: {err}"),
    }
}

/// Access to the native-bridge APIs.
pub struct NativeBridge<R: Runtime>(AppHandle<R>);

impl<R: Runtime> NativeBridge<R> {
    pub fn copy_uri_to_path(&self, _payload: CopyURIRequest) -> crate::Result<CopyURIResponse> {
        Err(crate::Error::UnsupportedPlatformError)
    }

    pub fn save_image_to_gallery(
        &self,
        _payload: SaveImageToGalleryRequest,
    ) -> crate::Result<SaveImageToGalleryResponse> {
        Err(crate::Error::UnsupportedPlatformError)
    }

    pub fn use_background_audio(&self, _payload: UseBackgroundAudioRequest) -> crate::Result<()> {
        Err(crate::Error::UnsupportedPlatformError)
    }

    pub fn set_text_selection_suppressed(
        &self,
        _payload: SetTextSelectionSuppressedRequest,
    ) -> crate::Result<()> {
        Err(crate::Error::UnsupportedPlatformError)
    }

    pub fn set_system_ui_visibility(
        &self,
        _payload: SetSystemUIVisibilityRequest,
    ) -> crate::Result<SetSystemUIVisibilityResponse> {
        Err(crate::Error::UnsupportedPlatformError)
    }

    pub fn get_status_bar_height(&self) -> crate::Result<GetStatusBarHeightResponse> {
        Err(crate::Error::UnsupportedPlatformError)
    }

    pub fn get_sys_fonts_list(&self) -> crate::Result<GetSysFontsListResponse> {
        let font_collection = font_enumeration::Collection::new().unwrap();
        let mut fonts = HashMap::new();
        for font in font_collection.all() {
            if cfg!(target_os = "windows") {
                // FIXME: temporarily disable font name with style for windows
                fonts.insert(font.family_name.clone(), font.family_name.clone());
            } else {
                fonts.insert(font.font_name.clone(), font.family_name.clone());
            }
        }
        Ok(GetSysFontsListResponse { fonts, error: None })
    }

    pub fn intercept_keys(&self, _payload: InterceptKeysRequest) -> crate::Result<()> {
        Err(crate::Error::UnsupportedPlatformError)
    }

    pub fn lock_screen_orientation(
        &self,
        _payload: LockScreenOrientationRequest,
    ) -> crate::Result<()> {
        Err(crate::Error::UnsupportedPlatformError)
    }

    pub fn get_system_color_scheme(&self) -> crate::Result<GetSystemColorSchemeResponse> {
        Err(crate::Error::UnsupportedPlatformError)
    }

    pub fn get_safe_area_insets(&self) -> crate::Result<GetSafeAreaInsetsResponse> {
        Err(crate::Error::UnsupportedPlatformError)
    }

    pub fn get_screen_brightness(&self) -> crate::Result<GetScreenBrightnessResponse> {
        Err(crate::Error::UnsupportedPlatformError)
    }

    pub fn set_screen_brightness(
        &self,
        _payload: SetScreenBrightnessRequest,
    ) -> crate::Result<SetScreenBrightnessResponse> {
        Err(crate::Error::UnsupportedPlatformError)
    }

    pub fn get_external_sdcard_path(&self) -> crate::Result<GetExternalSDCardPathResponse> {
        Err(crate::Error::UnsupportedPlatformError)
    }

    /// Desktop has no mobile-style "system dictionary intent" surface;
    /// macOS's HUD is invoked through a separate top-level Tauri
    /// command (`show_lookup_popover` in `src/macos/system_dictionary.rs`),
    /// and Linux/Windows have no native target. Return
    /// UnsupportedPlatformError here so the TS layer doesn't
    /// accidentally dispatch through the mobile plugin on desktop.
    pub fn show_lookup_popover(
        &self,
        _payload: ShowLookupPopoverRequest,
    ) -> crate::Result<ShowLookupPopoverResponse> {
        Err(crate::Error::UnsupportedPlatformError)
    }

    pub fn select_directory(&self) -> crate::Result<SelectDirectoryResponse> {
        Err(crate::Error::UnsupportedPlatformError)
    }

    pub fn request_manage_storage_permission(
        &self,
    ) -> crate::Result<RequestManageStoragePermissionResponse> {
        Err(crate::Error::UnsupportedPlatformError)
    }

    // User-configured translation API credentials are stored under distinct
    // keys in the operating-system credential store.

    pub fn set_secure_item(
        &self,
        payload: SetSecureItemRequest,
    ) -> crate::Result<SecureItemResponse> {
        match keyring_entry_for(&payload.key).and_then(|e| e.set_password(&payload.value)) {
            Ok(()) => Ok(SecureItemResponse {
                success: true,
                error: None,
            }),
            Err(err) => Ok(SecureItemResponse {
                success: false,
                error: Some(err.to_string()),
            }),
        }
    }

    pub fn get_secure_item(
        &self,
        payload: GetSecureItemRequest,
    ) -> crate::Result<GetSecureItemResponse> {
        match keyring_entry_for(&payload.key).and_then(|e| e.get_password()) {
            Ok(value) => Ok(GetSecureItemResponse {
                value: Some(value),
                error: None,
            }),
            Err(keyring_core::Error::NoEntry) => Ok(GetSecureItemResponse {
                value: None,
                error: None,
            }),
            Err(err) => Ok(GetSecureItemResponse {
                value: None,
                error: Some(err.to_string()),
            }),
        }
    }

    pub fn clear_secure_item(
        &self,
        payload: GetSecureItemRequest,
    ) -> crate::Result<SecureItemResponse> {
        match keyring_entry_for(&payload.key).and_then(|e| e.delete_credential()) {
            Ok(()) | Err(keyring_core::Error::NoEntry) => Ok(SecureItemResponse {
                success: true,
                error: None,
            }),
            Err(err) => Ok(SecureItemResponse {
                success: false,
                error: Some(err.to_string()),
            }),
        }
    }

    /// E-ink panels exist only on the mobile (Android) side. Desktop has no
    /// e-ink controller, so this is unsupported here.
    pub fn refresh_eink_screen(&self) -> crate::Result<RefreshEinkScreenResponse> {
        Err(crate::Error::UnsupportedPlatformError)
    }

    pub fn update_reading_widget(&self, _payload: UpdateReadingWidgetRequest) -> crate::Result<()> {
        // Home-screen widgets are mobile-only; desktop is a no-op.
        Ok(())
    }

    /// Snapshot a region of `window`'s webview as PNG bytes for the mesh
    /// page-curl texture (#555). macOS only so far; Windows
    /// (`ICoreWebView2::CapturePreview`) and Linux
    /// (`webkit_web_view_get_snapshot`) reject until implemented, and the
    /// JS side falls back to the CSS curl.
    pub fn capture_webview_region(
        &self,
        window: &tauri::WebviewWindow<R>,
        payload: CaptureWebviewRegionRequest,
    ) -> crate::Result<Vec<u8>> {
        #[cfg(target_os = "macos")]
        {
            crate::platform::macos::capture_webview_region(window, payload)
        }
        #[cfg(not(target_os = "macos"))]
        {
            let _ = (window, payload);
            Err(crate::Error::UnsupportedPlatformError)
        }
    }
}

const KEYRING_SERVICE: &str = "BabelLeaf Safe Storage";
/// Keychain entry for a keyed secure item.
fn keyring_entry_for(key: &str) -> std::result::Result<keyring_core::Entry, keyring_core::Error> {
    keyring_core::Entry::new(KEYRING_SERVICE, key)
}
