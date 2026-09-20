import { describe, it, expect, vi } from 'vitest';
import TurndownService from 'turndown';

// Mock Tauri invoke to prevent network/ipc calls in test environment
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(['', 'no_snapshot']),
}));

// Create a turndown instance with the same rules as Editor.tsx
function createTurndownWithToggleRule() {
  const turndown = new TurndownService({
    headingStyle: 'atx',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
  });

  // Add the same taskItems rule as Editor.tsx (for completeness)
  turndown.addRule('taskItems', {
    filter: (node) => {
      return (
        node.nodeName === 'LI' &&
        node.getAttribute &&
        node.getAttribute('data-type') === 'taskItem'
      );
    },
    replacement: (content, node) => {
      const isChecked = (node as Element).getAttribute('data-checked') === 'true';
      const cleanContent = content.trim();
      return `- [${isChecked ? 'x' : ' '}] ${cleanContent}\n`;
    },
  });

  // Turndown rule for toggle blocks (copied from Editor.tsx)
  turndown.addRule('toggle', {
    filter: (node) => {
      return node.nodeName === 'DIV' && node.getAttribute && node.getAttribute('data-type') === 'toggle';
    },
    replacement: (content, node) => {
      const el = node as Element;
      const asHeading = el.getAttribute('data-as-heading');
      const open = el.getAttribute('data-open') === 'true';

      // Build attributes per FORMAT.md §4.3
      const attrs: string[] = [];
      if (asHeading) {
        attrs.push(`as=h${asHeading}`);
      }
      if (open) {
        attrs.push('open');
      }
      const attrSuffix = attrs.length > 0 ? `{${attrs.join(' ')}}` : '';

      let md = `:::toggle${attrSuffix}\n`;

      // Extract summary from the FIRST child in toggle-content
      // The editor renders all children (including the summary) in toggle-content
      // For toggle headings, first child is a heading; for toggle lists, first child is a paragraph
      const contentDiv = el.querySelector('.toggle-content');
      let summary = '';
      const bodyLines: string[] = [];

      if (contentDiv) {
        const children = Array.from(contentDiv.children);
        if (children.length > 0) {
          // First child is the summary
          const firstChild = children[0];
          summary = firstChild.textContent?.trim() || '';

          // For headings, prepend the heading marker per FORMAT.md
          if (asHeading) {
            const headingMarker = `${'#'.repeat(parseInt(asHeading, 10))} `;
            summary = `${headingMarker}${summary}`;
          }

          // Remaining children are the body - convert each to markdown using turndown
          const bodyTurndown = new TurndownService({
            headingStyle: 'atx',
            bulletListMarker: '-',
            codeBlockStyle: 'fenced',
          });
          for (let i = 1; i < children.length; i++) {
            const child = children[i];
            const html = child.outerHTML;
            const md = bodyTurndown.turndown(html).trim();
            if (md) {
              bodyLines.push(md);
            }
          }
        }
      }

      md += `${summary}\n\n`;

      for (const line of bodyLines) {
        md += `${line}\n`;
      }

      md += ':::\n';
      return md;
    },
  });

  return turndown;
}

describe('ToggleNode format round-trip', () => {
  const turndown = createTurndownWithToggleRule();

  it('serializes a basic toggle list to correct markdown format', () => {
    // HTML matching what the ToggleNode NodeView actually produces:
    // - toggle-summary with indicator and summary-content (for UI display)
    // - toggle-content containing ALL children (first child = summary paragraph)
    const html = `<div data-type="toggle" data-as-heading="" data-open="false">
  <div class="toggle-summary">
    <span class="toggle-collapse-indicator">▸</span>
    <span class="toggle-summary-content">Summary line</span>
  </div>
  <div class="toggle-content"><p>Summary line</p><p>Body line 1</p><p>Body line 2</p></div>
</div>`;

    const markdown = turndown.turndown(html);

    // This is the exact format sync-engine/src/format.rs serializes:
    // :::toggle
    // Summary line
    //
    // Body line 1
    // Body line 2
    // :::
    const expected = `:::toggle
Summary line

Body line 1
Body line 2
:::`;

    expect(markdown.trim()).toBe(expected);
  });

  it('serializes a toggle list with open attribute (default expanded)', () => {
    const html = `<div data-type="toggle" data-as-heading="" data-open="true">
  <div class="toggle-summary">
    <span class="toggle-collapse-indicator">▾</span>
    <span class="toggle-summary-content">Summary line</span>
  </div>
  <div class="toggle-content"><p>Summary line</p><p>Body visible by default</p></div>
</div>`;

    const markdown = turndown.turndown(html);

    const expected = `:::toggle{open}
Summary line

Body visible by default
:::`;

    expect(markdown.trim()).toBe(expected);
  });

  it('serializes a toggle heading h2 to correct markdown format', () => {
    const html = `<div data-type="toggle" data-as-heading="2" data-open="false">
  <div class="toggle-summary">
    <span class="toggle-collapse-indicator">▸</span>
    <span class="toggle-summary-content">## Collapsible Heading</span>
  </div>
  <div class="toggle-content"><h2>Collapsible Heading</h2><p>Body content hidden until expanded</p></div>
</div>`;

    const markdown = turndown.turndown(html);

    // This is the exact format sync-engine/src/format.rs serializes:
    // :::toggle{as=h2}
    // ## Collapsible Heading
    //
    // Body content hidden until expanded
    // :::
    const expected = `:::toggle{as=h2}
## Collapsible Heading

Body content hidden until expanded
:::`;

    expect(markdown.trim()).toBe(expected);
  });

  it('serializes a toggle heading h3 with open attribute', () => {
    const html = `<div data-type="toggle" data-as-heading="3" data-open="true">
  <div class="toggle-summary">
    <span class="toggle-collapse-indicator">▾</span>
    <span class="toggle-summary-content">### Default expanded heading</span>
  </div>
  <div class="toggle-content"><h3>Default expanded heading</h3><p>Visible by default</p></div>
</div>`;

    const markdown = turndown.turndown(html);

    const expected = `:::toggle{as=h3 open}
### Default expanded heading

Visible by default
:::`;

    expect(markdown.trim()).toBe(expected);
  });

  it('serializes a toggle heading h4', () => {
    const html = `<div data-type="toggle" data-as-heading="4" data-open="false">
  <div class="toggle-summary">
    <span class="toggle-collapse-indicator">▸</span>
    <span class="toggle-summary-content">#### Small heading</span>
  </div>
  <div class="toggle-content"><h4>Small heading</h4><p>Hidden body</p></div>
</div>`;

    const markdown = turndown.turndown(html);

    const expected = `:::toggle{as=h4}
#### Small heading

Hidden body
:::`;

    expect(markdown.trim()).toBe(expected);
  });

  it('serializes a toggle list without title (empty summary)', () => {
    // When there's no explicit summary, the first paragraph is still the summary (empty)
    // The editor would have an empty first paragraph
    const html = `<div data-type="toggle" data-as-heading="" data-open="false">
  <div class="toggle-summary">
    <span class="toggle-collapse-indicator">▸</span>
    <span class="toggle-summary-content"></span>
  </div>
  <div class="toggle-content"><p></p><p>Just a body, no summary</p></div>
</div>`;

    const markdown = turndown.turndown(html);

    const expected = `:::toggle

Just a body, no summary
:::`;

    expect(markdown.trim()).toBe(expected);
  });

  it('serializes a multi-paragraph toggle body', () => {
    const html = `<div data-type="toggle" data-as-heading="" data-open="false">
  <div class="toggle-summary">
    <span class="toggle-collapse-indicator">▸</span>
    <span class="toggle-summary-content">Multi-paragraph toggle</span>
  </div>
  <div class="toggle-content"><p>Multi-paragraph toggle</p><p>First paragraph</p><p>Second paragraph</p><p>Third paragraph</p></div>
</div>`;

    const markdown = turndown.turndown(html);

    const expected = `:::toggle
Multi-paragraph toggle

First paragraph
Second paragraph
Third paragraph
:::`;

    expect(markdown.trim()).toBe(expected);
  });

  it('serializes a toggle with nested block content (bullet list in body)', () => {
    const html = `<div data-type="toggle" data-as-heading="" data-open="false">
  <div class="toggle-summary">
    <span class="toggle-collapse-indicator">▸</span>
    <span class="toggle-summary-content">Toggle with list</span>
  </div>
  <div class="toggle-content">
    <p>Toggle with list</p>
    <ul>
      <li>Item 1</li>
      <li>Item 2</li>
    </ul>
  </div>
</div>`;

    const markdown = turndown.turndown(html);

    // The body should preserve the list markdown format
    // turndown converts <ul><li> to markdown list
    const expected = `:::toggle
Toggle with list

- Item 1
- Item 2
:::`;

    expect(markdown.trim()).toBe(expected);
  });
});

// Integration test: verify the markdown output matches Rust parser expectations
// This test documents the exact format that sync-engine/src/format.rs expects
describe('Toggle markdown format compatibility with sync-engine', () => {
  const turndown = createTurndownWithToggleRule();

  // These test cases mirror the Rust test in sync-engine/tests/format_roundtrip_tests.rs
  // test_roundtrip_callout_and_toggles

  it('matches Rust serializer output for toggle list (default collapsed)', () => {
    const html = `<div data-type="toggle" data-as-heading="" data-open="false">
  <div class="toggle-summary">
    <span class="toggle-collapse-indicator">▸</span>
    <span class="toggle-summary-content">A collapsible block</span>
  </div>
  <div class="toggle-content"><p>A collapsible block</p><p>Everything after it is the collapsed body.</p></div>
</div>`;

    const markdown = turndown.turndown(html);

    // This is the exact format sync-engine/src/format.rs serializes:
    // :::toggle
    // A collapsible block
    //
    // Everything after it is the collapsed body.
    // :::
    const expected = `:::toggle
A collapsible block

Everything after it is the collapsed body.
:::`;

    expect(markdown.trim()).toBe(expected);
  });

  it('matches Rust serializer output for toggle heading h2 (default collapsed)', () => {
    const html = `<div data-type="toggle" data-as-heading="2" data-open="false">
  <div class="toggle-summary">
    <span class="toggle-collapse-indicator">▸</span>
    <span class="toggle-summary-content">## A collapsible heading</span>
  </div>
  <div class="toggle-content"><h2>A collapsible heading</h2><p>Body content hidden until expanded.</p></div>
</div>`;

    const markdown = turndown.turndown(html);

    // This is the exact format sync-engine/src/format.rs serializes:
    // :::toggle{as=h2}
    // ## A collapsible heading
    //
    // Body content hidden until expanded.
    // :::
    const expected = `:::toggle{as=h2}
## A collapsible heading

Body content hidden until expanded.
:::`;

    expect(markdown.trim()).toBe(expected);
  });

  it('matches Rust serializer output for toggle with open attribute', () => {
    const html = `<div data-type="toggle" data-as-heading="2" data-open="true">
  <div class="toggle-summary">
    <span class="toggle-collapse-indicator">▾</span>
    <span class="toggle-summary-content">## Default expanded</span>
  </div>
  <div class="toggle-content"><h2>Default expanded</h2><p>Visible by default</p></div>
</div>`;

    const markdown = turndown.turndown(html);

    const expected = `:::toggle{as=h2 open}
## Default expanded

Visible by default
:::`;

    expect(markdown.trim()).toBe(expected);
  });
});