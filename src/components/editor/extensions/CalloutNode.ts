/**
 * CalloutNode.ts
 *
 * Tiptap Node extension for callout blocks.
 * Matches the format specified in FORMAT.md §4.2 and sync-engine/src/format.rs
 *
 * Syntax: > [!type] Title
 *         > Body content
 *         > ^{block_id}
 *
 * Collapsible: > [!type]+ or > [!type]-
 */

import { mergeAttributes, Node, NodeViewRendererProps, Editor } from '@tiptap/core';

// Valid callout types from FORMAT.md §4.2
export const CALLOUT_TYPES = [
  'note',
  'info',
  'tip',
  'success',
  'warning',
  'danger',
  'question',
  'quote',
  'example',
] as const;

export type CalloutType = typeof CALLOUT_TYPES[number];

// Icons for each callout type
export const CALLOUT_ICONS: Record<CalloutType, string> = {
  note: '📝',
  info: 'ℹ️',
  tip: '💡',
  success: '✅',
  warning: '⚠️',
  danger: '❌',
  question: '❓',
  quote: '📜',
  example: '🔍',
};

// Color classes for each callout type - using CSS variables
export const CALLOUT_COLORS: Record<CalloutType, string> = {
  note: 'var(--color-callout-note)',
  info: 'var(--color-callout-info)',
  tip: 'var(--color-callout-tip)',
  success: 'var(--color-callout-success)',
  warning: 'var(--color-callout-warning)',
  danger: 'var(--color-callout-danger)',
  question: 'var(--color-callout-question)',
  quote: 'var(--color-callout-quote)',
  example: 'var(--color-callout-example)',
};

export interface CalloutNodeAttributes {
  calloutType: CalloutType;
  collapse: '+' | '-' | null; // '+' = default-expanded, '-' = default-collapsed, null = not collapsible
  title: string;
}

/**
 * Creates a vanilla ProseMirror NodeView for the callout block.
 * Handles click-to-collapse on the header.
 */
function createCalloutNodeView(props: NodeViewRendererProps): {
  dom: HTMLElement;
  contentDOM: HTMLElement;
  update: (node: any) => boolean;
  destroy: () => void;
} {
  const { editor, node } = props;
  const { calloutType, collapse, title } = node.attrs as CalloutNodeAttributes;
  const icon = CALLOUT_ICONS[calloutType] || CALLOUT_ICONS.note;
  const isCollapsed = collapse === '-';
  const collapseIcon = isCollapsed ? '▾' : '▿';

  // Create the DOM structure
  const dom = document.createElement('div');
  dom.setAttribute('data-type', 'callout');
  dom.setAttribute('data-callout-type', calloutType);
  dom.setAttribute('data-collapse', collapse || '');
  dom.setAttribute('data-title', title);
  dom.classList.add('ProseMirror-node-view');

  // Header (clickable for collapse toggle)
  const header = document.createElement('div');
  header.className = 'callout-header';
  header.style.cssText = `
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 2px 8px;
    font-size: 14px;
    user-select: none;
    cursor: pointer;
  `;

  const iconSpan = document.createElement('span');
  iconSpan.className = 'callout-icon';
  iconSpan.style.cssText = `font-size: 1.1em; flex-shrink: 0;`;
  iconSpan.textContent = icon;

  const typeLabel = document.createElement('span');
  typeLabel.className = 'callout-type-label';
  typeLabel.style.cssText = `font-weight: 600; font-size: 0.9em;`;
  typeLabel.textContent = `[${calloutType}]`;

  const titleSpan = document.createElement('span');
  titleSpan.className = 'callout-title';
  titleSpan.style.cssText = `flex: 1; font-weight: 500; min-width: 0;`;
  if (title && title.trim()) {
    titleSpan.textContent = ` ${title.trim()}`;
  }

  const collapseIndicator = document.createElement('span');
  collapseIndicator.className = 'callout-collapse-indicator';
  collapseIndicator.style.cssText = `margin-left: auto; color: var(--text-muted); font-size: 0.9em;`;
  collapseIndicator.textContent = collapseIcon;

  header.appendChild(iconSpan);
  header.appendChild(typeLabel);
  header.appendChild(titleSpan);
  header.appendChild(collapseIndicator);

  // Content div (ProseMirror will render children here)
  const contentDOM = document.createElement('div');
  contentDOM.className = 'callout-content';
  contentDOM.style.cssText = `
    padding: 2px 8px 8px;
    margin-top: 2px;
    border-top: 1px solid var(--border-subtle);
    ${isCollapsed ? 'display: none;' : ''}
  `;

  dom.appendChild(header);
  dom.appendChild(contentDOM);

  // Click handler for collapse toggle
  const handleClick = (e: MouseEvent) => {
    // Don't toggle if clicking on a nested interactive element
    if (e.target !== header && e.target !== iconSpan && e.target !== typeLabel && e.target !== titleSpan && e.target !== collapseIndicator) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();

    const newCollapse = collapse === '-' ? '+' : '-';
    editor.chain().focus().command(({ tr, state }) => {
      const pos = state.selection.$anchor.pos;
      const targetNode = state.doc.nodeAt(pos);
      if (targetNode && targetNode.type.name === 'callout') {
        tr.setNodeMarkup(pos, undefined, {
          ...targetNode.attrs,
          collapse: newCollapse,
        });
        return true;
      }
      return false;
    }).run();
  };

  header.addEventListener('click', handleClick);

  return {
    dom,
    contentDOM,
    update: (updatedNode: any) => {
      if (updatedNode.type.name !== 'callout') {
        return false;
      }
      const newAttrs = updatedNode.attrs as CalloutNodeAttributes;
      const newCollapse = newAttrs.collapse;
      const newIsCollapsed = newCollapse === '-';
      const newCollapseIcon = newIsCollapsed ? '▾' : '▿';

      dom.setAttribute('data-callout-type', newAttrs.calloutType);
      dom.setAttribute('data-collapse', newCollapse || '');
      dom.setAttribute('data-title', newAttrs.title);
      collapseIndicator.textContent = newCollapseIcon;
      contentDOM.style.display = newIsCollapsed ? 'none' : '';
      return true;
    },
    destroy: () => {
      header.removeEventListener('click', handleClick);
    },
  };
}

export const CalloutNode = Node.create({
  name: 'callout',

  content: 'block+', // Allows nested blocks

  marks: '',

  group: 'block',

  defining: true,

  addAttributes() {
    return {
      calloutType: {
        default: 'note',
        parseHTML: (element) => (element as HTMLElement).dataset.calloutType || 'note',
        renderHTML: (attributes) => ({
          'data-callout-type': attributes.calloutType,
        }),
      },
      collapse: {
        default: null,
        parseHTML: (element) => {
          const collapse = (element as HTMLElement).dataset.collapse;
          if (collapse === '+' || collapse === '-') return collapse;
          return null;
        },
        renderHTML: (attributes) => ({
          'data-collapse': attributes.collapse || '',
        }),
      },
      title: {
        default: '',
        parseHTML: (element) => (element as HTMLElement).dataset.title || '',
        renderHTML: (attributes) => ({
          'data-title': attributes.title,
        }),
      },
    };
  },

  // Parse HTML from the markdown serializer output
  parseHTML() {
    return [
      {
        tag: 'div[data-type="callout"]',
        getAttrs: (element) => {
          const el = element as HTMLElement;
          const calloutType = el.dataset.calloutType as CalloutType;
          const collapse = el.dataset.collapse as '+' | '-' | null;
          const title = el.dataset.title || '';

          return {
            calloutType: CALLOUT_TYPES.includes(calloutType) ? calloutType : 'note',
            collapse: collapse === '+' || collapse === '-' ? collapse : null,
            title,
          };
        },
      },
    ];
  },

  // Render HTML for the editor (not used when NodeView is provided, but kept for SSR/fallback)
  renderHTML({ HTMLAttributes }) {
    const { calloutType, collapse, title } = HTMLAttributes;
    const icon = CALLOUT_ICONS[calloutType as CalloutType] || CALLOUT_ICONS.note;
    const isCollapsed = collapse === '-';
    const collapseIcon = isCollapsed ? '▾' : '▿';

    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'callout',
        'data-callout-type': calloutType,
        'data-collapse': collapse || '',
        'data-title': title,
      }),
      [
        'div',
        { class: 'callout-header' },
        [
          'span',
          { class: 'callout-icon' },
          icon,
        ],
        [
          'span',
          { class: 'callout-type-label' },
          `[${calloutType}]`,
        ],
        title && title.trim() && [
          ' ',
          ['span', { class: 'callout-title' }, title],
        ],
        [
          'span',
          { class: 'callout-collapse-indicator' },
          collapseIcon,
        ],
      ],
      ['div', { class: 'callout-content' }, 0],
    ];
  },

  // Add the NodeView for interactivity
  addNodeView() {
    return createCalloutNodeView;
  },

  // Allow this node to be selected
  selectable: true,

  // Allow drag and drop
  draggable: true,
});