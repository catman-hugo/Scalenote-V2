import { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { FileTreeEntry, NoteFile, FolderEntry, VaultState } from '../types';
import { logger } from '../lib/logger';

const LAST_VAULT_KEY = 'scalenote:last_vault';
const AUTOSAVE_DELAY_MS = 750;

export function useVault() {
  const [vaultPath, setVaultPath] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState<boolean>(() => {
    return !!localStorage.getItem(LAST_VAULT_KEY);
  });
  const [tree, setTree] = useState<FileTreeEntry[]>([]);
  const [activeNote, setActiveNote] = useState<NoteFile | null>(null);
  const [noteContent, setNoteContent] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const saveTimerRef = useRef<number | null>(null);
  const currentContentRef = useRef<string>('');
  const activeNoteRef = useRef<NoteFile | null>(null);

  currentContentRef.current = noteContent;
  activeNoteRef.current = activeNote;

  const refreshTree = useCallback(async (vPath?: string) => {
    const p = vPath || vaultPath;
    if (!p) return;
    try {
      const newTree = await invoke<FileTreeEntry[]>('get_vault_tree', { vaultPath: p });
      setTree(newTree);
    } catch (err: any) {
      logger.error('Failed to refresh vault tree', { error: String(err) });
      setError(String(err));
    }
  }, [vaultPath]);

  const openVault = useCallback(async (path: string) => {
    try {
      setError(null);
      const state = await invoke<VaultState>('open_vault', { vaultPath: path });
          // Request runtime file-system permission scoped to the selected vault folder
          await invoke('grant_vault_fs_access', { vault_path: state.path });
      setVaultPath(state.path);
      setTree(state.tree);
      setActiveNote(null);
      setNoteContent('');
      localStorage.setItem(LAST_VAULT_KEY, state.path);
      logger.info('Vault opened', { path: state.path, items: state.tree.length });
    } catch (err: any) {
      logger.error('Failed to open vault', { path, error: String(err) });
      const msg = typeof err === 'string' ? err : err?.message || String(err);
      setError(`Failed to open vault: ${msg}`);
      localStorage.removeItem(LAST_VAULT_KEY);
      setVaultPath(null);
    }
  }, []);

  const pickVault = useCallback(async () => {
    try {
      const chosen = await invoke<string | null>('select_vault_dialog');
      if (chosen) {
        await openVault(chosen);
      }
    } catch (err: any) {
      logger.error('Failed to pick vault directory', { error: String(err) });
      setError(`Failed to pick folder: ${err}`);
    }
  }, [openVault]);

  const closeVault = useCallback(() => {
    setVaultPath(null);
    setTree([]);
    setActiveNote(null);
    setNoteContent('');
    localStorage.removeItem(LAST_VAULT_KEY);
    logger.info('Vault closed');
  }, []);

  const saveActiveNoteImmediate = useCallback(async () => {
    const note = activeNoteRef.current;
    const content = currentContentRef.current;
    if (!vaultPath || !note) return;

    try {
      setIsSaving(true);
      const updatedNote = await invoke<NoteFile>('write_note', {
        vaultPath,
        relPath: note.path,
        content,
      });
      setActiveNote(updatedNote);
      setLastSaved(new Date());
    } catch (err: any) {
      logger.error('Failed to write note atomically', { path: note.path, error: String(err) });
      setError(`Failed to save note: ${err}`);
    } finally {
      setIsSaving(false);
    }
  }, [vaultPath]);

  const selectNote = useCallback(async (note: NoteFile) => {
    if (!vaultPath) return;

    // Flush any pending save before switching notes
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
      await saveActiveNoteImmediate();
    }

    try {
      setError(null);
      const content = await invoke<string>('read_note', {
        vaultPath,
        relPath: note.path,
      });
      setActiveNote(note);
      setNoteContent(content);
      currentContentRef.current = content;
      setLastSaved(new Date());
      logger.debug('Read note', { path: note.path, id: note.id });
    } catch (err: any) {
      logger.error('Failed to read note', { path: note.path, error: String(err) });
      setError(`Failed to read note: ${err}`);
    }
  }, [vaultPath, saveActiveNoteImmediate]);

  const updateContent = useCallback((newContent: string) => {
    setNoteContent(newContent);
    currentContentRef.current = newContent;

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = window.setTimeout(() => {
      saveActiveNoteImmediate();
      saveTimerRef.current = null;
    }, AUTOSAVE_DELAY_MS);
  }, [saveActiveNoteImmediate]);

  const createNote = useCallback(async (parentFolder: string, name: string) => {
    if (!vaultPath) return null;
    try {
      setError(null);
      const note = await invoke<NoteFile>('create_note', {
        vaultPath,
        parentFolder,
        name,
      });
      await refreshTree();
      await selectNote(note);
      logger.info('Created note', { path: note.path, id: note.id });
      return note;
    } catch (err: any) {
      logger.error('Failed to create note', { parentFolder, name, error: String(err) });
      const msg = typeof err === 'string' ? err : err?.message || String(err);
      setError(`Failed to create note: ${msg}`);
      throw new Error(msg);
    }
  }, [vaultPath, refreshTree, selectNote]);

  const createFolder = useCallback(async (parentFolder: string, name: string) => {
    if (!vaultPath) return null;
    try {
      setError(null);
      const folder = await invoke<FolderEntry>('create_folder', {
        vaultPath,
        parentFolder,
        name,
      });
      await refreshTree();
      logger.info('Created folder', { path: folder.path });
      return folder;
    } catch (err: any) {
      logger.error('Failed to create folder', { parentFolder, name, error: String(err) });
      const msg = typeof err === 'string' ? err : err?.message || String(err);
      setError(`Failed to create folder: ${msg}`);
      throw new Error(msg);
    }
  }, [vaultPath, refreshTree]);

  const renameEntry = useCallback(async (oldRelPath: string, newName: string) => {
    if (!vaultPath) return;
    try {
      setError(null);
      const newPath = await invoke<string>('rename_entry', {
        vaultPath,
        oldRelPath,
        newName,
      });
      await refreshTree();
      if (activeNote && (activeNote.path === oldRelPath || activeNote.path.startsWith(`${oldRelPath}/`))) {
        const cleanName = newName.replace(/\.md$/, '');
        setActiveNote((prev) => (prev ? { ...prev, path: newPath, name: cleanName } : null));

        // Reload note content if active note was renamed so heading change is loaded
        if (activeNote.path === oldRelPath) {
          try {
            const updatedContent = await invoke<string>('read_note', {
              vaultPath,
              relPath: newPath,
            });
            setNoteContent(updatedContent);
            currentContentRef.current = updatedContent;
          } catch (_) {}
        }
      }
      logger.info('Renamed entry', { old: oldRelPath, new: newPath });
      return newPath;
    } catch (err: any) {
      logger.error('Failed to rename entry', { oldRelPath, newName, error: String(err) });
      const msg = typeof err === 'string' ? err : err?.message || String(err);
      setError(`Failed to rename: ${msg}`);
      throw new Error(msg);
    }
  }, [vaultPath, activeNote, refreshTree]);

  const deleteEntry = useCallback(async (relPath: string) => {
    if (!vaultPath) return;
    try {
      setError(null);
      await invoke('delete_entry', { vaultPath, relPath });
      await refreshTree();
      if (activeNote && (activeNote.path === relPath || activeNote.path.startsWith(`${relPath}/`))) {
        setActiveNote(null);
        setNoteContent('');
      }
      logger.info('Deleted entry', { path: relPath });
    } catch (err: any) {
      logger.error('Failed to delete entry', { relPath, error: String(err) });
      setError(`Failed to delete: ${err}`);
      throw err;
    }
  }, [vaultPath, activeNote, refreshTree]);

  // Restore last opened vault on startup without flash
  useEffect(() => {
    const saved = localStorage.getItem(LAST_VAULT_KEY);
    if (saved) {
      openVault(saved).finally(() => {
        setIsInitializing(false);
      });
    } else {
      setIsInitializing(false);
    }
  }, [openVault]);

  // Clean up auto-save timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, []);

  return {
    vaultPath,
    isInitializing,
    tree,
    activeNote,
    noteContent,
    isSaving,
    lastSaved,
    error,
    clearError: () => setError(null),
    pickVault,
    openVault,
    closeVault,
    refreshTree,
    selectNote,
    updateContent,
    saveActiveNoteImmediate,
    createNote,
    createFolder,
    renameEntry,
    deleteEntry,
  };
}
