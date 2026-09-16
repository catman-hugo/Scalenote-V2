use std::fs;
use uuid::Uuid;
use yrs::types::DefaultPrelim;
use yrs::{Doc, GetString, ReadTxn, Text, Transact, WriteTxn, XmlFragment};

use scalenote_lib::vault::{create_note, read_note, write_note};
use sync_engine::snapshot::{load_snapshot, save_snapshot, snapshot_path, SnapshotStatus};

#[test]
fn test_crdt_editor_binding_snapshot_lifecycle() {
    // 1. Setup isolated vault directory
    let temp_vault = std::env::temp_dir().join(format!("scalenote_crdt_test_{}", Uuid::now_v7()));
    fs::create_dir_all(&temp_vault).unwrap();
    let crdt_dir = temp_vault.join(".scalenote").join("crdt");
    fs::create_dir_all(&crdt_dir).unwrap();

    // 2. Create note on disk (assigns UUIDv7 id in frontmatter)
    let note = create_note(&temp_vault, "", "Integration Note").unwrap();
    let note_id = note.id.clone();
    let initial_markdown = read_note(&temp_vault, &note.path).unwrap();
    assert!(initial_markdown.contains(&format!("id: {}", note_id)));
    assert!(initial_markdown.contains("# Integration Note"));

    // 3. Initialize Y.Doc and apply edit to the block tree (Y.XmlFragment)
    // docs/ARCHITECTURE.md: "The block tree is the document... content is a Y.XmlFragment holding the block tree"
    let doc = Doc::new();
    {
        let mut txn = doc.transact_mut();
        let fragment = txn.get_or_insert_xml_fragment("default");

        // Insert a heading block
        let heading = fragment.push_back(&mut txn, yrs::types::xml::XmlElementPrelim::empty("heading"));
        let heading_text = heading.push_back(&mut txn, yrs::XmlTextRef::default_prelim());
        heading_text.push(&mut txn, "Integration Note");
        assert_eq!(heading_text.get_string(&txn), "Integration Note");

        // Insert a paragraph block representing new edit
        let paragraph = fragment.push_back(&mut txn, yrs::types::xml::XmlElementPrelim::empty("paragraph"));
        let para_text = paragraph.push_back(&mut txn, yrs::XmlTextRef::default_prelim());
        para_text.push(&mut txn, "First paragraph authored in block mode.");
        assert_eq!(para_text.get_string(&txn), "First paragraph authored in block mode.");
    }

    // Projected markdown corresponding to the block tree edit
    let edited_markdown = format!(
        "---\nid: {}\ncreated: {}\n---\n\n# Integration Note\n\nFirst paragraph authored in block mode.\n",
        note_id, note.created
    );
    write_note(&temp_vault, &note.path, &edited_markdown).unwrap();

    // 4. Trigger snapshot save to .scalenote/crdt/<note-id>.bin
    save_snapshot(&crdt_dir, &note_id, &doc, &edited_markdown).unwrap();

    let snap_file = snapshot_path(&crdt_dir, &note_id);
    assert!(snap_file.exists(), "Snapshot file must be written atomically to .scalenote/crdt/<note-id>.bin");

    // 5. Completely discard the in-memory document (simulating app quit / restart)
    drop(doc);

    // 6. Reload from disk fresh
    let current_disk_markdown = read_note(&temp_vault, &note.path).unwrap();
    let (reloaded_doc_opt, status) = load_snapshot(&crdt_dir, &note_id, &current_disk_markdown).unwrap();

    // 7. Verify snapshot reloaded with matching history
    assert_eq!(status, SnapshotStatus::Loaded, "Snapshot status must be Loaded when markdown matches");
    let reloaded_doc = reloaded_doc_opt.expect("Reloaded document must be present");

    // 8. Inspect the reloaded Y.XmlFragment block tree and assert exact content match
    {
        let txn = reloaded_doc.transact();
        let fragment = txn.get_xml_fragment("default").expect("Fragment 'default' must exist");
        assert_eq!(fragment.len(&txn), 2, "Must contain exactly 2 blocks (heading and paragraph)");

        let block0 = fragment.get(&txn, 0).unwrap().into_xml_element().unwrap();
        let block1 = fragment.get(&txn, 1).unwrap().into_xml_element().unwrap();

        assert_eq!(block0.tag().as_ref(), "heading");
        let h_text = block0.get(&txn, 0).unwrap().into_xml_text().unwrap();
        assert_eq!(h_text.get_string(&txn), "Integration Note");

        assert_eq!(block1.tag().as_ref(), "paragraph");
        let p_text = block1.get(&txn, 0).unwrap().into_xml_text().unwrap();
        assert_eq!(p_text.get_string(&txn), "First paragraph authored in block mode.");
    }

    // 9. Test external edit resilience:
    // When markdown is edited externally outside ScaleNote, file on disk wins and stale snapshot is discarded
    let external_markdown = format!(
        "---\nid: {}\ncreated: {}\n---\n\n# Integration Note\n\nExternal change by vim\n",
        note_id, note.created
    );
    write_note(&temp_vault, &note.path, &external_markdown).unwrap();

    let (mismatch_doc, mismatch_status) = load_snapshot(&crdt_dir, &note_id, &external_markdown).unwrap();
    assert!(
        matches!(mismatch_status, SnapshotStatus::HashMismatch { .. }),
        "Must detect hash mismatch when disk content was modified externally"
    );
    assert!(mismatch_doc.is_none(), "Stale document must be discarded so file on disk wins");

    // Cleanup
    let _ = fs::remove_dir_all(&temp_vault);
}
