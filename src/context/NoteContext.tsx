import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
import * as Y from 'yjs';

type NoteContextType = {
  markdownContent: string;

  doc: Y.Doc | null;
  setDoc: (doc: Y.Doc) => void;
  noteId: string | null;
  vaultPath: string | null;
  loadNote: (vaultPath: string, noteId: string) => Promise<void>;
  saveAll: (markdown: string) => Promise<void>;
};

const NoteContext = createContext<NoteContextType | undefined>(undefined);

export const NoteContextProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [doc, setDoc] = useState<Y.Doc | null>(null);
  const [noteId, setNoteId] = useState<string | null>(null);
  const [vaultPath, setVaultPath] = useState<string | null>(null);
  const [markdownContent, setMarkdownContent] = useState<string>('');

  const loadNote = async (vault: string, id: string) => {
    setVaultPath(vault);
    setNoteId(id);
    // Load snapshot and markdown via Tauri commands
    const [snapshotBase64, status] = await invoke<[string, string]>('load_snapshot', { vaultPath: vault, noteId: id });
    // For now we ignore status, and load markdown via separate read_note if needed.
    // Fetch markdown content (fallback if needed)
    const markdown = await invoke('read_note', { vaultPath: vault, relPath: `${id}.md` }).catch(() => '');
    await invoke('rebuild_search_index', { vaultPath });

    const ydoc = new Y.Doc();
    if (snapshotBase64) {
      // Decode the base64‑encoded Yjs update into a Uint8Array.
      const updateBytes = Uint8Array.from(atob(snapshotBase64), c => c.charCodeAt(0));
      Y.applyUpdate(ydoc, updateBytes);
    } else {
      // Initialize doc from markdown using y‑tiptap parser (to be implemented).
    }
    setDoc(ydoc);
  };

  const saveAll = async (markdown: string) => {
    if (!vaultPath || !noteId || !doc) return;
    // Encode update
    const update = Y.encodeStateAsUpdate(doc);
    const base64 = btoa(String.fromCharCode(...Array.from(update)));
    await invoke('save_snapshot', { vaultPath, noteId, markdown, updateBase64: base64 });
  };

  return (
    <NoteContext.Provider value={{ doc, setDoc, noteId, vaultPath, loadNote, saveAll, markdownContent }}>
      {children}
    </NoteContext.Provider>
  );
};

export const useNoteContext = () => {
  const ctx = useContext(NoteContext);
  if (!ctx) throw new Error('useNoteContext must be used within NoteContextProvider');
  return ctx;
};
