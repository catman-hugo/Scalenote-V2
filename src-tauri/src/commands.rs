use std::collections::HashMap;
use std::path::Path;
use tauri_plugin_dialog::DialogExt;
use crate::vault::{self, FileTreeEntry, FolderEntry, NoteFile, VaultState};
use crate::portable;
use crate::search;

use rusqlite::{params, Connection};
use sync_engine::snapshot as snapshot_mod;
use base64::Engine;
use base64::engine::general_purpose::STANDARD as BASE64;
use yrs::{Doc, Update};
use yrs::Transact;
use yrs::updates::decoder::Decode;

fn validate_safe_id(id: &str) -> Result<(), String> {
    if id.is_empty() {
        return Err("ID cannot be empty".into());
    }
    if id.contains('/') || id.contains('\\') || id.contains("..") {
        return Err("Invalid ID: contains path traversal characters".into());
    }
    Ok(())
}

#[tauri::command]
pub fn log_frontend_event(
    level: String,
    message: String,
    fields: HashMap<String, serde_json::Value>,
) -> Result<(), String> {
    let fields_str = serde_json::to_string(&fields).unwrap_or_else(|_| "{}".to_string());
    match level.to_lowercase().as_str() {
        "error" => tracing::error!(source = "frontend", fields = %fields_str, "{}", message),
        "warn" => tracing::warn!(source = "frontend", fields = %fields_str, "{}", message),
        "info" => tracing::info!(source = "frontend", fields = %fields_str, "{}", message),
        "debug" => tracing::debug!(source = "frontend", fields = %fields_str, "{}", message),
        "trace" => tracing::trace!(source = "frontend", fields = %fields_str, "{}", message),
        _ => tracing::info!(source = "frontend", level = %level, fields = %fields_str, "{}", message),
    }
    Ok(())
}

#[tauri::command]
pub async fn select_vault_dialog(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog().file().pick_folder(move |folder| {
        let _ = tx.send(folder.map(|p| p.to_string()));
    });
    rx.await.map_err(|e| e.to_string())
}

#[tauri::command]
pub fn open_vault(vault_path: String) -> Result<VaultState, String> {
    vault::init_and_open_vault(&vault_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_vault_tree(vault_path: String) -> Result<Vec<FileTreeEntry>, String> {
    let root = vault::canonicalize_vault_root(Path::new(&vault_path)).map_err(|e| e.to_string())?;
    vault::scan_tree(&root, &root).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn read_note(vault_path: String, rel_path: String) -> Result<String, String> {
    let root = vault::canonicalize_vault_root(Path::new(&vault_path)).map_err(|e| e.to_string())?;
    vault::read_note(&root, &rel_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_note(
    vault_path: String,
    rel_path: String,
    content: String,
) -> Result<NoteFile, String> {
    let root = vault::canonicalize_vault_root(Path::new(&vault_path)).map_err(|e| e.to_string())?;
    vault::write_note(&root, &rel_path, &content).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_note(
    vault_path: String,
    parent_folder: String,
    name: String,
) -> Result<NoteFile, String> {
    let root = vault::canonicalize_vault_root(Path::new(&vault_path)).map_err(|e| e.to_string())?;
    vault::create_note(&root, &parent_folder, &name).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_folder(
    vault_path: String,
    parent_folder: String,
    name: String,
) -> Result<FolderEntry, String> {
    let root = vault::canonicalize_vault_root(Path::new(&vault_path)).map_err(|e| e.to_string())?;
    vault::create_folder(&root, &parent_folder, &name).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn rename_entry(
    vault_path: String,
    old_rel_path: String,
    new_name: String,
) -> Result<String, String> {
    let root = vault::canonicalize_vault_root(Path::new(&vault_path)).map_err(|e| e.to_string())?;
    vault::rename_entry(&root, &old_rel_path, &new_name).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_entry(vault_path: String, rel_path: String) -> Result<(), String> {
    let root = vault::canonicalize_vault_root(Path::new(&vault_path)).map_err(|e| e.to_string())?;
    vault::delete_entry(&root, &rel_path).map_err(|e| e.to_string())
}

// ---------- Search commands ----------
#[tauri::command]
pub fn rebuild_search_index(vault_path: String) -> Result<(), String> {
    let root = vault::canonicalize_vault_root(Path::new(&vault_path)).map_err(|e| e.to_string())?;
    search::rebuild_index(&root).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn search_query(vault_path: String, query: String) -> Result<Vec<String>, String> {
    let root = vault::canonicalize_vault_root(Path::new(&vault_path)).map_err(|e| e.to_string())?;
    search::search_notes(&root, &query).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn load_snapshot(vault_path: String, note_id: String) -> Result<(String, String), String> {
    validate_safe_id(&note_id)?;
    let root = vault::canonicalize_vault_root(Path::new(&vault_path)).map_err(|e| e.to_string())?;
    let crdt_dir = root.join(".scalenote").join("crdt");

    fn find_note_markdown(vault_root: &Path, target_id: &str) -> std::io::Result<Option<String>> {
        for entry in std::fs::read_dir(vault_root)? {
            let entry = entry?;
            let path = entry.path();
            if path.is_dir() {
                let name = entry.file_name().to_string_lossy().to_string();
                if !name.starts_with('.') {
                    if let Some(content) = find_note_markdown(&path, target_id)? {
                        return Ok(Some(content));
                    }
                }
            } else if let Some(ext) = path.extension() {
                if ext == "md" {
                    let data = std::fs::read_to_string(&path)?;
                    if data.contains(&format!("id: {}", target_id)) {
                        return Ok(Some(data));
                    }
                }
            }
        }
        Ok(None)
    }

    let markdown = find_note_markdown(&root, &note_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Note with id {} not found", note_id))?;

    match snapshot_mod::load_snapshot(&crdt_dir, &note_id, &markdown) {
        Ok((_doc_opt, status)) => {
            let snapshot_path = snapshot_mod::snapshot_path(&crdt_dir, &note_id);
            let base64_data = if snapshot_path.exists() {
                let bytes = std::fs::read(&snapshot_path).map_err(|e| e.to_string())?;
                BASE64.encode(&bytes)
            } else {
                String::new()
            };
            Ok((base64_data, format!("{:?}", status)))
        }
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn save_snapshot(
    vault_path: String,
    note_id: String,
    markdown: String,
    update_base64: String,
) -> Result<(), String> {
    validate_safe_id(&note_id)?;
    let root = vault::canonicalize_vault_root(Path::new(&vault_path)).map_err(|e| e.to_string())?;
    let crdt_dir = root.join(".scalenote").join("crdt");
    let update_bytes = BASE64.decode(&update_base64).map_err(|e| e.to_string())?;

    let doc = Doc::new();
    {
        let mut txn = doc.transact_mut();
        let update = Update::decode_v1(&update_bytes).map_err(|e| e.to_string())?;
        txn.apply_update(update).map_err(|e| e.to_string())?;
    }
    snapshot_mod::save_snapshot(&crdt_dir, &note_id, &doc, &markdown).map_err(|e| e.to_string())
}

// ---------- Additional utility commands ----------
#[tauri::command]
pub fn search_titles(vault_path: String, prefix: String) -> Result<Vec<String>, String> {
    let root = vault::canonicalize_vault_root(Path::new(&vault_path)).map_err(|e| e.to_string())?;
    let db_path = root.join(".scalenote").join("search.db");
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    let pattern = format!("%{}%", prefix);
    let mut stmt = conn.prepare("SELECT title FROM notes WHERE title LIKE ?1 ORDER BY title LIMIT 10")
        .map_err(|e| e.to_string())?;
    let rows = stmt.query_map(params![pattern], |row| row.get(0)).map_err(|e| e.to_string())?;
    let mut results = Vec::new();
    for r in rows {
        results.push(r.map_err(|e| e.to_string())?);
    }
    Ok(results)
}

#[tauri::command]
pub fn find_backlinks(vault_path: String, note_title: String) -> Result<Vec<String>, String> {
    let root = vault::canonicalize_vault_root(Path::new(&vault_path)).map_err(|e| e.to_string())?;
    let db_path = root.join(".scalenote").join("search.db");
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    let pattern = format!("%[[{}]]%", note_title);
    let mut stmt = conn.prepare("SELECT path FROM notes WHERE body LIKE ?1")
        .map_err(|e| e.to_string())?;
    let rows = stmt.query_map(params![pattern], |row| row.get(0)).map_err(|e| e.to_string())?;
    let mut results = Vec::new();
    for r in rows {
        results.push(r.map_err(|e| e.to_string())?);
    }
    Ok(results)
}

#[tauri::command]
pub fn set_verbose_logging(enabled: bool) -> Result<(), String> {
    if enabled {
        std::env::set_var("RUST_LOG", "debug");
    } else {
        std::env::set_var("RUST_LOG", "info");
    }
    Ok(())
}

#[tauri::command]
pub async fn open_logs_folder(_app: tauri::AppHandle) -> Result<(), String> {
    let config_dir = portable::get_config_dir();
    let log_dir = config_dir.join("logs");
    tauri_plugin_shell::open::open(None, log_dir.to_string_lossy().to_string(), None).map_err(|e| e.to_string())
}
