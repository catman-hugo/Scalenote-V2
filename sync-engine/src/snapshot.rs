use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use sha2::{Digest, Sha256};
use thiserror::Error;
use uuid::Uuid;
use yrs::updates::decoder::Decode;
use yrs::{Doc, ReadTxn, StateVector, Transact, Update};

const MAGIC: &[u8; 8] = b"SCALECRD";
const VERSION: u8 = 1;
const HEADER_SIZE: usize = 8 + 1 + 32; // Magic (8) + Version (1) + SHA-256 (32) = 41 bytes

#[derive(Error, Debug)]
pub enum SnapshotError {
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),
    #[error("CRDT decoding error: {0}")]
    Crdt(#[from] yrs::encoding::read::Error),
    #[error("CRDT update error: {0}")]
    Update(#[from] yrs::error::UpdateError),
    #[error("Snapshot format error: {0}")]
    Format(String),
}

#[derive(Debug, PartialEq, Eq)]
pub enum SnapshotStatus {
    /// Snapshot was found, hash matched disk content, and CRDT history was loaded.
    Loaded,
    /// No snapshot file existed yet (normal for freshly created or imported notes).
    NotFound,
    /// Markdown content changed outside ScaleNote. File on disk wins; snapshot discarded.
    HashMismatch { stored: [u8; 32], current: [u8; 32] },
    /// File was corrupt, wrong magic bytes, or truncated. Rebuild from disk required.
    Corrupt(String),
}

/// Compute SHA-256 hash of markdown content.
pub fn compute_content_hash(markdown: &str) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(markdown.as_bytes());
    hasher.finalize().into()
}

/// Path to a note's CRDT snapshot file.
pub fn snapshot_path(crdt_dir: &Path, note_id: &str) -> PathBuf {
    crdt_dir.join(format!("{}.bin", note_id))
}

/// Save a note's CRDT snapshot atomically to `.scalenote/crdt/<note-id>.bin`.
pub fn save_snapshot(
    crdt_dir: &Path,
    note_id: &str,
    doc: &Doc,
    markdown_content: &str,
) -> Result<(), SnapshotError> {
    fs::create_dir_all(crdt_dir)?;

    let target_path = snapshot_path(crdt_dir, note_id);
    let temp_path = crdt_dir.join(format!(".tmp_crdt_{}_{}", Uuid::now_v7(), std::process::id()));

    let hash = compute_content_hash(markdown_content);

    // Encode full CRDT document state
    let txn = doc.transact();
    let state_vector = StateVector::default();
    let update = txn.encode_diff_v1(&state_vector);

    let mut data = Vec::with_capacity(HEADER_SIZE + update.len());
    data.extend_from_slice(MAGIC);
    data.push(VERSION);
    data.extend_from_slice(&hash);
    data.extend_from_slice(&update);

    let mut file = match File::create(&temp_path) {
        Ok(f) => f,
        Err(e) => {
            tracing::error!(path = %temp_path.display(), error = %e, "Failed to create snapshot temp file");
            return Err(SnapshotError::Io(e));
        }
    };

    if let Err(e) = file.write_all(&data) {
        let _ = fs::remove_file(&temp_path);
        return Err(SnapshotError::Io(e));
    }

    if let Err(e) = file.sync_all() {
        let _ = fs::remove_file(&temp_path);
        return Err(SnapshotError::Io(e));
    }

    drop(file);

    if let Err(e) = fs::rename(&temp_path, &target_path) {
        let _ = fs::remove_file(&temp_path);
        tracing::error!(
            temp = %temp_path.display(),
            target = %target_path.display(),
            error = %e,
            "Failed to rename snapshot temp file over target"
        );
        return Err(SnapshotError::Io(e));
    }

    tracing::debug!(
        note_id = %note_id,
        bytes = data.len(),
        "Saved CRDT snapshot"
    );

    Ok(())
}

/// Attempt to load a note's CRDT snapshot.
///
/// If hash matches, returns (doc, SnapshotStatus::Loaded).
/// If hash mismatches or corrupt, the file on disk wins per docs/ARCHITECTURE.md.
pub fn load_snapshot(
    crdt_dir: &Path,
    note_id: &str,
    current_markdown: &str,
) -> Result<(Option<Doc>, SnapshotStatus), SnapshotError> {
    let target_path = snapshot_path(crdt_dir, note_id);
    if !target_path.exists() {
        return Ok((None, SnapshotStatus::NotFound));
    }

    let mut file = File::open(&target_path)?;
    let mut data = Vec::new();
    file.read_to_end(&mut data)?;

    if data.len() < HEADER_SIZE {
        tracing::warn!(note_id = %note_id, "Snapshot truncated; discarding");
        return Ok((None, SnapshotStatus::Corrupt("File smaller than minimum header".into())));
    }

    if &data[0..8] != MAGIC {
        tracing::warn!(note_id = %note_id, "Snapshot magic mismatch; discarding");
        return Ok((None, SnapshotStatus::Corrupt("Invalid magic header".into())));
    }

    let version = data[8];
    if version != VERSION {
        tracing::warn!(note_id = %note_id, version = version, "Unsupported snapshot version; discarding");
        return Ok((None, SnapshotStatus::Corrupt(format!("Unsupported version {}", version))));
    }

    let mut stored_hash = [0u8; 32];
    stored_hash.copy_from_slice(&data[9..41]);

    let current_hash = compute_content_hash(current_markdown);
    if stored_hash != current_hash {
        tracing::warn!(
            note_id = %note_id,
            "Markdown changed outside ScaleNote; file on disk wins, discarding snapshot"
        );
        return Ok((None, SnapshotStatus::HashMismatch {
            stored: stored_hash,
            current: current_hash,
        }));
    }

    let update_bytes = &data[HEADER_SIZE..];
    let update = match Update::decode_v1(update_bytes) {
        Ok(u) => u,
        Err(e) => {
            tracing::warn!(note_id = %note_id, error = ?e, "Failed to decode CRDT update; discarding");
            return Ok((None, SnapshotStatus::Corrupt("Failed to decode CRDT update".into())));
        }
    };

    let doc = Doc::new();
    {
        let mut txn = doc.transact_mut();
        txn.apply_update(update)?;
    }

    tracing::debug!(note_id = %note_id, "Loaded CRDT snapshot successfully");
    Ok((Some(doc), SnapshotStatus::Loaded))
}

#[cfg(test)]
mod tests {
    use super::*;
    use yrs::types::DefaultPrelim;
    use yrs::{GetString, Text, WriteTxn, XmlFragment};

    #[test]
    fn test_snapshot_roundtrip_and_hash_mismatch() {
        let temp_dir = std::env::temp_dir().join(format!("scalenote_snapshot_test_{}", Uuid::now_v7()));
        fs::create_dir_all(&temp_dir).unwrap();

        let note_id = "01937d2e-8f41-7a3c-9b22-5e1f0a6c8d44";
        let initial_markdown = "# Test Note\nHello world\n";

        // Create doc and add a text element inside fragment
        let doc = Doc::new();
        {
            let mut txn = doc.transact_mut();
            let fragment = txn.get_or_insert_xml_fragment("content");
            let text = fragment.push_back(&mut txn, yrs::XmlTextRef::default_prelim());
            text.push(&mut txn, "Hello world");
        }

        // Save snapshot
        save_snapshot(&temp_dir, note_id, &doc, initial_markdown).unwrap();
        assert!(snapshot_path(&temp_dir, note_id).exists());

        // Load snapshot with identical markdown -> must succeed
        let (loaded_doc, status) = load_snapshot(&temp_dir, note_id, initial_markdown).unwrap();
        assert_eq!(status, SnapshotStatus::Loaded);
        assert!(loaded_doc.is_some());

        let loaded = loaded_doc.unwrap();
        {
            let txn = loaded.transact();
            let fragment = txn.get_xml_fragment("content").unwrap();
            let text = fragment.get(&txn, 0).unwrap();
            let s = text.into_xml_text().unwrap();
            assert_eq!(s.get_string(&txn), "Hello world");
        }

        // Load snapshot with changed markdown (external edit) -> must detect hash mismatch
        let modified_markdown = "# Test Note\nHello world edited by Vim\n";
        let (mismatch_doc, status) = load_snapshot(&temp_dir, note_id, modified_markdown).unwrap();
        assert!(matches!(status, SnapshotStatus::HashMismatch { .. }));
        assert!(mismatch_doc.is_none());

        let _ = fs::remove_dir_all(&temp_dir);
    }
}
