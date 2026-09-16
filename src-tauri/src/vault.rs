use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Component, Path, PathBuf};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use thiserror::Error;
use uuid::Uuid;

#[derive(Error, Debug)]
pub enum VaultError {
    #[error("Invalid path: {0}")]
    InvalidPath(String),
    #[error("Vault error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Parse error: {0}")]
    Parse(String),
    #[error("Not found: {0}")]
    NotFound(String),
}

impl From<VaultError> for String {
    fn from(err: VaultError) -> Self {
        err.to_string()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NoteFile {
    pub id: String,      // UUIDv7 from frontmatter
    pub name: String,    // filename without .md
    pub path: String,    // vault-relative path using forward slashes
    pub created: String, // RFC 3339
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FolderEntry {
    pub name: String,
    pub path: String, // vault-relative path using forward slashes
    pub children: Vec<FileTreeEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum FileTreeEntry {
    Note { note: NoteFile },
    Folder { folder: FolderEntry },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultState {
    pub path: String,
    pub tree: Vec<FileTreeEntry>,
}

/// Canonicalizes the vault root, ensuring it exists and is a directory.
pub fn canonicalize_vault_root(vault_root: &Path) -> Result<PathBuf, VaultError> {
    let canonical = vault_root
        .canonicalize()
        .map_err(|e| VaultError::InvalidPath(format!("Invalid vault root '{}': {}", vault_root.display(), e)))?;
    if !canonical.is_dir() {
        return Err(VaultError::InvalidPath(format!(
            "Vault root '{}' is not a directory",
            vault_root.display()
        )));
    }
    Ok(canonical)
}

/// Validates that a vault-relative path does not escape the vault root.
/// Canonicalizes both the vault root and the requested path, and rejects the
/// operation if the canonicalized target does not start with the canonicalized vault root.
pub fn validate_path(vault_root: &Path, rel_path: &str) -> Result<PathBuf, VaultError> {
    if rel_path.starts_with('/') || rel_path.starts_with('\\') || Path::new(rel_path).is_absolute() {
        return Err(VaultError::InvalidPath("Absolute paths are forbidden".into()));
    }

    let canonical_root = canonicalize_vault_root(vault_root)?;

    // An empty path or "." refers to the vault root itself
    if rel_path.is_empty() || rel_path == "." {
        return Ok(canonical_root);
    }

    let p = Path::new(rel_path);

    // Reject any component attempting traversal
    for comp in p.components() {
        match comp {
            Component::ParentDir => {
                return Err(VaultError::InvalidPath(
                    "Path attempts to traverse above vault root".into(),
                ));
            }
            Component::Prefix(_) | Component::RootDir => {
                return Err(VaultError::InvalidPath("Absolute paths are forbidden".into()));
            }
            Component::Normal(_) | Component::CurDir => {}
        }
    }

    let target = canonical_root.join(p);

    // If target exists on disk or is a symlink (even broken)
    if fs::symlink_metadata(&target).is_ok() {
        let canonical_target = target.canonicalize().map_err(|e| {
            VaultError::InvalidPath(format!("Failed to canonicalize target path '{}': {}", target.display(), e))
        })?;

        if !canonical_target.starts_with(&canonical_root) {
            return Err(VaultError::InvalidPath(
                "Resolved path is outside vault root".into(),
            ));
        }
        Ok(canonical_target)
    } else {
        // Target does not exist yet (e.g. creating a new note or folder).
        // Find closest existing ancestor directory and canonicalize it.
        let mut existing_ancestor = target.as_path();
        while !existing_ancestor.exists() {
            match existing_ancestor.parent() {
                Some(parent) => existing_ancestor = parent,
                None => {
                    return Err(VaultError::InvalidPath(
                        "No existing ancestor directory found".into(),
                    ))
                }
            }
        }

        let canonical_ancestor = existing_ancestor.canonicalize().map_err(|e| {
            VaultError::InvalidPath(format!(
                "Failed to canonicalize ancestor '{}': {}",
                existing_ancestor.display(),
                e
            ))
        })?;

        if !canonical_ancestor.starts_with(&canonical_root) {
            return Err(VaultError::InvalidPath(
                "Ancestor directory resolves outside vault root".into(),
            ));
        }

        let remaining = target
            .strip_prefix(existing_ancestor)
            .map_err(|_| VaultError::InvalidPath("Path prefix calculation failed".into()))?;

        for comp in remaining.components() {
            match comp {
                Component::Normal(_) => {}
                _ => {
                    return Err(VaultError::InvalidPath(
                        "Invalid path component in non-existent path".into(),
                    ))
                }
            }
        }

        let canonical_target = canonical_ancestor.join(remaining);
        if !canonical_target.starts_with(&canonical_root) {
            return Err(VaultError::InvalidPath(
                "Resolved path is outside vault root".into(),
            ));
        }

        Ok(canonical_target)
    }
}

/// Converts a path relative to vault root into a forward-slash string.
fn to_relative_slash_path(vault_root: &Path, full_path: &Path) -> Result<String, VaultError> {
    let canonical_root = vault_root
        .canonicalize()
        .unwrap_or_else(|_| vault_root.to_path_buf());
    let canonical_full = if full_path.exists() {
        full_path
            .canonicalize()
            .unwrap_or_else(|_| full_path.to_path_buf())
    } else if let Some(parent) = full_path.parent() {
        let canonical_parent = parent
            .canonicalize()
            .unwrap_or_else(|_| parent.to_path_buf());
        canonical_parent.join(full_path.file_name().unwrap_or_default())
    } else {
        full_path.to_path_buf()
    };

    let rel = canonical_full
        .strip_prefix(&canonical_root)
        .or_else(|_| full_path.strip_prefix(vault_root))
        .map_err(|_| VaultError::InvalidPath("File not within vault root".into()))?;
    let path_str = rel
        .components()
        .map(|c| c.as_os_str().to_string_lossy().to_string())
        .collect::<Vec<_>>()
        .join("/");
    Ok(path_str)
}

/// Writes data to a temporary file in the same directory, then renames it atomically.
/// Guarantees that mid-save crashes or power loss never leave a corrupted file.
pub fn write_atomic(target_path: &Path, data: &[u8]) -> Result<(), VaultError> {
    let parent = target_path
        .parent()
        .ok_or_else(|| VaultError::InvalidPath("Target path has no parent directory".into()))?;

    fs::create_dir_all(parent)?;

    let temp_name = format!(".tmp_{}_{}", Uuid::now_v7(), std::process::id());
    let temp_path = parent.join(&temp_name);

    let mut file = match File::create(&temp_path) {
        Ok(f) => f,
        Err(e) => {
            tracing::error!(
                target = %target_path.display(),
                temp = %temp_path.display(),
                error = %e,
                "Failed to create temporary file for atomic write"
            );
            return Err(VaultError::Io(e));
        }
    };

    if let Err(e) = file.write_all(data) {
        let _ = fs::remove_file(&temp_path);
        return Err(VaultError::Io(e));
    }

    if let Err(e) = file.sync_all() {
        let _ = fs::remove_file(&temp_path);
        return Err(VaultError::Io(e));
    }

    drop(file);

    if let Err(e) = fs::rename(&temp_path, target_path) {
        let _ = fs::remove_file(&temp_path);
        tracing::error!(
            target = %target_path.display(),
            temp = %temp_path.display(),
            error = %e,
            "Failed to rename temp file to target"
        );
        return Err(VaultError::Io(e));
    }

    Ok(())
}

/// Extract or inject UUIDv7 note ID and creation time into frontmatter.
/// Returns (NoteFile metadata, complete markdown string with frontmatter).
pub fn ensure_frontmatter(
    vault_root: &Path,
    full_path: &Path,
    raw_content: &str,
) -> Result<(NoteFile, String), VaultError> {
    let file_stem = full_path
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "Untitled".to_string());
    let rel_path = to_relative_slash_path(vault_root, full_path)?;

    let now_rfc3339 = Utc::now().to_rfc3339();

    // Check for existing YAML frontmatter
    let trimmed = raw_content.trim_start();
    if trimmed.starts_with("---") {
        if let Some(rest) = trimmed.strip_prefix("---") {
            if let Some(end_idx) = rest.find("\n---") {
                let fm_body = &rest[..end_idx];
                let after_fm = &rest[end_idx + 4..]; // skip "\n---"
                let body_content = after_fm.strip_prefix('\n').unwrap_or(after_fm);

                let mut note_id = None;
                let mut created = None;

                for line in fm_body.lines() {
                    let line = line.trim();
                    if let Some(val) = line.strip_prefix("id:") {
                        let id_str = val.trim().trim_matches('"').trim_matches('\'');
                        if !id_str.is_empty() {
                            note_id = Some(id_str.to_string());
                        }
                    } else if let Some(val) = line.strip_prefix("created:") {
                        let cr_str = val.trim().trim_matches('"').trim_matches('\'');
                        if !cr_str.is_empty() {
                            created = Some(cr_str.to_string());
                        }
                    }
                }

                if let Some(id) = note_id {
                    let created_str = created.unwrap_or_else(|| now_rfc3339.clone());
                    let note = NoteFile {
                        id,
                        name: file_stem,
                        path: rel_path,
                        created: created_str,
                    };
                    return Ok((note, raw_content.to_string()));
                } else {
                    // ID missing from existing frontmatter; inject id at the top of frontmatter
                    let new_id = Uuid::now_v7().to_string();
                    let created_str = created.unwrap_or_else(|| now_rfc3339.clone());
                    let new_fm = format!("---\nid: {}\n{}\n---{}", new_id, fm_body.trim(), body_content);

                    let note = NoteFile {
                        id: new_id,
                        name: file_stem,
                        path: rel_path,
                        created: created_str,
                    };
                    return Ok((note, new_fm));
                }
            }
        }
    }

    // No frontmatter present: prepend a fresh frontmatter block
    let new_id = Uuid::now_v7().to_string();
    let new_content = format!(
        "---\nid: {}\ncreated: {}\n---\n\n{}",
        new_id,
        now_rfc3339,
        raw_content.trim_start()
    );

    let note = NoteFile {
        id: new_id,
        name: file_stem,
        path: rel_path,
        created: now_rfc3339,
    };

    Ok((note, new_content))
}

/// Recursively scans the vault directory for notes and subfolders.
pub fn scan_tree(vault_root: &Path, current_dir: &Path) -> Result<Vec<FileTreeEntry>, VaultError> {
    if !current_dir.exists() || !current_dir.is_dir() {
        return Ok(Vec::new());
    }

    let mut folders = Vec::new();
    let mut notes = Vec::new();

    let entries = match fs::read_dir(current_dir) {
        Ok(e) => e,
        Err(err) => {
            tracing::warn!(dir = %current_dir.display(), error = %err, "Failed to read directory");
            return Ok(Vec::new());
        }
    };

    for entry in entries.flatten() {
        let path = entry.path();
        let file_name = entry.file_name().to_string_lossy().to_string();

        // Skip hidden files/directories (.scalenote, .git, .obsidian, etc.)
        if file_name.starts_with('.') {
            continue;
        }

        if path.is_dir() {
            // Recurse into directory
            let children = scan_tree(vault_root, &path)?;
            let rel_path = to_relative_slash_path(vault_root, &path)?;
            folders.push(FileTreeEntry::Folder {
                folder: FolderEntry {
                    name: file_name,
                    path: rel_path,
                    children,
                },
            });
        } else if path.is_file() {
            if path.extension().and_then(|s| s.to_str()) == Some("md") {
                // Read file to inspect frontmatter
                let content = match fs::read_to_string(&path) {
                    Ok(c) => c,
                    Err(e) => {
                        tracing::warn!(file = %path.display(), error = %e, "Could not read note file");
                        continue;
                    }
                };

                match ensure_frontmatter(vault_root, &path, &content) {
                    Ok((note, new_content)) => {
                        // If frontmatter had to be added or repaired, write it back atomically
                        if new_content != content {
                            let _ = write_atomic(&path, new_content.as_bytes());
                        }
                        notes.push(FileTreeEntry::Note { note });
                    }
                    Err(e) => {
                        tracing::warn!(file = %path.display(), error = %e, "Failed to parse frontmatter");
                    }
                }
            }
        }
    }

    // Sort folders alphabetically, then notes alphabetically
    folders.sort_by(|a, b| match (a, b) {
        (FileTreeEntry::Folder { folder: f1 }, FileTreeEntry::Folder { folder: f2 }) => {
            f1.name.to_lowercase().cmp(&f2.name.to_lowercase())
        }
        _ => std::cmp::Ordering::Equal,
    });

    notes.sort_by(|a, b| match (a, b) {
        (FileTreeEntry::Note { note: n1 }, FileTreeEntry::Note { note: n2 }) => {
            n1.name.to_lowercase().cmp(&n2.name.to_lowercase())
        }
        _ => std::cmp::Ordering::Equal,
    });

    let mut result = folders;
    result.extend(notes);
    Ok(result)
}

/// Initializes standard vault directories and scans the tree.
pub fn init_and_open_vault(vault_path_str: &str) -> Result<VaultState, VaultError> {
    let raw_root = PathBuf::from(vault_path_str);
    if !raw_root.exists() {
        fs::create_dir_all(&raw_root)?;
    }

    let root = canonicalize_vault_root(&raw_root)?;

    // Create required initial folders (.scalenote cache/snapshots only)
    let scalenote_dir = root.join(".scalenote");
    let crdt_dir = scalenote_dir.join("crdt");

    let _ = fs::create_dir_all(&crdt_dir);

    let tree = scan_tree(&root, &root)?;

    tracing::info!(
        vault = %root.display(),
        entries_count = tree.len(),
        "Vault opened successfully"
    );

    Ok(VaultState {
        path: root.to_string_lossy().to_string(),
        tree,
    })
}

/// Reads note content, ensuring frontmatter ID is present.
pub fn read_note(vault_root: &Path, rel_path: &str) -> Result<String, VaultError> {
    let full_path = validate_path(vault_root, rel_path)?;
    if !full_path.exists() {
        return Err(VaultError::NotFound(format!("Note not found: {}", rel_path)));
    }

    let mut content = String::new();
    let mut file = File::open(&full_path)?;
    file.read_to_string(&mut content)?;

    let (_note, verified_content) = ensure_frontmatter(vault_root, &full_path, &content)?;
    if verified_content != content {
        write_atomic(&full_path, verified_content.as_bytes())?;
        return Ok(verified_content);
    }

    Ok(content)
}

/// Writes note content atomically to disk.
pub fn write_note(
    vault_root: &Path,
    rel_path: &str,
    content: &str,
) -> Result<NoteFile, VaultError> {
    let full_path = validate_path(vault_root, rel_path)?;
    let (note, verified_content) = ensure_frontmatter(vault_root, &full_path, content)?;

    write_atomic(&full_path, verified_content.as_bytes())?;

    tracing::debug!(
        note_id = %note.id,
        path = %note.path,
        bytes = verified_content.len(),
        "Note written atomically"
    );

    Ok(note)
}

/// Creates a new note with default template.
pub fn create_note(
    vault_root: &Path,
    parent_folder: &str,
    name: &str,
) -> Result<NoteFile, VaultError> {
    let clean_name = name.trim().trim_end_matches(".md");
    if clean_name.is_empty() {
        return Err(VaultError::InvalidPath("Note title cannot be empty".into()));
    }
    if clean_name.contains('/') || clean_name.contains('\\') || clean_name.contains("..") {
        return Err(VaultError::InvalidPath(
            "Note title cannot contain path separators or '..'".into(),
        ));
    }

    let file_name = format!("{}.md", clean_name);
    let parent_path = validate_path(vault_root, parent_folder)?;
    let full_path = parent_path.join(&file_name);

    if full_path.exists() {
        return Err(VaultError::InvalidPath(format!(
            "A note named '{}' already exists",
            clean_name
        )));
    }

    let new_id = Uuid::now_v7().to_string();
    let now = Utc::now().to_rfc3339();
    let initial_content = format!(
        "---\nid: {}\ncreated: {}\n---\n\n# {}\n",
        new_id, now, clean_name
    );

    write_atomic(&full_path, initial_content.as_bytes())?;

    let rel_path = to_relative_slash_path(vault_root, &full_path)?;

    tracing::info!(
        note_id = %new_id,
        title = %clean_name,
        path = %rel_path,
        "Created new note"
    );

    Ok(NoteFile {
        id: new_id,
        name: clean_name.to_string(),
        path: rel_path,
        created: now,
    })
}

/// Creates a new folder inside parent_folder.
pub fn create_folder(
    vault_root: &Path,
    parent_folder: &str,
    name: &str,
) -> Result<FolderEntry, VaultError> {
    let clean_name = name.trim();
    if clean_name.is_empty() {
        return Err(VaultError::InvalidPath("Folder name cannot be empty".into()));
    }
    if clean_name.contains('/') || clean_name.contains('\\') || clean_name.contains("..") {
        return Err(VaultError::InvalidPath(
            "Folder name cannot contain path separators or '..'".into(),
        ));
    }

    let parent_path = validate_path(vault_root, parent_folder)?;
    let target_dir = parent_path.join(clean_name);

    if target_dir.exists() {
        return Err(VaultError::InvalidPath(format!(
            "A folder named '{}' already exists",
            clean_name
        )));
    }

    fs::create_dir_all(&target_dir)?;
    let rel_path = to_relative_slash_path(vault_root, &target_dir)?;

    tracing::info!(name = %clean_name, path = %rel_path, "Created new folder");

    Ok(FolderEntry {
        name: clean_name.to_string(),
        path: rel_path,
        children: Vec::new(),
    })
}

/// Renames a note or folder and any matching sidecars.
pub fn rename_entry(
    vault_root: &Path,
    old_rel_path: &str,
    new_name: &str,
) -> Result<String, VaultError> {
    let clean_new_name = new_name.trim();
    if clean_new_name.is_empty() {
        return Err(VaultError::InvalidPath("New name cannot be empty".into()));
    }
    if clean_new_name.contains('/') || clean_new_name.contains('\\') || clean_new_name.contains("..") {
        return Err(VaultError::InvalidPath(
            "New name cannot contain path separators or '..'".into(),
        ));
    }

    let old_full = validate_path(vault_root, old_rel_path)?;
    if !old_full.exists() {
        return Err(VaultError::NotFound(format!("Path not found: {}", old_rel_path)));
    }

    let parent = old_full
        .parent()
        .ok_or_else(|| VaultError::InvalidPath("No parent directory".into()))?;

    let is_dir = old_full.is_dir();
    let target_file_name = if is_dir {
        clean_new_name.to_string()
    } else {
        let base = clean_new_name.trim_end_matches(".md");
        format!("{}.md", base)
    };

    let new_full = parent.join(&target_file_name);
    if new_full.exists() {
        return Err(VaultError::InvalidPath(format!(
            "Target '{}' already exists",
            target_file_name
        )));
    }

    fs::rename(&old_full, &new_full)?;

    // If it was a note, also update heading if matching old name, and rename sidecars
    if !is_dir {
        let old_stem = old_full.file_stem().unwrap_or_default().to_string_lossy();
        let new_stem = new_full.file_stem().unwrap_or_default().to_string_lossy();

        if let Ok(content) = fs::read_to_string(&new_full) {
            let old_heading = format!("# {}", old_stem);
            let new_heading = format!("# {}", new_stem);
            if content.contains(&old_heading) {
                let updated = content.replace(&old_heading, &new_heading);
                let _ = write_atomic(&new_full, updated.as_bytes());
            }
        }

        let canvas_old = parent.join(format!("{}.canvas.json", old_stem));
        let canvas_new = parent.join(format!("{}.canvas.json", new_stem));
        if canvas_old.exists() {
            let _ = fs::rename(canvas_old, canvas_new);
        }

        let annot_old = parent.join(format!("{}.annotations.json", old_stem));
        let annot_new = parent.join(format!("{}.annotations.json", new_stem));
        if annot_old.exists() {
            let _ = fs::rename(annot_old, annot_new);
        }
    }

    let new_rel = to_relative_slash_path(vault_root, &new_full)?;
    tracing::info!(old = %old_rel_path, new = %new_rel, "Renamed vault entry");
    Ok(new_rel)
}

/// Deletes a note or folder (and its sidecars).
pub fn delete_entry(vault_root: &Path, rel_path: &str) -> Result<(), VaultError> {
    let target_full = validate_path(vault_root, rel_path)?;
    if !target_full.exists() {
        return Err(VaultError::NotFound(format!("Path not found: {}", rel_path)));
    }

    if target_full.is_dir() {
        fs::remove_dir_all(&target_full)?;
    } else {
        fs::remove_file(&target_full)?;

        // Remove potential sidecars
        if let Some(parent) = target_full.parent() {
            let stem = target_full.file_stem().unwrap_or_default().to_string_lossy();
            let canvas = parent.join(format!("{}.canvas.json", stem));
            if canvas.exists() {
                let _ = fs::remove_file(canvas);
            }
            let annot = parent.join(format!("{}.annotations.json", stem));
            if annot.exists() {
                let _ = fs::remove_file(annot);
            }
        }
    }

    tracing::info!(path = %rel_path, "Deleted vault entry");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_atomic_write_creates_temp_and_renames() {
        // Create a temporary directory for the test
        let temp_dir = std::env::temp_dir().join(format!("scalenote_atomic_test_{}", uuid::Uuid::now_v7()));
        std::fs::create_dir_all(&temp_dir).unwrap();
        let target = temp_dir.join("note.md");
        let data = b"Hello world";
        // Perform atomic write
        write_atomic(&target, data).unwrap();
        // Verify the target file exists and contains the data
        let content = std::fs::read_to_string(&target).unwrap();
        assert_eq!(content, "Hello world");
        // Ensure no temporary file remains (starts with .tmp_)
        let tmp_exists = std::fs::read_dir(&temp_dir)
            .unwrap()
            .any(|e| e.unwrap().file_name().to_string_lossy().starts_with(".tmp_"));
        assert!(!tmp_exists, "Temporary file was not cleaned up");
        // Cleanup
        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_atomic_write_and_frontmatter() {
        let temp_dir = std::env::temp_dir().join(format!("scalenote_test_{}", Uuid::now_v7()));
        fs::create_dir_all(&temp_dir).unwrap();

        let note = create_note(&temp_dir, "", "My First Note").unwrap();
        assert_eq!(note.name, "My First Note");
        assert_eq!(note.path, "My First Note.md");
        assert!(!note.id.is_empty());

        // Verify file exists on disk and no temp files left
        let note_path = temp_dir.join("My First Note.md");
        assert!(note_path.exists());

        let raw = fs::read_to_string(&note_path).unwrap();
        assert!(raw.contains(&format!("id: {}", note.id)));
        assert!(raw.contains("# My First Note"));

        // Check temp files in dir
        let temp_files: Vec<_> = fs::read_dir(&temp_dir)
            .unwrap()
            .flatten()
            .filter(|e| e.file_name().to_string_lossy().starts_with(".tmp_"))
            .collect();
        assert_eq!(temp_files.len(), 0);

        // Read note
        let content = read_note(&temp_dir, "My First Note.md").unwrap();
        assert_eq!(content, raw);

        // Rename note and check sidecars
        let canvas_path = temp_dir.join("My First Note.canvas.json");
        fs::write(&canvas_path, "{}").unwrap();

        let new_rel = rename_entry(&temp_dir, "My First Note.md", "Renamed Note").unwrap();
        assert_eq!(new_rel, "Renamed Note.md");
        assert!(temp_dir.join("Renamed Note.md").exists());
        assert!(temp_dir.join("Renamed Note.canvas.json").exists());
        assert!(!note_path.exists());
        assert!(!canvas_path.exists());

        // Delete note
        delete_entry(&temp_dir, "Renamed Note.md").unwrap();
        assert!(!temp_dir.join("Renamed Note.md").exists());
        assert!(!temp_dir.join("Renamed Note.canvas.json").exists());

        let _ = fs::remove_dir_all(&temp_dir);
    }
}
