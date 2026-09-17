import { describe, it, expect, vi } from 'vitest';
import { Editor as TiptapEditor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { CalloutNode, CALLOUT_TYPES } from '../editor/extensions/CalloutNode';
import TurndownService from 'turndown';
import { DOMSerializer } from 'prosemirror-model';
import { Schema, DOMParser } from 'prosemirror-model';

// Mock Tauri invoke to prevent network/ipc calls in test environment
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(['', 'no_snapshot']),
}));

// Create a turndown instance with the same rules as Editor.tsx
function createTurndownWithCalloutRule() {
  const turndown = new TurndownService({
    headingStyle: 'atx',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
  });

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

  turndown.addRule('callout', {
    filter: (node) => {
      return node.nodeName === 'DIV' && node.getAttribute && node.getAttribute('data-type') === 'callout';
    },
    replacement: (content, node) => {
      const el = node as Element;
      const calloutType = el.getAttribute('data-callout-type') || 'note';
      const collapse = el.getAttribute('data-collapse') || '';
      const title = el.getAttribute('data-title') || '';

      // FORMAT.md format: > [!type]+ or > [!type]- (collapse indicator AFTER the bracket)
      let md = `> [!${calloutType}]${collapse}`;
      if (title.trim()) {
        md += ` ${title.trim()}`;
      }

      const contentDiv = el.querySelector('.callout-content');
      if (contentDiv) {
        const bodyLines: string[] = [];
        const walker = document.createTreeWalker(contentDiv, NodeFilter.SHOW_TEXT, null);
        let textNode;
        while ((textNode = walker.nextNode())) {
          const text = textNode.textContent || '';
          if (text.trim()) {
            bodyLines.push(text.trim());
          }
        }
        const paragraphs = contentDiv.querySelectorAll('p');
        if (paragraphs.length > 0 && bodyLines.length === 0) {
          paragraphs.forEach((p) => {
            const text = p.textContent || '';
            if (text.trim()) {
              bodyLines.push(text.trim());
            }
          });
        }
        for (const line of bodyLines) {
          md += `\n> ${line}`;
        }
      }

      return md + '\n';
    },
  });

  return turndown;
}

describe('CalloutNode format round-trip', () => {
  const turndown = createTurndownWithCalloutRule();

  it('serializes a basic callout to correct markdown format via renderHTML', () => {
    // HTML matching what renderHTML produces
    const html = `<div data-type="callout" data-callout-type="warning" data-collapse="" data-title="Don't skip this">
  <div class="callout-header">
    <span class="callout-icon">📝</span>
    <span class="callout-type-label">[warning]</span>
    <span class="callout-title"> Don't skip this</span>
    <span class="callout-collapse-indicator">▿</span>
  </div>
  <div class="callout-content"><p>The body of the callout</p></div>
</div>`;

    const markdown = turndown.turndown(html);

    // Note: turndown doesn't include trailing newline on the last block
    const expected = `> [!warning] Don't skip this
> The body of the callout`;

    expect(markdown.trim()).toBe(expected);
  });

  it('serializes a collapsible callout with + suffix (default-expanded)', () => {
    const html = `<div data-type="callout" data-callout-type="note" data-collapse="+" data-title="Expanded by default">
  <div class="callout-header">
    <span class="callout-icon">📝</span>
    <span class="callout-type-label">[note]</span>
    <span class="callout-title"> Expanded by default</span>
    <span class="callout-collapse-indicator">▿</span>
  </div>
  <div class="callout-content"><p>This content is visible by default</p></div>
</div>`;

    const markdown = turndown.turndown(html);

    const expected = `> [!note]+ Expanded by default
> This content is visible by default`;

    expect(markdown.trim()).toBe(expected);
  });

  it('serializes a collapsible callout with - suffix (default-collapsed)', () => {
    const html = `<div data-type="callout" data-callout-type="tip" data-collapse="-" data-title="Collapsed by default">
  <div class="callout-header">
    <span class="callout-icon">💡</span>
    <span class="callout-type-label">[tip]</span>
    <span class="callout-title"> Collapsed by default</span>
    <span class="callout-collapse-indicator">▾</span>
  </div>
  <div class="callout-content"><p>This content is hidden by default</p></div>
</div>`;

    const markdown = turndown.turndown(html);

    const expected = `> [!tip]- Collapsed by default
> This content is hidden by default`;

    expect(markdown.trim()).toBe(expected);
  });

  it('serializes a callout without title', () => {
    const html = `<div data-type="callout" data-callout-type="info" data-collapse="" data-title="">
  <div class="callout-header">
    <span class="callout-icon">ℹ️</span>
    <span class="callout-type-label">[info]</span>
    <span class="callout-title"> </span>
    <span class="callout-collapse-indicator">▿</span>
  </div>
  <div class="callout-content"><p>Just a body, no title</p></div>
</div>`;

    const markdown = turndown.turndown(html);

    const expected = `> [!info]
> Just a body, no title`;

    expect(markdown.trim()).toBe(expected);
  });

  it('serializes a multi-paragraph callout body', () => {
    const html = `<div data-type="callout" data-callout-type="success" data-collapse="" data-title="Multi-line callout">
  <div class="callout-header">
    <span class="callout-icon">✅</span>
    <span class="callout-type-label">[success]</span>
    <span class="callout-title"> Multi-line callout</span>
    <span class="callout-collapse-indicator">▿</span>
  </div>
  <div class="callout-content"><p>First paragraph</p><p>Second paragraph</p></div>
</div>`;

    const markdown = turndown.turndown(html);

    const expected = `> [!success] Multi-line callout
> First paragraph
> Second paragraph`;

    expect(markdown.trim()).toBe(expected);
  });

  it('supports all nine callout types from FORMAT.md §4.2', () => {
    for (const type of CALLOUT_TYPES) {
      const icon = ({ note: '📝', info: 'ℹ️', tip: '💡', success: '✅', warning: '⚠️', danger: '❌', question: '❓', quote: '📜', example: '🔍' })[type];

      const html = `<div data-type="callout" data-callout-type="${type}" data-collapse="" data-title="${type} callout">
  <div class="callout-header">
    <span class="callout-icon">${icon}</span>
    <span class="callout-type-label">[${type}]</span>
    <span class="callout-title"> ${type} callout</span>
    <span class="callout-collapse-indicator">▿</span>
  </div>
  <div class="callout-content"><p>Content for ${type}</p></div>
</div>`;

      const markdown = turndown.turndown(html);

      const expected = `> [!${type}] ${type} callout
> Content for ${type}`;

      expect(markdown.trim()).toBe(expected);
    }
  });

  it('round-trips collapse attribute correctly through parseHTML', () => {
    const testCases = [
      { collapse: '+', expected: '+' },
      { collapse: '-', expected: '-' },
      { collapse: null, expected: null },
      { collapse: 'expanded', expected: null },
      { collapse: 'collapsed', expected: null },
    ];

    const parseRules = CalloutNode.config.parseHTML?.();
    const rule = parseRules?.find((r: any) => r.tag === 'div[data-type="callout"]');

    expect(rule).toBeDefined();
    expect(rule?.getAttrs).toBeDefined();

    for (const { collapse, expected } of testCases) {
      const div = document.createElement('div');
      div.setAttribute('data-type', 'callout');
      div.setAttribute('data-callout-type', 'note');
      div.setAttribute('data-collapse', collapse || '');
      div.setAttribute('data-title', 'Test');

      const attrs = rule!.getAttrs(div);
      expect(attrs.collapse).toBe(expected);
    }
  });

  it('renders HTML with correct data-collapse attribute values', () => {
    const testCases = [
      { collapse: '+', expected: '+' },
      { collapse: '-', expected: '-' },
      { collapse: null, expected: '' },
    ];

    for (const { collapse, expected } of testCases) {
      const HTMLAttributes = {
        calloutType: 'note',
        collapse,
        title: 'Test',
      };

      const result = CalloutNode.config.renderHTML?.({ HTMLAttributes });

      expect(result).toBeDefined();
      const attrs = result![1];
      expect(attrs['data-collapse']).toBe(expected);
    }
  });

  it('NodeView is properly configured for interactivity', () => {
    expect(typeof CalloutNode.config.addNodeView).toBe('function');
  });
});

// Integration test: verify the markdown output matches Rust parser expectations
// This test documents the exact format that sync-engine/src/format.rs expects
describe('Callout markdown format compatibility with sync-engine', () => {
  const turndown = createTurndownWithCalloutRule();

  // These test cases mirror the Rust test in sync-engine/tests/format_roundtrip_tests.rs
  // test_roundtrip_callout_and_toggles

  it('matches Rust serializer output for callout with collapse "-" and block_id', () => {
    const html = `<div data-type="callout" data-callout-type="warning" data-collapse="-" data-title="Don't skip this">
  <div class="callout-header">
    <span class="callout-icon">⚠️</span>
    <span class="callout-type-label">[warning]</span>
    <span class="callout-title"> Don't skip this</span>
    <span class="callout-collapse-indicator">▾</span>
  </div>
  <div class="callout-content"><p>Body line 1</p><p>Body line 2</p></div>
</div>`;

    const markdown = turndown.turndown(html);

    // This is the exact format sync-engine/src/format.rs serializes:
    // > [!warning]- Don't skip this
    // > Body line 1
    // > Body line 2
    // ^{block_id}  (block_id is added by the serializer, not in editor content)
    const expected = `> [!warning]- Don't skip this
> Body line 1
> Body line 2`;

    expect(markdown.trim()).toBe(expected);
  });

  it('matches Rust serializer output for callout without title', () => {
    const html = `<div data-type="callout" data-callout-type="note" data-collapse="" data-title="">
  <div class="callout-header">
    <span class="callout-icon">📝</span>
    <span class="callout-type-label">[note]</span>
    <span class="callout-title"> </span>
    <span class="callout-collapse-indicator">▿</span>
  </div>
  <div class="callout-content"><p>Body only</p></div>
</div>`;

    const markdown = turndown.turndown(html);

    const expected = `> [!note]
> Body only`;

    expect(markdown.trim()).toBe(expected);
  });

  it('matches Rust serializer output for callout with + collapse', () => {
    const html = `<div data-type="callout" data-callout-type="tip" data-collapse="+" data-title="Default expanded">
  <div class="callout-header">
    <span class="callout-icon">💡</span>
    <span class="callout-type-label">[tip]</span>
    <span class="callout-title"> Default expanded</span>
    <span class="callout-collapse-indicator">▿</span>
  </div>
  <div class="callout-content"><p>Visible by default</p></div>
</div>`;

    const markdown = turndown.turndown(html);

    const expected = `> [!tip]+ Default expanded
> Visible by default`;

    expect(markdown.trim()).toBe(expected);
  });
});