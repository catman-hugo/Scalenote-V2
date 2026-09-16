import React, { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface CommandPaletteProps {
  vaultPath: string | null;
  onSelectNotePath: (relPath: string) => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({ vaultPath, onSelectNotePath }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Open palette on Ctrl+P / Cmd+P
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        setOpen((prev) => !prev);
        setQuery('');
        setResults([]);
        setSelectedIndex(0);
      }
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Perform search when query changes
  useEffect(() => {
    if (!open || !vaultPath) return;
    if (!query.trim()) {
      setResults([]);
      return;
    }
    (async () => {
      try {
        const res = await invoke<string[]>('search_query', { vaultPath, query: query.trim() });
        setResults(res || []);
        setSelectedIndex(0);
      } catch (err) {
        console.error('search_query error', err);
        setResults([]);
      }
    })();
  }, [query, open, vaultPath]);

  if (!open) return null;

  const handleSelect = (path: string) => {
    onSelectNotePath(path);
    setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (results.length > 0 ? (prev + 1) % results.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (results.length > 0 ? (prev - 1 + results.length) % results.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results[selectedIndex]) {
        handleSelect(results[selectedIndex]);
      }
    }
  };

  return (
    <div
      className="modal-overlay"
      onClick={() => setOpen(false)}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '15vh',
        zIndex: 10000,
      }}
    >
      <div
        className="command-palette-modal"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-secondary, #252526)',
          border: '1px solid var(--border-color, #3c3c3c)',
          borderRadius: '8px',
          width: '520px',
          maxWidth: '90vw',
          maxHeight: '60vh',
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ padding: '12px', borderBottom: '1px solid var(--border-color, #333)' }}>
          <input
            autoFocus
            placeholder="Search notes across vault (Ctrl+P)..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            style={{
              width: '100%',
              padding: '8px 12px',
              fontSize: '14px',
              background: 'var(--bg-primary, #1e1e1e)',
              color: 'inherit',
              border: '1px solid var(--border-color, #444)',
              borderRadius: '4px',
              outline: 'none',
            }}
          />
        </div>

        <div style={{ flex: 1, overflowY: 'auto', maxHeight: '350px' }}>
          {results.length === 0 ? (
            <div style={{ padding: '16px', color: 'var(--text-muted, #888)', fontSize: '13px', textAlign: 'center' }}>
              {query.trim() ? 'No matching notes found' : 'Type to search all note contents...'}
            </div>
          ) : (
            <ul style={{ listStyle: 'none', padding: '4px 0', margin: 0 }}>
              {results.map((path, idx) => (
                <li
                  key={idx}
                  onClick={() => handleSelect(path)}
                  style={{
                    padding: '8px 16px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    background: idx === selectedIndex ? 'var(--accent-color, #007acc)' : 'transparent',
                    color: idx === selectedIndex ? '#fff' : 'inherit',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <span>📝</span>
                  <span>{path}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

export default CommandPalette;
