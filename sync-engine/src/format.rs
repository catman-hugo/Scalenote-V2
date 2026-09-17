//! ScaleNote file format parser and serializer per FORMAT.md.
//!
//! Enforces:
//! 1. Deterministic serialization (ATX headings, LF line endings, one blank line between top blocks).
//! 2. Round-trip correctness: `parse(serialize(doc)) == doc` and `serialize(parse(text)) == text`.
//! 3. Preservation of unknown / raw content without dropping data.

use std::collections::BTreeMap;

#[derive(Debug, Clone, PartialEq)]
pub struct Document {
    pub frontmatter: Frontmatter,
    pub blocks: Vec<Block>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Frontmatter {
    pub id: String,
    pub icon: Option<String>,
    pub color: Option<String>,
    pub cover: Option<Cover>,
    pub tags: Vec<String>,
    pub created: Option<String>,
    pub properties: Vec<(String, String)>,
    pub unknown_keys: Vec<(String, String)>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Cover {
    pub source: String, // "gallery" | "file"
    pub value: String,  // gallery ID or path
    pub offset: Option<f64>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum Block {
    Heading {
        level: u8, // 1..=4
        text: String,
        block_id: Option<String>,
    },
    Paragraph {
        text: String,
        block_id: Option<String>,
    },
    BulletList {
        items: Vec<ListItem>,
    },
    OrderedList {
        items: Vec<ListItem>,
    },
    TaskList {
        items: Vec<TaskListItem>,
    },
    Blockquote {
        lines: Vec<String>,
        block_id: Option<String>,
    },
    Callout {
        callout_type: String,
        collapse: Option<char>, // '+' or '-'
        title: String,
        body: Vec<String>,
        block_id: Option<String>,
    },
    FencedCode {
        lang: String,
        locked: bool,
        content: String,
        block_id: Option<String>,
    },
    ThematicBreak,
    Table {
        headers: Vec<String>,
        rows: Vec<Vec<String>>,
    },
    Toggle {
        as_heading: Option<u8>,
        open: bool,
        summary: String,
        body: Vec<String>,
    },
    Columns {
        columns: Vec<Column>,
    },
    Tabs {
        tabs: Vec<Tab>,
    },
    SyncedSource {
        sync_id: String,
        content: Vec<String>,
    },
    SyncedRef {
        note_id: String,
        block_id: String,
    },
    PageBlock {
        note_id: String,
    },
    TableOfContents {
        depth: u8,
    },
    Breadcrumb,
    CanvasEmbed {
        frame_id: String,
    },
    Button {
        label: String,
        action: ButtonAction,
    },
    EquationBlock {
        expression: String,
        block_id: Option<String>,
    },
    FileAttachment {
        path: String,
        name: String,
        size: u64,
    },
    Bookmark {
        url: String,
        title: String,
        description: String,
        image: String,
        fetched: String,
    },
    Embed {
        url: String,
        width: u32,
        height: u32,
    },
    DatabaseView {
        folder: String,
        view_id: String,
    },
    Raw {
        content: String,
    },
}

#[derive(Debug, Clone, PartialEq)]
pub struct ListItem {
    pub text: String,
    pub block_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct TaskListItem {
    pub checked: bool,
    pub text: String,
    pub block_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Column {
    pub width: f64,
    pub content: Vec<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Tab {
    pub title: String,
    pub active: bool,
    pub content: Vec<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum ButtonAction {
    SetProperty { property: String, value: String },
    CreateLinkedNote { folder: String, relation: String },
    Unknown(String),
}

// -----------------------------------------------------------------------------
// Attribute parser and serializer
// -----------------------------------------------------------------------------

pub fn parse_attributes(attr_str: &str) -> Vec<(String, String)> {
    let mut attrs = Vec::new();
    let mut chars = attr_str.trim().chars().peekable();

    while let Some(&c) = chars.peek() {
        if c.is_whitespace() {
            chars.next();
            continue;
        }

        if c == '#' {
            chars.next();
            let mut id = String::new();
            while let Some(&ic) = chars.peek() {
                if ic.is_whitespace() || ic == '}' {
                    break;
                }
                id.push(ic);
                chars.next();
            }
            if !id.is_empty() {
                attrs.push(("#".to_string(), id));
            }
            continue;
        }

        let mut key = String::new();
        while let Some(&kc) = chars.peek() {
            if kc == '=' || kc.is_whitespace() || kc == '}' {
                break;
            }
            key.push(kc);
            chars.next();
        }

        if key.is_empty() {
            chars.next();
            continue;
        }

        if let Some(&'=') = chars.peek() {
            chars.next(); // skip '='
            let mut val = String::new();
            if let Some(&'"') = chars.peek() {
                chars.next(); // skip opening quote
                let mut escaped = false;
                while let Some(vc) = chars.next() {
                    if escaped {
                        val.push(vc);
                        escaped = false;
                    } else if vc == '\\' {
                        escaped = true;
                    } else if vc == '"' {
                        break;
                    } else {
                        val.push(vc);
                    }
                }
            } else {
                while let Some(&vc) = chars.peek() {
                    if vc.is_whitespace() || vc == '}' {
                        break;
                    }
                    val.push(vc);
                    chars.next();
                }
            }
            attrs.push((key, val));
        } else {
            // Bare boolean flag
            attrs.push((key, "true".to_string()));
        }
    }

    attrs
}

pub fn escape_attr_value(val: &str) -> String {
    if val.contains(' ') || val.contains('"') || val.contains('}') || val.contains('\n') || val.is_empty() {
        let mut s = String::with_capacity(val.len() + 2);
        s.push('"');
        for c in val.chars() {
            if c == '"' || c == '\\' {
                s.push('\\');
            }
            s.push(c);
        }
        s.push('"');
        s
    } else {
        val.to_string()
    }
}

// -----------------------------------------------------------------------------
// Block ID extraction helper
// -----------------------------------------------------------------------------

fn extract_block_id(line: &str) -> (&str, Option<String>) {
    let trimmed = line.trim_end();
    if let Some(pos) = trimmed.rfind(" ^") {
        let candidate = &trimmed[pos + 2..];
        if candidate.len() >= 6 && candidate.len() <= 12 && candidate.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit()) {
            return (&trimmed[..pos], Some(candidate.to_string()));
        }
    }
    (line, None)
}

// -----------------------------------------------------------------------------
// Serialization
// -----------------------------------------------------------------------------

pub fn serialize(doc: &Document) -> String {
    let mut out = String::new();

    // 1. Frontmatter
    out.push_str("---\n");
    out.push_str(&format!("id: {}\n", doc.frontmatter.id));
    if let Some(ref icon) = doc.frontmatter.icon {
        out.push_str(&format!("icon: \"{}\"\n", icon));
    }
    if let Some(ref color) = doc.frontmatter.color {
        out.push_str(&format!("color: \"{}\"\n", color));
    }
    if let Some(ref cover) = doc.frontmatter.cover {
        out.push_str("cover:\n");
        out.push_str(&format!("  source: {}\n", cover.source));
        out.push_str(&format!("  value: {}\n", cover.value));
        if let Some(off) = cover.offset {
            out.push_str(&format!("  offset: {}\n", off));
        }
    }
    if !doc.frontmatter.tags.is_empty() {
        out.push_str(&format!("tags: [{}]\n", doc.frontmatter.tags.join(", ")));
    }
    if let Some(ref created) = doc.frontmatter.created {
        out.push_str(&format!("created: {}\n", created));
    }
    if !doc.frontmatter.properties.is_empty() {
        out.push_str("properties:\n");
        for (k, v) in &doc.frontmatter.properties {
            out.push_str(&format!("  {}: {}\n", k, v));
        }
    }
    for (k, v) in &doc.frontmatter.unknown_keys {
        out.push_str(&format!("{}: {}\n", k, v));
    }
    out.push_str("---\n");

    // 2. Blocks
    for (i, block) in doc.blocks.iter().enumerate() {
        if i == 0 {
            out.push('\n');
        } else {
            out.push_str("\n\n");
        }
        serialize_block(&mut out, block);
    }
    out.push('\n');

    out
}

fn serialize_block(out: &mut String, block: &Block) {
    match block {
        Block::Heading { level, text, block_id } => {
            let hashes = "#".repeat(*level as usize);
            out.push_str(&hashes);
            let trimmed = text.trim();
            if !trimmed.is_empty() {
                out.push(' ');
                out.push_str(trimmed);
            }
            if let Some(id) = block_id {
                out.push_str(&format!(" ^{}", id));
            }
        }
        Block::Paragraph { text, block_id } => {
            out.push_str(text.trim());
            if let Some(id) = block_id {
                out.push_str(&format!(" ^{}", id));
            }
        }
        Block::BulletList { items } => {
            for (idx, item) in items.iter().enumerate() {
                if idx > 0 {
                    out.push('\n');
                }
                out.push_str("- ");
                out.push_str(&item.text);
                if let Some(ref id) = item.block_id {
                    out.push_str(&format!(" ^{}", id));
                }
            }
        }
        Block::OrderedList { items } => {
            for (idx, item) in items.iter().enumerate() {
                if idx > 0 {
                    out.push('\n');
                }
                out.push_str(&format!("{}. ", idx + 1));
                out.push_str(&item.text);
                if let Some(ref id) = item.block_id {
                    out.push_str(&format!(" ^{}", id));
                }
            }
        }
        Block::TaskList { items } => {
            for (idx, item) in items.iter().enumerate() {
                if idx > 0 {
                    out.push('\n');
                }
                let mark = if item.checked { "x" } else { " " };
                out.push_str(&format!("- [{}] ", mark));
                out.push_str(&item.text);
                if let Some(ref id) = item.block_id {
                    out.push_str(&format!(" ^{}", id));
                }
            }
        }
        Block::Blockquote { lines, block_id } => {
            for (idx, line) in lines.iter().enumerate() {
                if idx > 0 {
                    out.push('\n');
                }
                out.push_str("> ");
                out.push_str(line);
            }
            if let Some(id) = block_id {
                out.push_str(&format!(" ^{}", id));
            }
        }
        Block::Callout { callout_type, collapse, title, body, block_id } => {
            let col_str = match collapse {
                Some('+') => "+",
                Some('-') => "-",
                _ => "",
            };
            let trimmed_title = title.trim();
            if trimmed_title.is_empty() {
                out.push_str(&format!("> [!{}{}]", callout_type, col_str));
            } else {
                out.push_str(&format!("> [!{}{}] {}", callout_type, col_str, trimmed_title));
            }
            for line in body {
                out.push_str("\n> ");
                out.push_str(line);
            }
            if let Some(id) = block_id {
                out.push_str(&format!(" ^{}", id));
            }
        }
        Block::FencedCode { lang, locked, content, block_id } => {
            let lock_str = if *locked { " {locked}" } else { "" };
            out.push_str(&format!("```{}{}\n", lang, lock_str));
            let clean = content.trim_end_matches('\n');
            if !clean.is_empty() {
                out.push_str(clean);
                out.push('\n');
            }
            out.push_str("```");
            if let Some(id) = block_id {
                out.push_str(&format!(" ^{}", id));
            }
        }
        Block::ThematicBreak => {
            out.push_str("---");
        }
        Block::Table { headers, rows } => {
            out.push_str("| ");
            out.push_str(&headers.join(" | "));
            out.push_str(" |\n| ");
            let seps: Vec<String> = headers.iter().map(|_| "---".to_string()).collect();
            out.push_str(&seps.join(" | "));
            out.push_str(" |");
            for row in rows {
                out.push_str("\n| ");
                out.push_str(&row.join(" | "));
                out.push_str(" |");
            }
        }
        Block::Toggle { as_heading, open, summary, body } => {
            let mut attrs = Vec::new();
            if let Some(h) = as_heading {
                attrs.push(format!("as=h{}", h));
            }
            if *open {
                attrs.push("open".to_string());
            }
            let attr_suffix = if attrs.is_empty() {
                String::new()
            } else {
                format!("{{{}}}", attrs.join(" "))
            };

            out.push_str(&format!(":::toggle{}\n", attr_suffix));
            if let Some(h) = as_heading {
                out.push_str(&format!("{} {}\n\n", "#".repeat(*h as usize), summary));
            } else {
                out.push_str(summary);
                out.push_str("\n\n");
            }
            out.push_str(&body.join("\n"));
            if !body.is_empty() && !out.ends_with('\n') {
                out.push('\n');
            }
            out.push_str(":::");
        }
        Block::Columns { columns } => {
            out.push_str("::::columns\n");
            for (idx, col) in columns.iter().enumerate() {
                if idx > 0 {
                    out.push('\n');
                }
                out.push_str(&format!(":::column{{width={}}}\n", col.width));
                out.push_str(&col.content.join("\n"));
                if !col.content.is_empty() && !out.ends_with('\n') {
                    out.push('\n');
                }
                out.push_str(":::\n");
            }
            out.push_str("::::");
        }
        Block::Tabs { tabs } => {
            out.push_str("::::tabs\n");
            for (idx, tab) in tabs.iter().enumerate() {
                if idx > 0 {
                    out.push('\n');
                }
                let active_str = if tab.active { " active" } else { "" };
                out.push_str(&format!(":::tab{{title={}{}}}\n", escape_attr_value(&tab.title), active_str));
                out.push_str(&tab.content.join("\n"));
                if !tab.content.is_empty() && !out.ends_with('\n') {
                    out.push('\n');
                }
                out.push_str(":::\n");
            }
            out.push_str("::::");
        }
        Block::SyncedSource { sync_id, content } => {
            out.push_str(&format!(":::synced{{#{}}}\n", sync_id));
            out.push_str(&content.join("\n"));
            if !content.is_empty() && !out.ends_with('\n') {
                out.push('\n');
            }
            out.push_str(":::");
        }
        Block::SyncedRef { note_id, block_id } => {
            out.push_str(&format!("::synced-ref{{note={} block={}}}", note_id, block_id));
        }
        Block::PageBlock { note_id } => {
            out.push_str(&format!("::page{{note={}}}", note_id));
        }
        Block::TableOfContents { depth } => {
            out.push_str(&format!("::toc{{depth={}}}", depth));
        }
        Block::Breadcrumb => {
            out.push_str("::breadcrumb");
        }
        Block::CanvasEmbed { frame_id } => {
            out.push_str(&format!("::canvas{{frame={}}}", frame_id));
        }
        Block::Button { label, action } => match action {
            ButtonAction::SetProperty { property, value } => {
                out.push_str(&format!(
                    "::button{{label={} action=set-property property={} value={}}}",
                    escape_attr_value(label),
                    escape_attr_value(property),
                    escape_attr_value(value)
                ));
            }
            ButtonAction::CreateLinkedNote { folder, relation } => {
                out.push_str(&format!(
                    "::button{{label={} action=create-linked-note folder={} relation={}}}",
                    escape_attr_value(label),
                    escape_attr_value(folder),
                    escape_attr_value(relation)
                ));
            }
            ButtonAction::Unknown(raw) => {
                out.push_str(&format!("::button{{label={} {}}}", escape_attr_value(label), raw));
            }
        },
        Block::EquationBlock { expression, block_id } => {
            out.push_str("$$\n");
            let clean = expression.trim_end_matches('\n');
            if !clean.is_empty() {
                out.push_str(clean);
                out.push('\n');
            }
            out.push_str("$$");
            if let Some(id) = block_id {
                out.push_str(&format!(" ^{}", id));
            }
        }
        Block::FileAttachment { path, name, size } => {
            out.push_str(&format!(
                "::file{{path={} name={} size={}}}",
                escape_attr_value(path),
                escape_attr_value(name),
                size
            ));
        }
        Block::Bookmark { url, title, description, image, fetched } => {
            out.push_str(&format!(
                "::bookmark{{url={} title={} description={} image={} fetched={}}}",
                escape_attr_value(url),
                escape_attr_value(title),
                escape_attr_value(description),
                escape_attr_value(image),
                fetched
            ));
        }
        Block::Embed { url, width, height } => {
            out.push_str(&format!("::embed{{url={} width={} height={}}}", escape_attr_value(url), width, height));
        }
        Block::DatabaseView { folder, view_id } => {
            out.push_str(&format!("::database{{folder={} view={}}}", escape_attr_value(folder), view_id));
        }
        Block::Raw { content } => {
            out.push_str(content);
        }
    }
}

// -----------------------------------------------------------------------------
// Parsing
// -----------------------------------------------------------------------------

pub fn parse(input: &str) -> Document {
    let (frontmatter, body) = parse_frontmatter(input);
    let blocks = parse_blocks(body);
    Document { frontmatter, blocks }
}

fn parse_frontmatter(input: &str) -> (Frontmatter, &str) {
    let trimmed = input.trim_start();
    if !trimmed.starts_with("---") {
        return (
            Frontmatter {
                id: String::new(),
                icon: None,
                color: None,
                cover: None,
                tags: Vec::new(),
                created: None,
                properties: Vec::new(),
                unknown_keys: Vec::new(),
            },
            input,
        );
    }

    let rest = &trimmed[3..];
    let end_idx = match rest.find("\n---") {
        Some(idx) => idx,
        None => {
            return (
                Frontmatter {
                    id: String::new(),
                    icon: None,
                    color: None,
                    cover: None,
                    tags: Vec::new(),
                    created: None,
                    properties: Vec::new(),
                    unknown_keys: Vec::new(),
                },
                input,
            );
        }
    };

    let fm_text = &rest[..end_idx];
    let body_part = &rest[end_idx + 4..]; // skip "\n---"
    let body_part = body_part.strip_prefix('\n').unwrap_or(body_part);

    let mut id = String::new();
    let mut icon = None;
    let mut color = None;
    let mut cover: Option<Cover> = None;
    let mut tags = Vec::new();
    let mut created = None;
    let mut properties = Vec::new();
    let mut unknown_keys = Vec::new();

    let mut in_cover = false;
    let mut in_properties = false;

    for line in fm_text.lines() {
        let trimmed_line = line.trim();
        if trimmed_line.is_empty() {
            continue;
        }

        if in_cover {
            if line.starts_with("  ") {
                let sub = trimmed_line;
                if let Some(val) = sub.strip_prefix("source:") {
                    if let Some(c) = cover.as_mut() {
                        c.source = val.trim().to_string();
                    }
                } else if let Some(val) = sub.strip_prefix("value:") {
                    if let Some(c) = cover.as_mut() {
                        c.value = val.trim().to_string();
                    }
                } else if let Some(val) = sub.strip_prefix("offset:") {
                    if let Some(c) = cover.as_mut() {
                        c.offset = val.trim().parse::<f64>().ok();
                    }
                }
                continue;
            } else {
                in_cover = false;
            }
        }

        if in_properties {
            if line.starts_with("  ") {
                if let Some(colon_idx) = trimmed_line.find(':') {
                    let k = trimmed_line[..colon_idx].trim().to_string();
                    let v = trimmed_line[colon_idx + 1..].trim().to_string();
                    properties.push((k, v));
                }
                continue;
            } else {
                in_properties = false;
            }
        }

        if let Some(val) = trimmed_line.strip_prefix("id:") {
            id = val.trim().trim_matches('"').to_string();
        } else if let Some(val) = trimmed_line.strip_prefix("icon:") {
            icon = Some(val.trim().trim_matches('"').to_string());
        } else if let Some(val) = trimmed_line.strip_prefix("color:") {
            color = Some(val.trim().trim_matches('"').to_string());
        } else if trimmed_line == "cover:" {
            in_cover = true;
            cover = Some(Cover {
                source: String::new(),
                value: String::new(),
                offset: None,
            });
        } else if let Some(val) = trimmed_line.strip_prefix("tags:") {
            let inner = val.trim().trim_matches('[').trim_matches(']');
            tags = inner.split(',').map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect();
        } else if let Some(val) = trimmed_line.strip_prefix("created:") {
            created = Some(val.trim().to_string());
        } else if trimmed_line == "properties:" {
            in_properties = true;
        } else if let Some(colon_idx) = trimmed_line.find(':') {
            let k = trimmed_line[..colon_idx].trim().to_string();
            let v = trimmed_line[colon_idx + 1..].trim().to_string();
            unknown_keys.push((k, v));
        }
    }

    (
        Frontmatter {
            id,
            icon,
            color,
            cover,
            tags,
            created,
            properties,
            unknown_keys,
        },
        body_part,
    )
}

fn parse_blocks(body: &str) -> Vec<Block> {
    let mut blocks = Vec::new();
    let lines: Vec<&str> = body.lines().collect();
    let mut idx = 0;

    while idx < lines.len() {
        let line = lines[idx];

        // Skip blank lines
        if line.trim().is_empty() {
            idx += 1;
            continue;
        }

        // 1. Containers: ::::columns or ::::tabs
        if line.starts_with("::::columns") {
            let mut col_lines = Vec::new();
            idx += 1;
            while idx < lines.len() && !lines[idx].starts_with("::::") {
                col_lines.push(lines[idx]);
                idx += 1;
            }
            if idx < lines.len() && lines[idx].starts_with("::::") {
                idx += 1;
            }
            blocks.push(parse_columns(&col_lines));
            continue;
        }

        if line.starts_with("::::tabs") {
            let mut tab_lines = Vec::new();
            idx += 1;
            while idx < lines.len() && !lines[idx].starts_with("::::") {
                tab_lines.push(lines[idx]);
                idx += 1;
            }
            if idx < lines.len() && lines[idx].starts_with("::::") {
                idx += 1;
            }
            blocks.push(parse_tabs(&tab_lines));
            continue;
        }

        // 2. Container directives: :::toggle or :::synced
        if line.starts_with(":::toggle") {
            let attr_part = line.strip_prefix(":::toggle").unwrap_or("");
            let attrs = parse_attributes(attr_part.trim_matches(|c| c == '{' || c == '}'));
            let mut as_heading = None;
            let mut open = false;
            for (k, v) in attrs {
                if k == "as" {
                    if let Some(h) = v.strip_prefix('h').and_then(|s| s.parse::<u8>().ok()) {
                        as_heading = Some(h);
                    }
                } else if k == "open" {
                    open = true;
                }
            }

            let mut toggle_lines = Vec::new();
            idx += 1;
            while idx < lines.len() && !lines[idx].starts_with(":::") {
                toggle_lines.push(lines[idx]);
                idx += 1;
            }
            if idx < lines.len() && lines[idx].starts_with(":::") {
                idx += 1;
            }

            let (summary, body_lines) = parse_toggle_content(&toggle_lines, as_heading);
            blocks.push(Block::Toggle {
                as_heading,
                open,
                summary,
                body: body_lines,
            });
            continue;
        }

        if line.starts_with(":::synced") {
            let attr_part = line.strip_prefix(":::synced").unwrap_or("");
            let attrs = parse_attributes(attr_part.trim_matches(|c| c == '{' || c == '}'));
            let sync_id = attrs.iter().find(|(k, _)| k == "#").map(|(_, v)| v.clone()).unwrap_or_default();

            let mut synced_lines = Vec::new();
            idx += 1;
            while idx < lines.len() && !lines[idx].starts_with(":::") {
                synced_lines.push(lines[idx].to_string());
                idx += 1;
            }
            if idx < lines.len() && lines[idx].starts_with(":::") {
                idx += 1;
            }
            blocks.push(Block::SyncedSource {
                sync_id,
                content: synced_lines,
            });
            continue;
        }

        // 3. Leaf directives: ::name{...}
        if line.starts_with("::") && !line.starts_with(":::") {
            if let Some(block) = parse_leaf_directive(line) {
                blocks.push(block);
                idx += 1;
                continue;
            }
        }

        // 4. Equation block: $$ ... $$
        if line.trim() == "$$" {
            idx += 1;
            let mut expr_lines = Vec::new();
            let mut block_id = None;
            while idx < lines.len() {
                let eq_line = lines[idx];
                if eq_line.starts_with("$$") {
                    let (_, id) = extract_block_id(eq_line);
                    block_id = id;
                    idx += 1;
                    break;
                }
                expr_lines.push(eq_line);
                idx += 1;
            }
            blocks.push(Block::EquationBlock {
                expression: expr_lines.join("\n"),
                block_id,
            });
            continue;
        }

        // 5. Fenced code block
        if line.starts_with("```") {
            let fence_info = line.strip_prefix("```").unwrap_or("").trim();
            let (lang, locked) = if fence_info.ends_with("{locked}") {
                let l = fence_info.strip_suffix("{locked}").unwrap_or("").trim();
                (l.to_string(), true)
            } else {
                (fence_info.to_string(), false)
            };

            idx += 1;
            let mut code_lines = Vec::new();
            let mut block_id = None;
            while idx < lines.len() {
                let c_line = lines[idx];
                if c_line.starts_with("```") {
                    let (_, id) = extract_block_id(c_line);
                    block_id = id;
                    idx += 1;
                    break;
                }
                code_lines.push(c_line);
                idx += 1;
            }
            blocks.push(Block::FencedCode {
                lang,
                locked,
                content: code_lines.join("\n"),
                block_id,
            });
            continue;
        }

        // 6. Thematic break
        if line.trim() == "---" {
            blocks.push(Block::ThematicBreak);
            idx += 1;
            continue;
        }

        // 7. Callout: > [!type]
        if line.starts_with("> [!") {
            let mut callout_lines = Vec::new();
            while idx < lines.len() && lines[idx].starts_with('>') {
                let stripped = lines[idx].strip_prefix('>').unwrap_or(lines[idx]);
                let stripped = stripped.strip_prefix(' ').unwrap_or(stripped);
                callout_lines.push(stripped);
                idx += 1;
            }
            blocks.push(parse_callout(&callout_lines));
            continue;
        }

        // 8. Blockquote: > text
        if line.starts_with('>') {
            let mut bq_lines: Vec<String> = Vec::new();
            while idx < lines.len() && lines[idx].starts_with('>') {
                let stripped = lines[idx].strip_prefix('>').unwrap_or(lines[idx]);
                let stripped = stripped.strip_prefix(' ').unwrap_or(stripped);
                bq_lines.push(stripped.to_string());
                idx += 1;
            }
            let mut block_id = None;
            if let Some(last) = bq_lines.last_mut() {
                let (s, id) = extract_block_id(last);
                block_id = id;
                *last = s.to_string();
            }
            blocks.push(Block::Blockquote {
                lines: bq_lines,
                block_id,
            });
            continue;
        }

        // 9. Table: | Col |
        if line.starts_with('|') && line.ends_with('|') {
            let mut table_lines = Vec::new();
            while idx < lines.len() && lines[idx].starts_with('|') && lines[idx].ends_with('|') {
                table_lines.push(lines[idx]);
                idx += 1;
            }
            if let Some(table) = parse_table(&table_lines) {
                blocks.push(table);
                continue;
            }
        }

        // 10. Headings: #..####
        if line.starts_with('#') {
            let num_hashes = line.chars().take_while(|&c| c == '#').count();
            if num_hashes >= 1 && num_hashes <= 4 && line[num_hashes..].starts_with(' ') {
                let content = &line[num_hashes + 1..];
                let (text, block_id) = extract_block_id(content);
                blocks.push(Block::Heading {
                    level: num_hashes as u8,
                    text: text.to_string(),
                    block_id,
                });
                idx += 1;
                continue;
            }
        }

        // 11. Task list or Bullet list or Ordered list
        if line.starts_with("- [ ] ") || line.starts_with("- [x] ") {
            let mut items = Vec::new();
            while idx < lines.len() && (lines[idx].starts_with("- [ ] ") || lines[idx].starts_with("- [x] ")) {
                let it_line = lines[idx];
                let checked = it_line.starts_with("- [x] ");
                let item_text = &it_line[6..];
                let (text, block_id) = extract_block_id(item_text);
                items.push(TaskListItem {
                    checked,
                    text: text.to_string(),
                    block_id,
                });
                idx += 1;
            }
            blocks.push(Block::TaskList { items });
            continue;
        }

        if line.starts_with("- ") {
            let mut items = Vec::new();
            while idx < lines.len() && lines[idx].starts_with("- ") && !lines[idx].starts_with("- [ ] ") && !lines[idx].starts_with("- [x] ") {
                let it_line = lines[idx];
                let item_text = &it_line[2..];
                let (text, block_id) = extract_block_id(item_text);
                items.push(ListItem {
                    text: text.to_string(),
                    block_id,
                });
                idx += 1;
            }
            blocks.push(Block::BulletList { items });
            continue;
        }

        if is_ordered_list_start(line) {
            let mut items = Vec::new();
            while idx < lines.len() && is_ordered_list_start(lines[idx]) {
                let it_line = lines[idx];
                let dot_idx = it_line.find(". ").unwrap();
                let item_text = &it_line[dot_idx + 2..];
                let (text, block_id) = extract_block_id(item_text);
                items.push(ListItem {
                    text: text.to_string(),
                    block_id,
                });
                idx += 1;
            }
            blocks.push(Block::OrderedList { items });
            continue;
        }

        // 12. Paragraph
        let mut p_lines = Vec::new();
        while idx < lines.len() && !lines[idx].trim().is_empty() {
            let cur = lines[idx];
            // Stop if encountering a new block initiator
            if cur.starts_with('#') || cur.starts_with("```") || cur.starts_with("::") || cur.starts_with('>') || cur.trim() == "---" {
                break;
            }
            p_lines.push(cur);
            idx += 1;
        }
        let p_text = p_lines.join("\n");
        let (text, block_id) = extract_block_id(&p_text);
        blocks.push(Block::Paragraph {
            text: text.to_string(),
            block_id,
        });
    }

    blocks
}

fn is_ordered_list_start(line: &str) -> bool {
    if let Some(dot_idx) = line.find(". ") {
        dot_idx > 0 && line[..dot_idx].chars().all(|c| c.is_ascii_digit())
    } else {
        false
    }
}

fn parse_leaf_directive(line: &str) -> Option<Block> {
    let name_end = line[2..].find(|c: char| c == '{' || c.is_whitespace()).map(|i| i + 2).unwrap_or(line.len());
    let name = &line[2..name_end];
    let rest = line[name_end..].trim();
    let attrs = if rest.starts_with('{') && rest.ends_with('}') {
        parse_attributes(&rest[1..rest.len() - 1])
    } else {
        Vec::new()
    };
    let attr_map: BTreeMap<String, String> = attrs.into_iter().collect();

    match name {
        "synced-ref" => {
            let note = attr_map.get("note")?.clone();
            let block = attr_map.get("block")?.clone();
            Some(Block::SyncedRef { note_id: note, block_id: block })
        }
        "page" => {
            let note = attr_map.get("note")?.clone();
            Some(Block::PageBlock { note_id: note })
        }
        "toc" => {
            let depth = attr_map.get("depth").and_then(|d| d.parse::<u8>().ok()).unwrap_or(3);
            Some(Block::TableOfContents { depth })
        }
        "breadcrumb" => Some(Block::Breadcrumb),
        "canvas" => {
            let frame = attr_map.get("frame")?.clone();
            Some(Block::CanvasEmbed { frame_id: frame })
        }
        "button" => {
            let label = attr_map.get("label").cloned().unwrap_or_default();
            let action_type = attr_map.get("action").map(|s| s.as_str());
            let action = match action_type {
                Some("set-property") => {
                    let prop = attr_map.get("property").cloned().unwrap_or_default();
                    let val = attr_map.get("value").cloned().unwrap_or_default();
                    ButtonAction::SetProperty { property: prop, value: val }
                }
                Some("create-linked-note") => {
                    let folder = attr_map.get("folder").cloned().unwrap_or_default();
                    let rel = attr_map.get("relation").cloned().unwrap_or_default();
                    ButtonAction::CreateLinkedNote { folder, relation: rel }
                }
                _ => ButtonAction::Unknown(rest.to_string()),
            };
            Some(Block::Button { label, action })
        }
        "file" => {
            let path = attr_map.get("path")?.clone();
            let name = attr_map.get("name").cloned().unwrap_or_else(|| path.clone());
            let size = attr_map.get("size").and_then(|s| s.parse::<u64>().ok()).unwrap_or(0);
            Some(Block::FileAttachment { path, name, size })
        }
        "bookmark" => {
            let url = attr_map.get("url")?.clone();
            let title = attr_map.get("title").cloned().unwrap_or_default();
            let description = attr_map.get("description").cloned().unwrap_or_default();
            let image = attr_map.get("image").cloned().unwrap_or_default();
            let fetched = attr_map.get("fetched").cloned().unwrap_or_default();
            Some(Block::Bookmark { url, title, description, image, fetched })
        }
        "embed" => {
            let url = attr_map.get("url")?.clone();
            let width = attr_map.get("width").and_then(|w| w.parse::<u32>().ok()).unwrap_or(720);
            let height = attr_map.get("height").and_then(|h| h.parse::<u32>().ok()).unwrap_or(405);
            Some(Block::Embed { url, width, height })
        }
        "database" => {
            let folder = attr_map.get("folder")?.clone();
            let view = attr_map.get("view")?.clone();
            Some(Block::DatabaseView { folder, view_id: view })
        }
        _ => Some(Block::Raw { content: line.to_string() }),
    }
}

fn parse_callout(lines: &[&str]) -> Block {
    if lines.is_empty() {
        return Block::Callout {
            callout_type: "note".to_string(),
            collapse: None,
            title: String::new(),
            body: Vec::new(),
            block_id: None,
        };
    }

    let first = lines[0]; // e.g. "[!warning] Don't skip this" or "[!note]+"
    let end_bracket = first.find(']').unwrap_or(first.len());
    let type_chunk = &first[2..end_bracket];
    let (callout_type, collapse) = if type_chunk.ends_with('+') {
        (&type_chunk[..type_chunk.len() - 1], Some('+'))
    } else if type_chunk.ends_with('-') {
        (&type_chunk[..type_chunk.len() - 1], Some('-'))
    } else {
        (type_chunk, None)
    };

    let title = first[end_bracket + 1..].trim().to_string();

    let mut body = Vec::new();
    let mut block_id = None;

    for (idx, line) in lines[1..].iter().enumerate() {
        if idx == lines.len() - 2 {
            let (clean, id) = extract_block_id(line);
            body.push(clean.to_string());
            block_id = id;
        } else {
            body.push(line.to_string());
        }
    }

    Block::Callout {
        callout_type: callout_type.to_string(),
        collapse,
        title,
        body,
        block_id,
    }
}

fn parse_table(lines: &[&str]) -> Option<Block> {
    if lines.len() < 2 {
        return None;
    }
    let parse_row = |row: &str| -> Vec<String> {
        let trimmed = row.trim();
        let trimmed = trimmed.strip_prefix('|').unwrap_or(trimmed);
        let trimmed = trimmed.strip_suffix('|').unwrap_or(trimmed);
        trimmed.split('|').map(|c| c.trim().to_string()).collect()
    };

    let headers = parse_row(lines[0]);
    let mut rows = Vec::new();
    for line in &lines[2..] {
        rows.push(parse_row(line));
    }

    Some(Block::Table { headers, rows })
}

fn parse_toggle_content(lines: &[&str], as_heading: Option<u8>) -> (String, Vec<String>) {
    let mut non_empty_idx = 0;
    while non_empty_idx < lines.len() && lines[non_empty_idx].trim().is_empty() {
        non_empty_idx += 1;
    }
    if non_empty_idx >= lines.len() {
        return (String::new(), Vec::new());
    }

    let summary_line = lines[non_empty_idx];
    let summary = if let Some(h) = as_heading {
        let prefix = format!("{} ", "#".repeat(h as usize));
        summary_line.strip_prefix(&prefix).unwrap_or(summary_line).to_string()
    } else {
        summary_line.to_string()
    };

    let mut body = Vec::new();
    let mut body_start = non_empty_idx + 1;
    while body_start < lines.len() && lines[body_start].trim().is_empty() {
        body_start += 1;
    }

    for l in &lines[body_start..] {
        body.push(l.to_string());
    }

    (summary, body)
}

fn parse_columns(lines: &[&str]) -> Block {
    let mut columns = Vec::new();
    let mut idx = 0;

    while idx < lines.len() {
        let line = lines[idx];
        if line.starts_with(":::column") {
            let attr_part = line.strip_prefix(":::column").unwrap_or("");
            let attrs = parse_attributes(attr_part.trim_matches(|c| c == '{' || c == '}'));
            let width = attrs.iter().find(|(k, _)| k == "width").and_then(|(_, v)| v.parse::<f64>().ok()).unwrap_or(0.5);

            let mut col_content = Vec::new();
            idx += 1;
            while idx < lines.len() && !lines[idx].starts_with(":::") {
                col_content.push(lines[idx].to_string());
                idx += 1;
            }
            if idx < lines.len() && lines[idx].starts_with(":::") {
                idx += 1;
            }
            columns.push(Column { width, content: col_content });
        } else {
            idx += 1;
        }
    }

    Block::Columns { columns }
}

fn parse_tabs(lines: &[&str]) -> Block {
    let mut tabs = Vec::new();
    let mut idx = 0;

    while idx < lines.len() {
        let line = lines[idx];
        if line.starts_with(":::tab") {
            let attr_part = line.strip_prefix(":::tab").unwrap_or("");
            let attrs = parse_attributes(attr_part.trim_matches(|c| c == '{' || c == '}'));
            let title = attrs.iter().find(|(k, _)| k == "title").map(|(_, v)| v.clone()).unwrap_or_default();
            let active = attrs.iter().any(|(k, _)| k == "active");

            let mut tab_content = Vec::new();
            idx += 1;
            while idx < lines.len() && !lines[idx].starts_with(":::") {
                tab_content.push(lines[idx].to_string());
                idx += 1;
            }
            if idx < lines.len() && lines[idx].starts_with(":::") {
                idx += 1;
            }
            tabs.push(Tab { title, active, content: tab_content });
        } else {
            idx += 1;
        }
    }

    Block::Tabs { tabs }
}
