use std::path::PathBuf;

/// Detect whether this instance is running as a portable install.
///
/// Portable mode: a file named `scalenote-portable` exists next to the executable.
/// Installed mode: standard OS app-data location.
///
/// This determines where logs and settings are stored — never where the vault is.
pub fn get_config_dir() -> PathBuf {
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            if exe_dir.join("scalenote-portable").exists() {
                return exe_dir.to_path_buf();
            }
        }
    }

    // Installed: use the OS config/data dir.
    // On Linux: ~/.config/scalenote
    // On Windows: %APPDATA%/scalenote
    // On macOS: ~/Library/Application Support/scalenote
    dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("scalenote")
}
