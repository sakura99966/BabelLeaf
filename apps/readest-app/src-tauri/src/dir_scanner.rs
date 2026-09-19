use std::path::Path;
use tauri::AppHandle;
use tauri_plugin_fs::FsExt;
use walkdir::WalkDir;

fn path_authorized(path: &Path, in_scope: bool) -> bool {
    in_scope
        && path.is_absolute()
        && !path.to_string_lossy().contains('\0')
        && !path
            .components()
            .any(|c| matches!(c, std::path::Component::ParentDir))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_named_bypass_and_traversal() {
        assert!(!path_authorized(Path::new("C:/Readest-private"), false));
        assert!(!path_authorized(Path::new("C:/Readest/../private"), true));
    }
}

#[derive(serde::Serialize)]
pub struct ScannedFile {
    pub path: String,
    pub size: u64,
}

#[tauri::command]
pub fn read_dir(
    app: AppHandle,
    path: String,
    recursive: bool,
    extensions: Vec<String>,
) -> Result<Vec<ScannedFile>, String> {
    let scope = app.fs_scope();
    let path_buf = std::path::PathBuf::from(&path);

    if !path_authorized(&path_buf, scope.is_allowed(&path_buf)) {
        return Err("Permission denied: Path not in filesystem scope".to_string());
    }

    let mut files = Vec::new();
    let started = std::time::Instant::now();
    let mut visited = 0usize;

    let normalized_extensions: Vec<String> =
        extensions.iter().map(|ext| ext.to_lowercase()).collect();

    if recursive {
        for entry_result in WalkDir::new(&path)
            .follow_links(false)
            .into_iter()
            .filter_entry(|entry| path_authorized(entry.path(), scope.is_allowed(entry.path())))
        {
            visited += 1;
            if visited > 100_000 || started.elapsed().as_secs() >= 5 {
                return Err("Directory scan resource limit exceeded".to_string());
            }
            match entry_result {
                Ok(entry) => {
                    if entry.depth() > 32 {
                        return Err("Directory scan depth limit exceeded".to_string());
                    }
                    if entry.file_type().is_file() {
                        if let Some(scanned_file) =
                            process_file_entry(entry.path(), &normalized_extensions)
                        {
                            files.push(scanned_file);
                        }
                    }
                }
                Err(e) => {
                    log::warn!("RUST: Skipping file due to error: {}", e);
                }
            }
        }
    } else {
        match std::fs::read_dir(&path_buf) {
            Ok(entries) => {
                for entry_result in entries {
                    visited += 1;
                    if visited > 100_000 || started.elapsed().as_secs() >= 5 {
                        return Err("Directory scan resource limit exceeded".to_string());
                    }
                    match entry_result {
                        Ok(entry) => {
                            let path = entry.path();
                            if path_authorized(&path, scope.is_allowed(&path)) && path.is_file() {
                                if let Some(scanned_file) =
                                    process_file_entry(&path, &normalized_extensions)
                                {
                                    files.push(scanned_file);
                                }
                            }
                        }
                        Err(e) => {
                            log::warn!("RUST: Skipping entry due to error: {}", e);
                        }
                    }
                }
            }
            Err(e) => {
                return Err(format!("Failed to read directory: {}", e));
            }
        }
    }

    Ok(files)
}

fn process_file_entry(path: &Path, extensions: &[String]) -> Option<ScannedFile> {
    if extensions.is_empty() || extensions.contains(&"*".to_string()) {
        let size = std::fs::metadata(path).map(|m| m.len()).unwrap_or(0);
        return Some(ScannedFile {
            path: path.to_string_lossy().to_string(),
            size,
        });
    } else if let Some(ext) = path.extension() {
        let ext_str = ext.to_string_lossy().to_lowercase();
        if extensions.contains(&ext_str) {
            let size = std::fs::metadata(path).map(|m| m.len()).unwrap_or(0);
            return Some(ScannedFile {
                path: path.to_string_lossy().to_string(),
                size,
            });
        }
    }
    None
}
