import React, { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

const WikilinkAutocomplete: React.FC<{ editor: any }> = ({ editor }) => {
  const [open, setOpen] = useState(false);
  const [prefix, setPrefix] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);

  // Detect "[[" pattern on keydown.
  useEffect(() => {
    if (!editor) return;
    const handleKey = async (event: KeyboardEvent) => {
      if (event.key === '[') {
        // Look back two characters in the editor's HTML to see if we have "[[".
        const html = editor.getHTML();
        if (html.endsWith('[')) {
          // The user just typed the second '['.
          setOpen(true);
          setPrefix('');
          setSuggestions([]);
        }
      } else if (open) {
        if (event.key === 'Escape') {
          setOpen(false);
          return;
        }
        if (event.key === 'Enter') {
          // Insert the first suggestion.
          if (suggestions.length) {
            const title = suggestions[0];
            editor.chain().focus().insertContent(`[[${title}]]`).run();
          }
          setOpen(false);
          return;
        }
        // Update prefix and fetch suggestions.
        const newPrefix = prefix + event.key;
        setPrefix(newPrefix);
        try {
          const res = await invoke('search_titles', { vaultPath: editor.storage?.vaultPath || '', prefix: newPrefix });
          setSuggestions(res as string[]);
        } catch (e) {
          console.error('search_titles error', e);
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [editor, open, prefix]);

  if (!open) return null;

  return (
    <div className="wikilink-autocomplete" style={{
      position: 'absolute', top: '40px', left: '10px', background: 'var(--bg)', border: '1px solid var(--border)', padding: '4px', zIndex: 1000,
    }}
    >
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, maxHeight: '150px', overflowY: 'auto' }}
      >
        {suggestions.map((s, i) => (
          <li key={i} onClick={() => { editor.chain().focus().insertContent(`[[${s}]]`).run(); setOpen(false); }}
            style={{ padding: '2px 4px', cursor: 'pointer' }}
          >
            {s}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default WikilinkAutocomplete;
