use std::fs;
use std::os::unix::fs::symlink;
use uuid::Uuid;

use scalenote_lib::vault::{
    canonicalize_vault_root, create_folder, create_note, delete_entry, read_note, rename_entry,
    validate_path, write_note,
};

#[test]
fn test_relative_path_traversal_rejected() {
    let temp_root = std::env::temp_dir().join(format!("scalenote_sec_test_{}", Uuid::now_v7()));
    let vault_dir = temp_root.join("vault");
    let outside_dir = temp_root.join("outside");
    fs::create_dir_all(&vault_dir).unwrap();
    fs::create_dir_all(&outside_dir).unwrap();

    let outside_file = outside_dir.join("secret.md");
    fs::write(&outside_file, "secret data").unwrap();

    // 1. Direct parent directory traversal
    let res = validate_path(&vault_dir, "../outside/secret.md");
    assert!(res.is_err(), "Direct ../ traversal must be rejected");

    let res = read_note(&vault_dir, "../outside/secret.md");
    assert!(res.is_err(), "read_note with ../ traversal must be rejected");

    let res = write_note(&vault_dir, "../outside/secret.md", "overwrite");
    assert!(res.is_err(), "write_note with ../ traversal must be rejected");

    let res = delete_entry(&vault_dir, "../outside/secret.md");
    assert!(res.is_err(), "delete_entry with ../ traversal must be rejected");

    // 2. Nested parent directory traversal (e.g. folder/../../outside)
    let nested_folder = vault_dir.join("subfolder");
    fs::create_dir_all(&nested_folder).unwrap();

    let res = validate_path(&vault_dir, "subfolder/../../outside/secret.md");
    assert!(res.is_err(), "Nested ../ traversal must be rejected");

    let res = read_note(&vault_dir, "subfolder/../../outside/secret.md");
    assert!(res.is_err(), "read_note with nested ../ traversal must be rejected");

    // Cleanup
    let _ = fs::remove_dir_all(&temp_root);
}

#[test]
fn test_absolute_path_rejected() {
    let temp_root = std::env::temp_dir().join(format!("scalenote_sec_test_{}", Uuid::now_v7()));
    let vault_dir = temp_root.join("vault");
    fs::create_dir_all(&vault_dir).unwrap();

    let res = validate_path(&vault_dir, "/etc/passwd");
    assert!(res.is_err(), "Absolute path must be rejected");

    let res = read_note(&vault_dir, "/etc/passwd");
    assert!(res.is_err(), "read_note with absolute path must be rejected");

    let _ = fs::remove_dir_all(&temp_root);
}

#[test]
fn test_symlink_escaping_vault_rejected() {
    let temp_root = std::env::temp_dir().join(format!("scalenote_sec_test_{}", Uuid::now_v7()));
    let vault_dir = temp_root.join("vault");
    let outside_dir = temp_root.join("outside");
    fs::create_dir_all(&vault_dir).unwrap();
    fs::create_dir_all(&outside_dir).unwrap();

    // Create a target file outside the vault
    let secret_file = outside_dir.join("outside_secret.md");
    fs::write(&secret_file, "classified information").unwrap();

    // Create a symlink INSIDE the vault pointing OUTSIDE the vault
    let symlink_file = vault_dir.join("evil_link.md");
    symlink(&secret_file, &symlink_file).unwrap();

    // Attempt to validate and read through the symlink
    let res = validate_path(&vault_dir, "evil_link.md");
    assert!(res.is_err(), "Symlink pointing outside vault must be rejected by validate_path");

    let res = read_note(&vault_dir, "evil_link.md");
    assert!(res.is_err(), "read_note through symlink escaping vault must be rejected");

    let res = write_note(&vault_dir, "evil_link.md", "modified content");
    assert!(res.is_err(), "write_note through symlink escaping vault must be rejected");

    let res = delete_entry(&vault_dir, "evil_link.md");
    assert!(res.is_err(), "delete_entry through symlink escaping vault must be rejected");

    // Create a symlink directory inside vault pointing outside
    let symlink_folder = vault_dir.join("outside_link_dir");
    symlink(&outside_dir, &symlink_folder).unwrap();

    let res = validate_path(&vault_dir, "outside_link_dir/outside_secret.md");
    assert!(res.is_err(), "Path through symlink directory escaping vault must be rejected");

    let res = read_note(&vault_dir, "outside_link_dir/outside_secret.md");
    assert!(res.is_err(), "read_note through symlink dir escaping vault must be rejected");

    // Cleanup
    let _ = fs::remove_dir_all(&temp_root);
}

#[test]
fn test_entry_names_with_traversal_rejected() {
    let temp_root = std::env::temp_dir().join(format!("scalenote_sec_test_{}", Uuid::now_v7()));
    let vault_dir = temp_root.join("vault");
    fs::create_dir_all(&vault_dir).unwrap();

    // Attempt to create note with traversal in title
    let res = create_note(&vault_dir, "", "../../escape_note");
    assert!(res.is_err(), "create_note with traversal title must be rejected");

    let res = create_note(&vault_dir, "", "sub/escape_note");
    assert!(res.is_err(), "create_note with slash in title must be rejected");

    // Attempt to create folder with traversal in name
    let res = create_folder(&vault_dir, "", "../escape_dir");
    assert!(res.is_err(), "create_folder with traversal name must be rejected");

    // Normal valid note creation should succeed
    let note = create_note(&vault_dir, "", "Valid Note").unwrap();
    assert_eq!(note.name, "Valid Note");

    // Attempt to rename valid note with traversal in new name
    let res = rename_entry(&vault_dir, "Valid Note.md", "../Traversed Name");
    assert!(res.is_err(), "rename_entry with traversal in new name must be rejected");

    // Cleanup
    let _ = fs::remove_dir_all(&temp_root);
}

#[test]
fn test_legitimate_subfolder_operations_succeed() {
    let temp_root = std::env::temp_dir().join(format!("scalenote_sec_test_{}", Uuid::now_v7()));
    let vault_dir = temp_root.join("vault");
    fs::create_dir_all(&vault_dir).unwrap();

    // Valid canonicalization of vault root
    let canonical = canonicalize_vault_root(&vault_dir).unwrap();
    assert!(canonical.is_dir());

    // Create folder
    let folder = create_folder(&vault_dir, "", "Projects").unwrap();
    assert_eq!(folder.name, "Projects");
    assert_eq!(folder.path, "Projects");

    // Create note in subfolder
    let note = create_note(&vault_dir, "Projects", "ScaleNote Roadmap").unwrap();
    assert_eq!(note.name, "ScaleNote Roadmap");
    assert_eq!(note.path, "Projects/ScaleNote Roadmap.md");

    // Read note
    let content = read_note(&vault_dir, "Projects/ScaleNote Roadmap.md").unwrap();
    assert!(content.contains("# ScaleNote Roadmap"));

    // Write note
    let updated = format!("{}\nAdditional roadmap details", content);
    let written = write_note(&vault_dir, "Projects/ScaleNote Roadmap.md", &updated).unwrap();
    assert_eq!(written.path, "Projects/ScaleNote Roadmap.md");

    let read_back = read_note(&vault_dir, "Projects/ScaleNote Roadmap.md").unwrap();
    assert!(read_back.contains("Additional roadmap details"));

    // Cleanup
    let _ = fs::remove_dir_all(&temp_root);
}
