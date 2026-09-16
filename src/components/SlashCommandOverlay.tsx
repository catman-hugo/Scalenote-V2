import React, { useEffect, useState, useRef } from 'react';
import { useNoteContext } from '../context/NoteContext';
import { invoke } from '@tauri-apps/api/core';

const SlashCommandOverlay: React.FC<{ editor: any }> = ({ editor }) => {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const overlayRef = useRef<HTMLDivElement>(null);
  const commands = [
    { label: 'Heading 1', action: () => editor.chain().focus().toggleHeading({ level: 1 }).run() },
    { label: 'Bold', action: () => editor.chain().focus().toggleBold().run() },
    { label: 'Italic', action: () => editor.chain().focus().toggleItalic().run() },
    { label: 'Bullet List', action: () => editor.chain().focus().toggleBulletList().run() },
    { label: 'Ordered List', action: () => editor.chain().focus().toggleOrderedList().run() },
    { label: 'Blockquote', action: () => editor.chain().focus().toggleBlockquote().run() },
    { label: 'Code Block', action: () => editor.chain().focus().toggleCodeBlock().run() },
  ];

  // Simple detection: if the last typed character is '/' and the cursor is at the end of a line.
  useEffect(() => {
    if (!editor) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === '/') {
        setOpen(true);
        setFilter('');
        // Compute cursor position for overlay
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0) {
          const rect = selection.getRangeAt(0).getBoundingClientRect();
          setPosition({ top: rect.bottom + window.scrollY, left: rect.left + window.scrollX });
        }
      } else if (open && event.key === 'Escape') {
        setOpen(false);
      } else if (open && (event.key === 'Backspace' || event.key === 'Delete' || event.key.startsWith('Arrow'))) {
        // Close if '/' is no longer before the cursor
        try {
          const { from } = editor.state.selection;
          const textBefore = editor.state.doc.textBetween(0, from);
          if (!textBefore.endsWith('/')) {
            setOpen(false);
          }
        } catch (_) {}
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [editor, open]);

  // Close overlay when clicking outside
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (overlayRef.current && !overlayRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const filtered = commands.filter(c => c.label.toLowerCase().includes(filter.toLowerCase()));

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      className="slash-overlay"
      style={{
        position: 'absolute',
        top: `${position.top}px`,
        left: `${position.left}px`,
        background: 'var(--bg)',
        border: '1px solid var(--border)',
        padding: '4px',
        zIndex: 1000,
      }}
    >
      <input
        placeholder="Search command"
        value={filter}
        onChange={e => setFilter(e.target.value)}
        style={{ width: '100%', marginBottom: '4px' }}
      />
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, maxHeight: '200px', overflowY: 'auto' }}>
        {filtered.map((c, i) => (
          <li
            key={i}
            onClick={() => { c.action(); setOpen(false); }}
            style={{ padding: '2px 4px', cursor: 'pointer' }}
          >
            {c.label}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default SlashCommandOverlay;
