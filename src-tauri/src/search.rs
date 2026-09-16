use std::path::{Path, PathBuf};
use rusqlite::{params, Connection};
use super::vault::{self};
use tracing::error;

/// Rebuild the full‑text search index for a vault.
/// Creates (or overwrites) `<vault>/.scalenote/search.db` with a simple table:
/// `notes(path TEXT PRIMARY KEY, title TEXT, body TEXT)`.
pub fn rebuild_index(vault_path: &Path) -> Result<(), String> {
    let root = PathBuf::from(vault_path);
    let db_path = root.join(".scalenote").join("search.db");
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    conn.execute(
        "DROP TABLE IF EXISTS notes",
        [],
    )
    .map_err(|e| e.to_string())?;
    conn.execute(
        "CREATE TABLE notes (path TEXT PRIMARY KEY, title TEXT, body TEXT)",
        [],
    )
    .map_err(|e| e.to_string())?;

    // Iterate over all notes in the vault.
    let tree = vault::scan_tree(&root, &root).map_err(|e| e.to_string())?;
    for entry in tree {
        if let vault::FileTreeEntry::Note { note } = entry {
            // Read raw markdown to extract title and body.
            let content = match vault::read_note(&root, &note.path) {
                Ok(c) => c,
                Err(e) => {
                    error!(%e, path = %note.path, "Failed to read note for indexing");
                    continue;
                }
            };
            // Title = first markdown heading ("# ") if present, otherwise filename.
            let title = content
                .lines()
                .find(|l| l.starts_with('#'))
                .map(|h| h.trim_start_matches('#').trim())
                .unwrap_or(&note.name);
            // Body = markdown without frontmatter (strip leading "---" block).
            let body = {
                let trimmed = content.trim_start();
                if trimmed.starts_with("---") {
                    if let Some(end) = trimmed[3..].find("\n---") {
                        trimmed[3 + end + 4..].trim_start().to_string()
                    } else {
                        content.clone()
                    }
                } else {
                    content.clone()
                }
            };
            let _ = conn.execute(
                "INSERT INTO notes (path, title, body) VALUES (?1, ?2, ?3)",
                params![note.path, title, body],
            );
        }
    }
    Ok(())
}

/// Simple search returning the note paths that match the query.
/// We perform a case‑insensitive LIKE on title and body.
pub fn search_notes(vault_path: &Path, query: &str) -> Result<Vec<String>, String> {
    let db_path = PathBuf::from(vault_path).join(".scalenote").join("search.db");
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    let pattern = format!("%{}%", query);
    let mut stmt = conn
        .prepare("SELECT path FROM notes WHERE title LIKE ?1 OR body LIKE ?1 COLLATE NOCASE")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![pattern], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    let mut results = Vec::new();
    for r in rows {
        match r {
            Ok(p) => results.push(p),
            Err(e) => {
                error!(%e, "Failed to read search row");
            }
        }
    }
    Ok(results)
}
