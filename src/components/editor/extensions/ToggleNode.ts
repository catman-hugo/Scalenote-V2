/**
 * ToggleNode.ts
 *
 * Tiptap Node extension for toggle blocks (toggle list and toggle heading).
 * Matches the format specified in FORMAT.md §4.3 and sync-engine/src/format.rs
 *
 * Syntax:
 *   :::toggle
 *   Summary line
 *
 *   Body content
 *   :::
 *
 *   :::toggle{as=h2}
 *   ## Summary heading
 *
 *   Body content
 *   :::
 *
 * Default state: collapsed. {open} attribute marks default-expanded.
 */

import { mergeAttributes, Node, NodeViewRendererProps, Editor } from '@tiptap/core';

// Valid heading levels for toggle headings
export const TOGGLE_HEADING_LEVELS = [1, 2, 3, 4] as const;

export interface ToggleNodeAttributes {
  asHeading: 1 | 2 | 3 | 4 | null; // null = toggle list, 1-4 = toggle heading level
  open: boolean; // true = default expanded, false = default collapsed
}

/**
 * Creates a vanilla ProseMirror NodeView for the toggle block.
 * Handles click-to-toggle on the summary/header.
 */
function createToggleNodeView(props: NodeViewRendererProps): {
  dom: HTMLElement;
  contentDOM: HTMLElement;
  update: (node: any) => boolean;
  destroy: () => void;
} {
  const { editor, node } = props;
  const { asHeading, open } = node.attrs as ToggleNodeAttributes;
  const isHeading = asHeading !== null;
  const isCollapsed = !open;

  // Extract summary text from the first child node
  const firstChild = node.firstChild;
  let summaryText = '';
  if (firstChild) {
    summaryText = firstChild.textContent || '';
  }

  // Create the DOM structure
  const dom = document.createElement('div');
  dom.setAttribute('data-type', 'toggle');
  dom.setAttribute('data-as-heading', asHeading ? String(asHeading) : '');
  dom.setAttribute('data-open', String(open));
  dom.classList.add('ProseMirror-node-view');

  // Summary/Header (clickable for collapse toggle)
  const summary = document.createElement('div');
  summary.className = 'toggle-summary';
  summary.style.cssText = `
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 4px 8px;
    font-size: ${isHeading ? '1.2em' : '14px'};
    font-weight: ${isHeading ? '600' : '500'};
    user-select: none;
    cursor: pointer;
  `;

  const collapseIndicator = document.createElement('span');
  collapseIndicator.className = 'toggle-collapse-indicator';
  collapseIndicator.style.cssText = `
    flex-shrink: 0;
    font-size: 0.9em;
    color: var(--text-muted);
    min-width: 16px;
    text-align: center;
  `;
  collapseIndicator.textContent = isCollapsed ? '▸' : '▾';

  const summaryContent = document.createElement('span');
  summaryContent.className = 'toggle-summary-content';
  summaryContent.style.cssText = 'flex: 1; min-width: 0;';

  // Set the summary content with heading marker for headings
  if (isHeading && asHeading) {
    summaryContent.textContent = `${'#'.repeat(asHeading)} ${summaryText}`;
  } else {
    summaryContent.textContent = summaryText;
  }

  summary.appendChild(collapseIndicator);
  summary.appendChild(summaryContent);

  // Content div (ProseMirror will render children here)
  const contentDOM = document.createElement('div');
  contentDOM.className = 'toggle-content';
  contentDOM.style.cssText = `
    padding: 4px 8px 8px 28px;
    margin-top: 2px;
    border-left: 1px solid var(--border-subtle);
    ${isCollapsed ? 'display: none;' : ''}
  `;

  dom.appendChild(summary);
  dom.appendChild(contentDOM);

  // Click handler for collapse toggle
  const handleClick = (e: MouseEvent) => {
    // Only toggle if clicking on the summary area (indicator or summary text)
    if (e.target !== summary && e.target !== collapseIndicator && e.target !== summaryContent) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();

    const newOpen = !open;
    editor.chain().focus().command(({ tr, state }) => {
      const pos = state.selection.$anchor.pos;
      const targetNode = state.doc.nodeAt(pos);
      if (targetNode && targetNode.type.name === 'toggle') {
        tr.setNodeMarkup(pos, undefined, {
          ...targetNode.attrs,
          open: newOpen,
        });
        return true;
      }
      return false;
    }).run();
  };

  summary.addEventListener('click', handleClick);

  return {
    dom,
    contentDOM,
    update: (updatedNode: any) => {
      if (updatedNode.type.name !== 'toggle') {
        return false;
      }
      const newAttrs = updatedNode.attrs as ToggleNodeAttributes;
      const newOpen = newAttrs.open;
      const newIsCollapsed = !newOpen;
      const newAsHeading = newAttrs.asHeading;

      dom.setAttribute('data-as-heading', newAsHeading ? String(newAsHeading) : '');
      dom.setAttribute('data-open', String(newOpen));
      collapseIndicator.textContent = newIsCollapsed ? '▸' : '▾';
      contentDOM.style.display = newIsCollapsed ? 'none' : '';

      // Update font weight/size if heading level changed
      const newIsHeading = newAsHeading !== null;
      if (newIsHeading !== isHeading) {
        summary.style.fontSize = newIsHeading ? '1.2em' : '14px';
        summary.style.fontWeight = newIsHeading ? '600' : '500';
      }

      // Update summary content from first child
      const firstChild = updatedNode.firstChild;
      const newSummaryText = firstChild ? (firstChild.textContent || '') : '';
      if (newIsHeading && newAsHeading) {
        summaryContent.textContent = `${'#'.repeat(newAsHeading)} ${newSummaryText}`;
      } else {
        summaryContent.textContent = newSummaryText;
      }

      return true;
    },
    destroy: () => {
      summary.removeEventListener('click', handleClick);
    },
  };
}

export const ToggleNode = Node.create({
  name: 'toggle',

  content: 'block+', // Allows nested blocks

  marks: '',

  group: 'block',

  defining: true,

  addAttributes() {
    return {
      asHeading: {
        default: null,
        parseHTML: (element) => {
          const asHeading = (element as HTMLElement).dataset.asHeading;
          if (asHeading && TOGGLE_HEADING_LEVELS.includes(parseInt(asHeading, 10) as 1 | 2 | 3 | 4)) {
            return parseInt(asHeading, 10) as 1 | 2 | 3 | 4;
          }
          return null;
        },
        renderHTML: (attributes) => ({
          'data-as-heading': attributes.asHeading ? String(attributes.asHeading) : '',
        }),
      },
      open: {
        default: false,
        parseHTML: (element) => {
          const open = (element as HTMLElement).dataset.open;
          return open === 'true';
        },
        renderHTML: (attributes) => ({
          'data-open': String(attributes.open),
        }),
      },
    };
  },

  // Parse HTML from the markdown serializer output
  parseHTML() {
    return [
      {
        tag: 'div[data-type="toggle"]',
        getAttrs: (element) => {
          const el = element as HTMLElement;
          const asHeading = el.dataset.asHeading;
          const open = el.dataset.open === 'true';

          return {
            asHeading: asHeading && TOGGLE_HEADING_LEVELS.includes(parseInt(asHeading, 10) as 1 | 2 | 3 | 4)
              ? parseInt(asHeading, 10) as 1 | 2 | 3 | 4
              : null,
            open,
          };
        },
      },
    ];
  },

  // Render HTML for the editor (not used when NodeView is provided, but kept for SSR/fallback)
  renderHTML({ HTMLAttributes }) {
    const { asHeading, open } = HTMLAttributes;
    const isHeading = asHeading !== null && asHeading !== undefined;
    const isCollapsed = !open;

    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'toggle',
        'data-as-heading': asHeading ? String(asHeading) : '',
        'data-open': String(open),
      }),
      [
        'div',
        { class: 'toggle-summary' },
        [
          'span',
          { class: 'toggle-collapse-indicator' },
          isCollapsed ? '▸' : '▾',
        ],
        ['span', { class: 'toggle-summary-content' }, isHeading ? `${'#'.repeat(asHeading as number)} ` : 0],
      ],
      ['div', { class: 'toggle-content', style: isCollapsed ? 'display: none;' : '' }, 0],
    ];
  },

  // Add the NodeView for interactivity
  addNodeView() {
    return createToggleNodeView;
  },

  // Allow this node to be selected
  selectable: true,

  // Allow drag and drop
  draggable: true,
});

export default ToggleNode;