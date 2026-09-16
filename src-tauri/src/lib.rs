pub mod commands;
pub mod logging;
pub mod portable;
pub mod vault;
pub mod search;

use tauri::Manager;

pub struct LoggingState {
    _handle: logging::LoggingHandle,
}

pub fn run() {
    let config_dir = portable::get_config_dir();
    let log_dir = config_dir.join("logs");
    let log_handle = logging::init(log_dir);

    // Install panic hook to log any unexpected panics cleanly
    std::panic::set_hook(Box::new(|info| {
        let backtrace = std::backtrace::Backtrace::capture();
        tracing::error!(
            panic = %info,
            backtrace = ?backtrace,
            "Application panic captured by ScaleNote panic hook"
        );
    }));

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            app.manage(LoggingState {
                _handle: log_handle,
            });
            tracing::info!("ScaleNote backend setup complete");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::log_frontend_event,
            commands::select_vault_dialog,
            commands::open_vault,
            commands::get_vault_tree,
            commands::read_note,
            commands::write_note,
            commands::create_note,
            commands::create_folder,
            commands::rename_entry,
            commands::delete_entry,
            commands::load_snapshot,
            commands::save_snapshot,
            commands::rebuild_search_index,
            commands::search_query,
            commands::search_titles,
            commands::find_backlinks,
            commands::set_verbose_logging,
            commands::open_logs_folder,

        ])
        .run(tauri::generate_context!())
        .expect("error while running ScaleNote application");
}
