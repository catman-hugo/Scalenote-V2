/**
 * ClickToCreateParagraph.ts
 *
 * Plugin that allows clicking anywhere in the editor to create empty paragraphs
 * and place the cursor at that position. This enables starting to type anywhere
 * in the editor, not just at the top.
 */

import { Extension } from '@tiptap/core';
import { Plugin } from 'prosemirror-state';
import { Selection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';

/**
 * Read the actual rendered line-height from the editor DOM at click time.
 *
 * Strategy (in order):
 *   1. The last <p> element inside the editor — closest to where the user clicked.
 *   2. The editor's root DOM element — reliable container fallback.
 *   3. 1.5 × the container's computed font-size — handles the CSS `normal` keyword.
 *
 * This is intentionally deferred to click time rather than computed once at
 * initialisation so that it automatically picks up changes from Settings
 * (font-size adjustments) without needing to re-create the extension.
 */
function getComputedLineHeight(view: EditorView): number {
  const editorEl = view.dom as HTMLElement;

  // 1. Try the last paragraph in the editor
  const lastParagraph = editorEl.querySelector('p:last-of-type') as HTMLElement | null;
  if (lastParagraph) {
    const lh = window.getComputedStyle(lastParagraph).lineHeight;
    const parsed = parseFloat(lh);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }

  // 2. Try the editor container itself
  const containerStyle = window.getComputedStyle(editorEl);
  const containerLh = parseFloat(containerStyle.lineHeight);
  if (!isNaN(containerLh) && containerLh > 0) return containerLh;

  // 3. Derive from font-size × 1.5 (CSS `normal` resolves to ~1.2–1.5×)
  const fontSize = parseFloat(containerStyle.fontSize);
  if (!isNaN(fontSize) && fontSize > 0) return fontSize * 1.5;

  // Absolute last resort — should never be reached in a real browser
  return 24;
}

export const ClickToCreateParagraph = Extension.create({
  name: 'clickToCreateParagraph',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        handleClick: (view: EditorView, pos: number, event: MouseEvent) => {
          // Only handle left clicks
          if (event.button !== 0) return false;

          const { state } = view;
          const { doc, schema } = state;

          // If there's no document content, just insert a paragraph at position 0
          if (doc.content.size === 0) {
            const tr = state.tr;
            tr.insert(0, schema.nodes.paragraph.create(null, []));
            view.dispatch(tr);
            view.focus();
            return true;
          }

          // Get the position of the last line of content
          const lastPos = doc.content.size;
          const coordsAtEnd = view.coordsAtPos(lastPos);

          if (!coordsAtEnd) return false;

          // Get the click position
          const clickY = event.clientY;
          const contentBottom = coordsAtEnd.bottom;

          // If clicked below the last line of content, insert paragraphs to reach that position
          if (clickY > contentBottom + 5) { // Small threshold
            const distance = clickY - contentBottom;
            // Read line-height from the DOM so it respects the user's configured font size
            const lineHeight = getComputedLineHeight(view);
            const paragraphsNeeded = Math.max(1, Math.floor(distance / lineHeight));

            const tr = state.tr;
            const endPos = lastPos;

            // Insert all paragraphs at the end position.
            // Each paragraph insert increases the position by 1 (for the paragraph node itself).
            for (let i = 0; i < paragraphsNeeded; i++) {
              tr.insert(endPos + i, schema.nodes.paragraph.create(null, []));
            }

            // Place cursor after the last inserted paragraph
            const newPos = endPos + paragraphsNeeded;
            tr.setSelection(Selection.near(tr.doc.resolve(newPos)));
            view.dispatch(tr);
            view.focus();
            return true;
          }

          // Check if we clicked beyond the end of the document (pos >= content size)
          if (pos >= doc.content.size) {
            const tr = state.tr;
            tr.insert(doc.content.size, schema.nodes.paragraph.create(null, []));
            const newPos = doc.content.size + 1;
            tr.setSelection(Selection.near(tr.doc.resolve(newPos)));
            view.dispatch(tr);
            view.focus();
            return true;
          }

          return false;
        },
      }),
    ];
  },
});
