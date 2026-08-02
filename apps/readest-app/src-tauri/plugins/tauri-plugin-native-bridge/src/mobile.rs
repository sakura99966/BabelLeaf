use serde::de::DeserializeOwned;
use tauri::{
    plugin::{PluginApi, PluginHandle},
    AppHandle, Runtime,
};

use crate::models::*;

#[cfg(target_os = "ios")]
tauri::ios_plugin_binding!(init_plugin_native_bridge);

// initializes the Kotlin or Swift plugin classes
pub fn init<R: Runtime, C: DeserializeOwned>(
    _app: &AppHandle<R>,
    api: PluginApi<R, C>,
) -> crate::Result<NativeBridge<R>> {
    #[cfg(target_os = "android")]
    let handle = api.register_android_plugin("com.readest.native_bridge", "NativeBridgePlugin")?;
    #[cfg(target_os = "ios")]
    let handle = api.register_ios_plugin(init_plugin_native_bridge)?;
    Ok(NativeBridge(handle))
}

/// Access to the native-bridge APIs.
pub struct NativeBridge<R: Runtime>(PluginHandle<R>);

impl<R: Runtime> NativeBridge<R> {
    pub fn copy_uri_to_path(&self, payload: CopyURIRequest) -> crate::Result<CopyURIResponse> {
        self.0
            .run_mobile_plugin("copy_uri_to_path", payload)
            .map_err(Into::into)
    }
}

impl<R: Runtime> NativeBridge<R> {
    pub fn save_image_to_gallery(
        &self,
        payload: SaveImageToGalleryRequest,
    ) -> crate::Result<SaveImageToGalleryResponse> {
        self.0
            .run_mobile_plugin("save_image_to_gallery", payload)
            .map_err(Into::into)
    }
}

impl<R: Runtime> NativeBridge<R> {
    pub fn use_background_audio(&self, payload: UseBackgroundAudioRequest) -> crate::Result<()> {
        self.0
            .run_mobile_plugin("use_background_audio", payload)
            .map_err(Into::into)
    }
}

impl<R: Runtime> NativeBridge<R> {
    pub fn set_text_selection_suppressed(
        &self,
        payload: SetTextSelectionSuppressedRequest,
    ) -> crate::Result<()> {
        self.0
            .run_mobile_plugin("set_text_selection_suppressed", payload)
            .map_err(Into::into)
    }
}

impl<R: Runtime> NativeBridge<R> {
    pub fn set_system_ui_visibility(
        &self,
        payload: SetSystemUIVisibilityRequest,
    ) -> crate::Result<SetSystemUIVisibilityResponse> {
        self.0
            .run_mobile_plugin("set_system_ui_visibility", payload)
            .map_err(Into::into)
    }
}

impl<R: Runtime> NativeBridge<R> {
    pub fn get_status_bar_height(&self) -> crate::Result<GetStatusBarHeightResponse> {
        self.0
            .run_mobile_plugin("get_status_bar_height", ())
            .map_err(Into::into)
    }
}

impl<R: Runtime> NativeBridge<R> {
    pub fn get_sys_fonts_list(&self) -> crate::Result<GetSysFontsListResponse> {
        self.0
            .run_mobile_plugin("get_sys_fonts_list", ())
            .map_err(Into::into)
    }
}

impl<R: Runtime> NativeBridge<R> {
    pub fn intercept_keys(&self, payload: InterceptKeysRequest) -> crate::Result<()> {
        self.0
            .run_mobile_plugin("intercept_keys", payload)
            .map_err(Into::into)
    }
}

impl<R: Runtime> NativeBridge<R> {
    pub fn lock_screen_orientation(
        &self,
        payload: LockScreenOrientationRequest,
    ) -> crate::Result<()> {
        self.0
            .run_mobile_plugin("lock_screen_orientation", payload)
            .map_err(Into::into)
    }
}

impl<R: Runtime> NativeBridge<R> {
    pub fn get_system_color_scheme(&self) -> crate::Result<GetSystemColorSchemeResponse> {
        self.0
            .run_mobile_plugin("get_system_color_scheme", ())
            .map_err(Into::into)
    }
}

impl<R: Runtime> NativeBridge<R> {
    pub fn get_safe_area_insets(&self) -> crate::Result<GetSafeAreaInsetsResponse> {
        self.0
            .run_mobile_plugin("get_safe_area_insets", ())
            .map_err(Into::into)
    }
}

impl<R: Runtime> NativeBridge<R> {
    pub fn get_screen_brightness(&self) -> crate::Result<GetScreenBrightnessResponse> {
        self.0
            .run_mobile_plugin("get_screen_brightness", ())
            .map_err(Into::into)
    }
}

impl<R: Runtime> NativeBridge<R> {
    pub fn set_screen_brightness(
        &self,
        payload: SetScreenBrightnessRequest,
    ) -> crate::Result<SetScreenBrightnessResponse> {
        self.0
            .run_mobile_plugin("set_screen_brightness", payload)
            .map_err(Into::into)
    }
}

impl<R: Runtime> NativeBridge<R> {
    pub fn get_external_sdcard_path(&self) -> crate::Result<GetExternalSDCardPathResponse> {
        self.0
            .run_mobile_plugin("get_external_sdcard_path", ())
            .map_err(Into::into)
    }
}

impl<R: Runtime> NativeBridge<R> {
    pub fn show_lookup_popover(
        &self,
        payload: ShowLookupPopoverRequest,
    ) -> crate::Result<ShowLookupPopoverResponse> {
        self.0
            .run_mobile_plugin("show_lookup_popover", payload)
            .map_err(Into::into)
    }
}

impl<R: Runtime> NativeBridge<R> {
    pub fn select_directory(&self) -> crate::Result<SelectDirectoryResponse> {
        self.0
            .run_mobile_plugin("select_directory", ())
            .map_err(Into::into)
    }
}

impl<R: Runtime> NativeBridge<R> {
    pub fn request_manage_storage_permission(
        &self,
    ) -> crate::Result<RequestManageStoragePermissionResponse> {
        self.0
            .run_mobile_plugin("request_manage_storage_permission", ())
            .map_err(Into::into)
    }
}

impl<R: Runtime> NativeBridge<R> {
    pub fn set_secure_item(
        &self,
        payload: SetSecureItemRequest,
    ) -> crate::Result<SecureItemResponse> {
        self.0
            .run_mobile_plugin("set_secure_item", payload)
            .map_err(Into::into)
    }
}

impl<R: Runtime> NativeBridge<R> {
    pub fn get_secure_item(
        &self,
        payload: GetSecureItemRequest,
    ) -> crate::Result<GetSecureItemResponse> {
        self.0
            .run_mobile_plugin("get_secure_item", payload)
            .map_err(Into::into)
    }
}

impl<R: Runtime> NativeBridge<R> {
    pub fn clear_secure_item(
        &self,
        payload: GetSecureItemRequest,
    ) -> crate::Result<SecureItemResponse> {
        self.0
            .run_mobile_plugin("clear_secure_item", payload)
            .map_err(Into::into)
    }
}

impl<R: Runtime> NativeBridge<R> {
    pub fn refresh_eink_screen(&self) -> crate::Result<RefreshEinkScreenResponse> {
        self.0
            .run_mobile_plugin("refresh_eink_screen", ())
            .map_err(Into::into)
    }
}

impl<R: Runtime> NativeBridge<R> {
    pub fn update_reading_widget(&self, payload: UpdateReadingWidgetRequest) -> crate::Result<()> {
        self.0
            .run_mobile_plugin("update_reading_widget", payload)
            .map_err(Into::into)
    }
}

impl<R: Runtime> NativeBridge<R> {
    /// Snapshot a region of the webview as PNG bytes for the mesh
    /// page-curl texture (#555). The Swift (WKWebView takeSnapshot) or
    /// Kotlin (PixelCopy) side resolves JSON, so the image arrives
    /// base64-encoded and is decoded here; the JS-facing command then
    /// returns it binary.
    pub fn capture_webview_region(
        &self,
        _window: &tauri::WebviewWindow<R>,
        payload: CaptureWebviewRegionRequest,
    ) -> crate::Result<Vec<u8>> {
        use base64::Engine as _;
        let response: CaptureWebviewRegionResponse = self
            .0
            .run_mobile_plugin("capture_webview_region", payload)?;
        base64::engine::general_purpose::STANDARD
            .decode(response.data)
            .map_err(|e| crate::Error::NativeBridgeError(format!("invalid base64 PNG: {e}")))
    }
}
