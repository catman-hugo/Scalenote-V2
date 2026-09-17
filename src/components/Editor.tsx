import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import * as Y from 'yjs';
import { invoke } from '@tauri-apps/api/core';
import Collaboration from '@tiptap/extension-collaboration';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import debounce from 'lodash.debounce';
import MarkdownIt from 'markdown-it';
import TurndownService from 'turndown';

import Toolbar from './Toolbar';
import WikilinkAutocomplete from './WikilinkAutocomplete';
import { createSlashMenuExtension } from './editor/extensions/SlashMenu';
import { ClickToCreateParagraph } from './editor/extensions/ClickToCreateParagraph';
import { CalloutNode, CALLOUT_TYPES, CALLOUT_ICONS } from './editor/extensions/CalloutNode';
import type { NoteFile } from '../types';

interface EditorProps {
  activeNote: NoteFile | null;
  content: string;
  vaultPath?: string | null;
  isSaving: boolean;
  lastSaved: Date | null;
  peerCount?: number;
  mode?: 'rich' | 'markdown';
  onContentChange: (content: string) => void;
  onSaveImmediate: () => void;
}

const md = new MarkdownIt({
  html: true,
  breaks: true,
  linkify: true,
});

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

// Turndown rule for callout blocks
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

    // Extract body content from callout-content div
    const contentDiv = el.querySelector('.callout-content');
    if (contentDiv) {
      // Get all text content, preserving line breaks
      const bodyLines: string[] = [];
      const walker = document.createTreeWalker(contentDiv, NodeFilter.SHOW_TEXT, null);
      let textNode;
      while ((textNode = walker.nextNode())) {
        const text = textNode.textContent || '';
        if (text.trim()) {
          bodyLines.push(text.trim());
        }
      }
      // Also check for paragraph elements
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

function splitFrontmatter(raw: string): { frontmatter: string; body: string } {
  const trimmed = raw.trimStart();
  if (trimmed.startsWith('---')) {
    const endIdx = trimmed.indexOf('\n---', 3);
    if (endIdx !== -1) {
      const fm = trimmed.slice(0, endIdx + 4);
      const rest = trimmed.slice(endIdx + 4);
      const body = rest.startsWith('\n') ? rest.slice(1) : rest;
      return { frontmatter: fm, body };
    }
  }
  return { frontmatter: '', body: raw };
}

export const Editor: React.FC<EditorProps> = ({
  activeNote,
  content,
  vaultPath,
  isSaving,
  lastSaved,
  peerCount = 0,
  mode: propMode,
  onContentChange,
  onSaveImmediate,
}) => {
  const [yDoc, setYDoc] = useState<Y.Doc | null>(null);
  const [internalMode, setInternalMode] = useState<'rich' | 'markdown'>(propMode || 'rich');
  const mode = propMode !== undefined ? propMode : internalMode;
  const setMode = setInternalMode;
  const isReadOnlyFromPeers = peerCount > 0;

  // Load snapshot and initialize Y.Doc for the active note
  useEffect(() => {
    if (!activeNote) {
      setYDoc(null);
      return;
    }
    const doc = new Y.Doc();
    const load = async () => {
      try {
        const [base64Data, status] = await invoke<[string, string]>('load_snapshot', {
          vaultPath,
          noteId: activeNote.id,
        });
        if (base64Data) {
          const binaryString = atob(base64Data);
          const len = binaryString.length;
          const bytes = new Uint8Array(len);
          for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          Y.applyUpdate(doc, bytes);
          console.log('Loaded CRDT snapshot status:', status);
        }
      } catch (e) {
        console.error('Failed to load snapshot', e);
      }
      setYDoc(doc);
    };
    load();
  }, [activeNote?.id, vaultPath]);

  const [rawText, setRawText] = useState<string>(content);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const frontmatterRef = useRef<string>('');
  const isInternalUpdateRef = useRef<boolean>(false);
  const activeNotePathRef = useRef<string | null>(null);

  const { frontmatter, body } = useMemo(() => {
    return splitFrontmatter(content);
  }, [content]);

  useEffect(() => {
    frontmatterRef.current = frontmatter;
  }, [frontmatter]);

  // Debounced snapshot save using Yjs update
  const debouncedSaveSnapshot = useMemo(
    () =>
      debounce((markdown: string) => {
        if (!yDoc || !activeNote) return;
        try {
          const update = Y.encodeStateAsUpdate(yDoc);
          let binary = '';
          update.forEach((b: number) => (binary += String.fromCharCode(b)));
          const base64Data = btoa(binary);
          invoke('save_snapshot', {
            vaultPath,
            noteId: activeNote.id,
            markdown,
            update_base64: base64Data,
          }).catch((e: unknown) => console.error('Failed to save snapshot', e));
        } catch (e) {
          console.error('Error during snapshot save', e);
        }
      }, 400),
    [yDoc, vaultPath, activeNote]
  );

  const debouncedSaveFromHtml = useMemo(
    () =>
      debounce((html: string) => {
        const bodyMd = turndown.turndown(html);
        const full = frontmatterRef.current ? `${frontmatterRef.current}\n\n${bodyMd}` : bodyMd;
        setRawText(full);
        isInternalUpdateRef.current = true;
        onContentChange(full);
        debouncedSaveSnapshot(full);
      }, 300),
    [onContentChange, debouncedSaveSnapshot]
  );

  // Note: Tiptap documentation specifically states that when using @tiptap/extension-collaboration,
  // `content` must NOT be passed to useEditor because the Y.Doc is the source of truth.
  // Passing a static content prop will cause duplicate nodes or overwrite CRDT state.
  const SlashMenuExtension = useMemo(() => createSlashMenuExtension(), []);

  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({
          heading: {
            levels: [1, 2, 3, 4],
          },
        }),
        Underline,
        TaskList,
        TaskItem.configure({
          nested: true,
        }),
        SlashMenuExtension,
        ClickToCreateParagraph,
        CalloutNode,
        ...(yDoc
          ? [
              Collaboration.configure({
                document: yDoc,
              }),
            ]
          : []),
      ],
      onUpdate: ({ editor: ed }) => {
        debouncedSaveFromHtml(ed.getHTML());
      },
    },
    [yDoc, SlashMenuExtension]
  );

  // Initial populate for new empty Y.Doc from disk body
  useEffect(() => {
    if (!editor || !yDoc) return;
    const noteChanged = activeNote?.path !== activeNotePathRef.current;
    activeNotePathRef.current = activeNote?.path || null;

    if (isInternalUpdateRef.current) {
      isInternalUpdateRef.current = false;
      return;
    }

    setRawText(content);

    // If the doc is newly loaded or empty, seed it with body or an empty paragraph
    if (noteChanged && editor.isEmpty) {
      if (body.trim().length > 0) {
        editor.commands.setContent(md.render(body));
      } else {
        // For new empty notes, seed with an empty paragraph so user can start typing
        editor.commands.setContent('<p></p>');
      }
    }
  }, [activeNote?.path, content, body, editor, yDoc]);

  // Handle mode toggle
  const handleToggleMode = useCallback(() => {
    if (mode === 'rich') {
      if (editor) {
        const bodyMd = turndown.turndown(editor.getHTML());
        const full = frontmatterRef.current
          ? `${frontmatterRef.current}\n\n${bodyMd}`
          : bodyMd;
        setRawText(full);
      }
      setMode('markdown');
    } else {
      const { frontmatter: fm, body: newBody } = splitFrontmatter(rawText);
      frontmatterRef.current = fm;
      if (editor) {
        editor.commands.setContent(md.render(newBody));
      }
      setMode('rich');
    }
  }, [mode, editor, rawText]);

  // Raw textarea key handling
  const handleRawKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      onSaveImmediate();
      return;
    }

    if (isReadOnlyFromPeers) return;

    if (e.key === 'Tab') {
      e.preventDefault();
      const ta = textareaRef.current;
      if (!ta) return;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const updated = rawText.substring(0, start) + '  ' + rawText.substring(end);
      setRawText(updated);
      isInternalUpdateRef.current = true;
      onContentChange(updated);
      setTimeout(() => {
        ta.selectionStart = ta.selectionEnd = start + 2;
      }, 0);
    }
  };

  const handleRawChange = (val: string) => {
    if (isReadOnlyFromPeers) return;
    setRawText(val);
    isInternalUpdateRef.current = true;
    onContentChange(val);
    debouncedSaveSnapshot(val);
  };

  const formatTime = (d: Date) => {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  if (!activeNote) {
    return (
      <main className="editor-container">
        <div className="editor-empty">
          <p>No note selected</p>
          <span style={{ fontSize: '12px' }}>
            Choose a note from the sidebar or create a new one to begin editing.
          </span>
        </div>
      </main>
    );
  }

  const currentDisplayContent = mode === 'rich' && editor ? editor.getText() : rawText;
  const lineCount = currentDisplayContent ? currentDisplayContent.split('\n').length : 0;
  const wordCount = currentDisplayContent ? (currentDisplayContent.match(/\S+/g) || []).length : 0;
  const charCount = currentDisplayContent.length;

  return (
    <main
      className="editor-container"
      style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}
    >
      <header className="editor-header">
        <div className="editor-breadcrumbs">
          <span className="editor-title">{activeNote.name}</span>
          <span className="note-id-badge" title={`Note UUIDv7: ${activeNote.id}`}>
            {activeNote.id.slice(0, 8)}...
          </span>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{activeNote.path}</span>
        </div>

        <div className="editor-status">
          <span className={`save-indicator ${isSaving ? 'saving' : 'saved'}`}>
            {isSaving ? '● Saving...' : lastSaved ? `✓ Saved ${formatTime(lastSaved)}` : '✓ Saved'}
          </span>
          <button
            onClick={onSaveImmediate}
            disabled={isSaving}
            style={{ fontSize: '11px', padding: '3px 8px' }}
            title="Save now (Ctrl+S)"
          >
            Save
          </button>
        </div>
      </header>

      {/* Formatting Toolbar */}
      <Toolbar
        editor={editor}
        mode={mode}
        onToggleMode={handleToggleMode}
        onSaveImmediate={onSaveImmediate}
      />

      {/* Editor Body */}
      <div
        className="editor-body"
        onClick={(e) => {
          if (mode === 'rich' && editor) {
            // If clicking on the editor container itself (not on existing content),
            // focus at the end to allow typing
            if (e.target === e.currentTarget) {
              const docSize = editor.state.doc.content.size;
              editor.chain().focus().setTextSelection(docSize).run();
            }
          }
        }}
        style={{
          flex: 1,
          overflowY: 'auto',
          position: 'relative',
          padding: mode === 'rich' ? '16px 24px' : '0',
        }}
      >
        {mode === 'rich' ? (
          <>
            <WikilinkAutocomplete editor={editor} />
            <div className="tiptap-wrapper">
              <EditorContent editor={editor} className="tiptap-content" />
            </div>
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}>
            {isReadOnlyFromPeers && (
              <div
                className="peer-readonly-banner"
                style={{
                  backgroundColor: '#fef3c7',
                  color: '#92400e',
                  padding: '10px 16px',
                  fontSize: '13px',
                  fontWeight: 500,
                  borderBottom: '1px solid #fde68a',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <span>⚠️</span>
                <span>
                  Markdown source mode is read-only while {peerCount} collaborator{peerCount > 1 ? 's are' : ' is'} connected. Switch to Rich Text mode to edit collaboratively.
                </span>
              </div>
            )}
            <textarea
              ref={textareaRef}
              className="markdown-textarea"
              value={rawText}
              readOnly={isReadOnlyFromPeers}
              onChange={(e) => handleRawChange(e.target.value)}
              onKeyDown={handleRawKeyDown}
              placeholder={isReadOnlyFromPeers ? "Note is read-only while peers are connected" : "Start writing in Markdown..."}
              spellCheck={false}
              style={{
                width: '100%',
                flex: 1,
                padding: '16px 24px',
                border: 'none',
                outline: 'none',
                backgroundColor: isReadOnlyFromPeers ? 'var(--color-bg-secondary, #f9fafb)' : 'inherit',
                cursor: isReadOnlyFromPeers ? 'not-allowed' : 'text',
              }}
            />
          </div>
        )}
      </div>

      <footer className="editor-footer">
        <div>{mode === 'rich' ? 'Rich Text (Tiptap)' : 'Markdown (Raw)'}</div>
        <div>
          <span>{lineCount} lines</span> · <span>{wordCount} words</span> ·{' '}
          <span>{charCount} chars</span>
        </div>
      </footer>
    </main>
  );
};

export default Editor;
