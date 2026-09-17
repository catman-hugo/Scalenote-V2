/**
 * SlashMenu.ts
 *
 * Slash command menu extension using @tiptap/suggestion for proper cursor positioning.
 * This ensures the menu appears right next to the slash character.
 */

import { Extension } from '@tiptap/core';
import type { Editor } from '@tiptap/core';
import { Suggestion } from '@tiptap/suggestion';
import { ReactRenderer } from '@tiptap/react';
import { SlashMenuDropdown } from './SlashMenuDropdown';

interface SlashCommand {
  id: string;
  label: string;
  description: string;
  icon: string;
  execute: (props: { editor: Editor; range: { from: number; to: number } }) => void;
}

const getCommands = (): SlashCommand[] => [
  {
    id: 'heading1',
    label: 'Heading 1',
    description: 'Large section heading',
    icon: 'H1',
    execute: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setHeading({ level: 1 }).run(),
  },
  {
    id: 'heading2',
    label: 'Heading 2',
    description: 'Medium section heading',
    icon: 'H2',
    execute: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setHeading({ level: 2 }).run(),
  },
  {
    id: 'heading3',
    label: 'Heading 3',
    description: 'Small section heading',
    icon: 'H3',
    execute: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setHeading({ level: 3 }).run(),
  },
  {
    id: 'bold',
    label: 'Bold',
    description: 'Bold text',
    icon: 'B',
    execute: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleBold().run(),
  },
  {
    id: 'italic',
    label: 'Italic',
    description: 'Italic text',
    icon: 'I',
    execute: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleItalic().run(),
  },
  {
    id: 'bulletList',
    label: 'Bullet List',
    description: 'Unordered list',
    icon: '•',
    execute: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleBulletList().run(),
  },
  {
    id: 'orderedList',
    label: 'Ordered List',
    description: 'Ordered list',
    icon: '1.',
    execute: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
  },
  {
    id: 'blockquote',
    label: 'Blockquote',
    description: 'Insert a blockquote',
    icon: '❝',
    execute: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
  },
  {
    id: 'codeBlock',
    label: 'Code Block',
    description: 'Monospace code block',
    icon: '</>',
    execute: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
  },
];

export function createSlashMenuExtension() {
  const COMMANDS = getCommands();

  return Extension.create({
    name: 'slashMenu',

    addProseMirrorPlugins() {
      return [
        Suggestion({
          editor: this.editor,
          char: '/',
          allowSpaces: false,

          items: ({ query }: { query: string }) => {
            const q = query.toLowerCase().trim();
            return q
              ? COMMANDS.filter(
                  (c) =>
                    c.label.toLowerCase().includes(q) ||
                    c.id.toLowerCase().includes(q)
                )
              : COMMANDS;
          },

          command: ({ editor, range, props }: { editor: Editor; range: { from: number; to: number }; props: SlashCommand }) => {
            props.execute({ editor, range });
          },

          render: () => {
            let renderer:
              | ReactRenderer<{
                  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
                }>
              | null = null;

            return {
              onStart: (props: any) => {
                renderer = new ReactRenderer(SlashMenuDropdown, {
                  props,
                  editor: props.editor,
                });

                if (!props.clientRect) return;

                const el = renderer.element as HTMLElement;
                document.body.appendChild(el);

                const rect = props.clientRect();
                if (rect && el) {
                  el.style.position = 'fixed';
                  el.style.top = `${rect.bottom + 4}px`;
                  el.style.left = `${rect.left}px`;
                  el.style.zIndex = '500';
                }
              },

              onUpdate: (props: any) => {
                renderer?.updateProps(props);

                if (!props.clientRect) return;

                const el = renderer?.element as HTMLElement | undefined;
                const rect = props.clientRect();
                if (rect && el) {
                  el.style.top = `${rect.bottom + 4}px`;
                  el.style.left = `${rect.left}px`;
                }
              },

              onKeyDown: (props: { event: KeyboardEvent }) => {
                if (props.event.key === 'Escape') {
                  const el = renderer?.element as HTMLElement | undefined;
                  el?.remove();
                  renderer?.destroy();
                  return true;
                }
                return renderer?.ref?.onKeyDown(props) ?? false;
              },

              onExit: () => {
                const el = renderer?.element as HTMLElement | undefined;
                el?.remove();
                renderer?.destroy();
                renderer = null;
              },
            };
          },
        }),
      ];
    },
  });
}
