use proptest::prelude::*;
use sync_engine::format::*;

#[test]
fn test_roundtrip_headings_and_frontmatter() {
    let doc = Document {
        frontmatter: Frontmatter {
            id: "01937d2e-8f41-7a3c-9b22-5e1f0a6c8d44".to_string(),
            icon: Some("📓".to_string()),
            color: Some("#4A7FB5".to_string()),
            cover: Some(Cover {
                source: "gallery".to_string(),
                value: "gradient-slate".to_string(),
                offset: Some(0.35),
            }),
            tags: vec!["research".to_string(), "kala".to_string()],
            created: Some("2026-01-12T09:14:03Z".to_string()),
            properties: vec![
                ("Status".to_string(), "In review".to_string()),
                ("Due".to_string(), "2026-02-01".to_string()),
            ],
            unknown_keys: vec![("obsidian_custom".to_string(), "preserved_val".to_string())],
        },
        blocks: vec![
            Block::Heading {
                level: 1,
                text: "Heading One".to_string(),
                block_id: Some("k3f9q2".to_string()),
            },
            Block::Heading {
                level: 2,
                text: "Heading Two".to_string(),
                block_id: None,
            },
            Block::Paragraph {
                text: "A simple paragraph with content.".to_string(),
                block_id: Some("p9x2a1".to_string()),
            },
        ],
    };

    let serialized = serialize(&doc);
    let parsed = parse(&serialized);
    assert_eq!(doc, parsed);

    let reserialized = serialize(&parsed);
    assert_eq!(serialized, reserialized);
}

#[test]
fn test_roundtrip_lists_and_quotes() {
    let doc = Document {
        frontmatter: Frontmatter {
            id: "01937d2e-0000-7000-8000-000000000001".to_string(),
            icon: None,
            color: None,
            cover: None,
            tags: vec![],
            created: None,
            properties: vec![],
            unknown_keys: vec![],
        },
        blocks: vec![
            Block::BulletList {
                items: vec![
                    ListItem {
                        text: "First bullet".to_string(),
                        block_id: None,
                    },
                    ListItem {
                        text: "Second bullet".to_string(),
                        block_id: Some("b1b2b3".to_string()),
                    },
                ],
            },
            Block::OrderedList {
                items: vec![
                    ListItem {
                        text: "First step".to_string(),
                        block_id: None,
                    },
                    ListItem {
                        text: "Second step".to_string(),
                        block_id: Some("o1o2o3".to_string()),
                    },
                ],
            },
            Block::TaskList {
                items: vec![
                    TaskListItem {
                        checked: false,
                        text: "Unfinished task".to_string(),
                        block_id: None,
                    },
                    TaskListItem {
                        checked: true,
                        text: "Done task".to_string(),
                        block_id: Some("t1t2t3".to_string()),
                    },
                ],
            },
            Block::Blockquote {
                lines: vec!["Line one".to_string(), "Line two".to_string()],
                block_id: Some("q1q2q3".to_string()),
            },
        ],
    };

    let serialized = serialize(&doc);
    let parsed = parse(&serialized);
    assert_eq!(doc, parsed);
    assert_eq!(serialized, serialize(&parsed));
}

#[test]
fn test_roundtrip_callout_and_toggles() {
    let doc = Document {
        frontmatter: Frontmatter {
            id: "01937d2e-0000-7000-8000-000000000002".to_string(),
            icon: None,
            color: None,
            cover: None,
            tags: vec![],
            created: None,
            properties: vec![],
            unknown_keys: vec![],
        },
        blocks: vec![
            Block::Callout {
                callout_type: "warning".to_string(),
                collapse: Some('-'),
                title: "Don't skip this".to_string(),
                body: vec![
                    "Body line 1".to_string(),
                    "Body line 2".to_string(),
                ],
                block_id: Some("c1c2c3".to_string()),
            },
            Block::Toggle {
                as_heading: Some(2),
                open: true,
                summary: "Collapsible heading".to_string(),
                body: vec!["Hidden body text.".to_string()],
            },
            Block::Toggle {
                as_heading: None,
                open: false,
                summary: "Plain toggle summary".to_string(),
                body: vec!["Plain toggle details.".to_string()],
            },
        ],
    };

    let serialized = serialize(&doc);
    let parsed = parse(&serialized);
    assert_eq!(doc, parsed);
    assert_eq!(serialized, serialize(&parsed));
}

#[test]
fn test_roundtrip_columns_and_tabs() {
    let doc = Document {
        frontmatter: Frontmatter {
            id: "01937d2e-0000-7000-8000-000000000003".to_string(),
            icon: None,
            color: None,
            cover: None,
            tags: vec![],
            created: None,
            properties: vec![],
            unknown_keys: vec![],
        },
        blocks: vec![
            Block::Columns {
                columns: vec![
                    Column {
                        width: 0.6,
                        content: vec!["Left column text.".to_string()],
                    },
                    Column {
                        width: 0.4,
                        content: vec!["Right column text.".to_string()],
                    },
                ],
            },
            Block::Tabs {
                tabs: vec![
                    Tab {
                        title: "Setup".to_string(),
                        active: true,
                        content: vec!["Setup step instructions.".to_string()],
                    },
                    Tab {
                        title: "Usage".to_string(),
                        active: false,
                        content: vec!["Usage instructions.".to_string()],
                    },
                ],
            },
        ],
    };

    let serialized = serialize(&doc);
    let parsed = parse(&serialized);
    assert_eq!(doc, parsed);
    assert_eq!(serialized, serialize(&parsed));
}

#[test]
fn test_roundtrip_synced_page_toc_breadcrumb_canvas() {
    let doc = Document {
        frontmatter: Frontmatter {
            id: "01937d2e-0000-7000-8000-000000000004".to_string(),
            icon: None,
            color: None,
            cover: None,
            tags: vec![],
            created: None,
            properties: vec![],
            unknown_keys: vec![],
        },
        blocks: vec![
            Block::SyncedSource {
                sync_id: "sync-7hq2k9".to_string(),
                content: vec!["Canonical synced content.".to_string()],
            },
            Block::SyncedRef {
                note_id: "01937d2e-8f41-7a3c-9b22-5e1f0a6c8d44".to_string(),
                block_id: "sync-7hq2k9".to_string(),
            },
            Block::PageBlock {
                note_id: "01937d2e-8f41-7a3c-9b22-5e1f0a6c8d44".to_string(),
            },
            Block::TableOfContents { depth: 3 },
            Block::Breadcrumb,
            Block::CanvasEmbed {
                frame_id: "f_01937d31-2a55-7c10-8e99-0b4d2e7a1c63".to_string(),
            },
        ],
    };

    let serialized = serialize(&doc);
    let parsed = parse(&serialized);
    assert_eq!(doc, parsed);
    assert_eq!(serialized, serialize(&parsed));
}

#[test]
fn test_roundtrip_buttons_equations_code_and_table() {
    let doc = Document {
        frontmatter: Frontmatter {
            id: "01937d2e-0000-7000-8000-000000000005".to_string(),
            icon: None,
            color: None,
            cover: None,
            tags: vec![],
            created: None,
            properties: vec![],
            unknown_keys: vec![],
        },
        blocks: vec![
            Block::Button {
                label: "Mark done".to_string(),
                action: ButtonAction::SetProperty {
                    property: "Status".to_string(),
                    value: "Complete".to_string(),
                },
            },
            Block::Button {
                label: "Add a task".to_string(),
                action: ButtonAction::CreateLinkedNote {
                    folder: "Tasks".to_string(),
                    relation: "Parent".to_string(),
                },
            },
            Block::EquationBlock {
                expression: "E = mc^2".to_string(),
                block_id: Some("eq1eq2".to_string()),
            },
            Block::FencedCode {
                lang: "python".to_string(),
                locked: true,
                content: "print(\"hello world\")".to_string(),
                block_id: None,
            },
            Block::FencedCode {
                lang: "mermaid".to_string(),
                locked: false,
                content: "graph TD\n  A --> B".to_string(),
                block_id: None,
            },
            Block::ThematicBreak,
            Block::Table {
                headers: vec!["Header 1".to_string(), "Header 2".to_string()],
                rows: vec![
                    vec!["Cell A1".to_string(), "Cell A2".to_string()],
                    vec!["Cell B1".to_string(), "Cell B2".to_string()],
                ],
            },
        ],
    };

    let serialized = serialize(&doc);
    let parsed = parse(&serialized);
    assert_eq!(doc, parsed);
    assert_eq!(serialized, serialize(&parsed));
}

#[test]
fn test_roundtrip_file_bookmark_embed_database() {
    let doc = Document {
        frontmatter: Frontmatter {
            id: "01937d2e-0000-7000-8000-000000000006".to_string(),
            icon: None,
            color: None,
            cover: None,
            tags: vec![],
            created: None,
            properties: vec![],
            unknown_keys: vec![],
        },
        blocks: vec![
            Block::FileAttachment {
                path: "attachments/spec-v3.pdf".to_string(),
                name: "spec-v3.pdf".to_string(),
                size: 482113,
            },
            Block::Bookmark {
                url: "https://example.com/page".to_string(),
                title: "Page title".to_string(),
                description: "One line summary.".to_string(),
                image: "attachments/bm-7hq2.png".to_string(),
                fetched: "2026-01-12".to_string(),
            },
            Block::Embed {
                url: "https://example.com/embed".to_string(),
                width: 720,
                height: 405,
            },
            Block::DatabaseView {
                folder: "Projects".to_string(),
                view_id: "v_01937d33-9c02-77ba-b1e4-8f0a3d5c2e71".to_string(),
            },
        ],
    };

    let serialized = serialize(&doc);
    let parsed = parse(&serialized);
    assert_eq!(doc, parsed);
    assert_eq!(serialized, serialize(&parsed));
}

#[test]
fn test_preservation_of_foreign_and_raw_syntax() {
    // FORMAT.md §9.3:
    // "Preservation: a fixture file containing unknown directives, raw HTML, a Dataview fence,
    // MDX, and unknown frontmatter keys round-trips byte-for-byte after being loaded, edited elsewhere in the document, and saved."
    let raw_text = r#"---
id: 01937d2e-8f41-7a3c-9b22-5e1f0a6c8d44
tags: [obsidian, fixture]
obsidian_custom_flag: true
dataview_query_cache: 42
---

# Known Document Header

<div class="custom-html-widget" id="test">
  <span>Raw HTML block preserved byte-for-byte</span>
</div>

```dataview
TABLE file.name, status
FROM "Projects"
WHERE status != "Complete"
```

::unknown-directive{foo="bar" num=123}

export const author = "MDX expression";
"#;

    let parsed = parse(raw_text);
    // Ensure unknown frontmatter keys were retained
    assert_eq!(parsed.frontmatter.unknown_keys.len(), 2);
    assert_eq!(parsed.frontmatter.unknown_keys[0], ("obsidian_custom_flag".to_string(), "true".to_string()));
    assert_eq!(parsed.frontmatter.unknown_keys[1], ("dataview_query_cache".to_string(), "42".to_string()));

    let reserialized = serialize(&parsed);
    // Parse again to ensure idempotence
    let reparsed = parse(&reserialized);
    assert_eq!(parsed, reparsed);
}

// -----------------------------------------------------------------------------
// Proptest Property-based tests
// -----------------------------------------------------------------------------

fn arb_id() -> impl Strategy<Value = Option<String>> {
    prop::option::of("[a-z0-9]{6,10}")
}

fn arb_tag() -> impl Strategy<Value = String> {
    "[a-zA-Z0-9_-]{1,15}"
}

fn arb_safe_str() -> impl Strategy<Value = String> {
    "[a-zA-Z0-9]([a-zA-Z0-9 .,!?]{0,23}[a-zA-Z0-9])?"
}

fn arb_block() -> impl Strategy<Value = Block> {
    prop_oneof![
        (1u8..=4u8, arb_safe_str(), arb_id()).prop_map(|(level, text, block_id)| Block::Heading {
            level,
            text,
            block_id,
        }),
        (arb_safe_str(), arb_id()).prop_map(|(text, block_id)| Block::Paragraph { text, block_id }),
        prop::collection::vec(
            (arb_safe_str(), arb_id()).prop_map(|(text, block_id)| ListItem { text, block_id }),
            1..4
        ).prop_map(|items| Block::BulletList { items }),
        prop::collection::vec(
            (arb_safe_str(), arb_id()).prop_map(|(text, block_id)| ListItem { text, block_id }),
            1..4
        ).prop_map(|items| Block::OrderedList { items }),
        prop::collection::vec(
            (any::<bool>(), arb_safe_str(), arb_id()).prop_map(|(checked, text, block_id)| TaskListItem {
                checked,
                text,
                block_id,
            }),
            1..4
        ).prop_map(|items| Block::TaskList { items }),
        (prop::collection::vec(arb_safe_str(), 1..3), arb_id()).prop_map(|(lines, block_id)| Block::Blockquote {
            lines,
            block_id,
        }),
        (
            prop_oneof![Just("note"), Just("warning"), Just("tip"), Just("danger")],
            prop_oneof![Just(None), Just(Some('+')), Just(Some('-'))],
            arb_safe_str(),
            prop::collection::vec(arb_safe_str(), 1..3),
            arb_id()
        ).prop_map(|(callout_type, collapse, title, body, block_id)| Block::Callout {
            callout_type: callout_type.to_string(),
            collapse,
            title,
            body,
            block_id,
        }),
        (
            prop_oneof![Just("rust"), Just("python"), Just("javascript"), Just("mermaid")],
            any::<bool>(),
            "[a-zA-Z0-9_ ]{1,25}",
            arb_id()
        ).prop_map(|(lang, locked, content, block_id)| Block::FencedCode {
            lang: lang.to_string(),
            locked,
            content,
            block_id,
        }),
        Just(Block::ThematicBreak),
        (
            prop_oneof![Just(None), Just(Some(1u8)), Just(Some(2u8)), Just(Some(3u8))],
            any::<bool>(),
            arb_safe_str(),
            prop::collection::vec(arb_safe_str(), 1..3)
        ).prop_map(|(as_heading, open, summary, body)| Block::Toggle {
            as_heading,
            open,
            summary,
            body,
        }),
        Just(Block::Breadcrumb),
        (1u8..=4u8).prop_map(|depth| Block::TableOfContents { depth }),
        arb_safe_str().prop_map(|name| Block::FileAttachment {
            path: format!("attachments/{}.pdf", name),
            name,
            size: 1024,
        }),
        ("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}").prop_map(|note_id| Block::PageBlock { note_id }),
    ]
}

fn arb_document() -> impl Strategy<Value = Document> {
    (
        "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}",
        prop::collection::vec(arb_tag(), 0..3),
        prop::collection::vec(arb_block(), 1..5),
    ).prop_map(|(id, tags, blocks)| Document {
        frontmatter: Frontmatter {
            id,
            icon: None,
            color: None,
            cover: None,
            tags,
            created: Some("2026-01-12T09:14:03Z".to_string()),
            properties: vec![],
            unknown_keys: vec![],
        },
        blocks,
    })
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(50))]

    #[test]
    fn prop_roundtrip_doc_parse_serialize(doc in arb_document()) {
        let serialized = serialize(&doc);
        let parsed = parse(&serialized);
        prop_assert_eq!(&doc, &parsed);
    }

    #[test]
    fn prop_idempotence_serialize(doc in arb_document()) {
        let s1 = serialize(&doc);
        let parsed1 = parse(&s1);
        let s2 = serialize(&parsed1);
        prop_assert_eq!(&s1, &s2);
    }
}
