import React, { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useNoteContext } from '../context/NoteContext';

const BacklinksPanel: React.FC = () => {
  const { vaultPath, noteId } = useNoteContext();
  const [backlinks, setBacklinks] = useState<string[]>([]);

  useEffect(() => {
    if (!vaultPath || !noteId) return;
    // Note title is not directly available; we will use noteId as placeholder.
    // In a full implementation we would extract the title from the markdown.
    (async () => {
      try {
        const res = await invoke('find_backlinks', { vaultPath, noteTitle: noteId });
        setBacklinks(res as string[]);
      } catch (e) {
        console.error('find_backlinks error', e);
      }
    })();
  }, [vaultPath, noteId]);

  if (!backlinks.length) return null;

  return (
    <div className="backlinks-panel" style={{ marginTop: '1rem', padding: '0.5rem', border: '1px solid var(--border)' }}
    >
      <h4>Backlinks</h4>
      <ul style={{ listStyle: 'none', paddingLeft: 0 }}>
        {backlinks.map((path, idx) => (
          <li key={idx}>{path}</li>
        ))}
      </ul>
    </div>
  );
};

export default BacklinksPanel;
