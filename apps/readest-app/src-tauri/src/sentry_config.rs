//! Local WebView information helpers retained while inherited Sentry plumbing
//! is removed from BabelLeaf.

static WEBVIEW_INFO: std::sync::OnceLock<(String, String)> = std::sync::OnceLock::new();

/// Record the WebView engine and version locally. No-op if already set.
pub fn set_webview_info(engine: String, version: String) {
    let _ = WEBVIEW_INFO.set((engine, version));
}

/// Parse the WebView engine and major version from a User-Agent string.
pub fn parse_webview_info(user_agent: &str) -> Option<(String, String)> {
    if let Some(version) = ua_major_version(user_agent, "Chrome/") {
        return Some(("Chromium".to_string(), version));
    }
    if let Some(version) = ua_major_version(user_agent, "Version/") {
        return Some(("WebKit".to_string(), version));
    }
    None
}

fn ua_major_version(user_agent: &str, token: &str) -> Option<String> {
    let rest = &user_agent[user_agent.find(token)? + token.len()..];
    let major: String = rest.chars().take_while(|c| c.is_ascii_digit()).collect();
    (!major.is_empty()).then_some(major)
}

/// Compatibility ABI for the inherited iOS bootstrap. BabelLeaf never exposes
/// a Sentry DSN, even if the build environment contains one.
#[cfg(target_os = "ios")]
#[no_mangle]
pub extern "C" fn readest_sentry_dsn() -> *const std::os::raw::c_char {
    std::ptr::null()
}

#[cfg(test)]
mod tests {
    use super::parse_webview_info;

    #[test]
    fn parses_chromium_webview_version() {
        let user_agent = "Mozilla/5.0 Version/4.0 Chrome/140.0.0.0 Mobile Safari/537.36";
        assert_eq!(
            parse_webview_info(user_agent),
            Some(("Chromium".to_string(), "140".to_string()))
        );
    }

    #[test]
    fn parses_webkit_webview_version() {
        let user_agent = "Mozilla/5.0 Version/17.4 Mobile/15E148 Safari/604.1";
        assert_eq!(
            parse_webview_info(user_agent),
            Some(("WebKit".to_string(), "17".to_string()))
        );
    }

    #[test]
    fn rejects_unrecognized_user_agents() {
        assert_eq!(parse_webview_info("curl/8.0"), None);
        assert_eq!(parse_webview_info(""), None);
    }
}
