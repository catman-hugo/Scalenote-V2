import React, { useState, useEffect, useCallback } from 'react';
import { useVault } from './hooks/useVault';
import { Sidebar } from './components/Sidebar';
import { Editor } from './components/Editor';
import { VaultPicker } from './components/VaultPicker';
import { CommandPalette } from './components/CommandPalette';
import { QuickSwitcher } from './components/QuickSwitcher';
import BacklinksPanel from './components/BacklinksPanel';
import TagBrowser from './components/TagBrowser';
import { NoteContextProvider } from './context/NoteContext';
import { ErrorBoundary } from './lib/errorBoundary';
import type { NoteFile, FileTreeEntry } from './types';

const THEME_KEY = 'scalenote:theme';

export const App: React.FC = () => {
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem(THEME_KEY) as 'dark' | 'light') || 'dark';
  });

  const {
    vaultPath,
    isInitializing,
    tree,
    activeNote,
    noteContent,
    isSaving,
    lastSaved,
    error,
    clearError,
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
  } = useVault();

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  // Helper to select a note by vault-relative path (for CommandPalette & QuickSwitcher)
  const handleSelectNotePath = useCallback(
    async (relPath: string) => {
      const findNoteInTree = (entries: FileTreeEntry[]): NoteFile | null => {
        for (const entry of entries) {
          if (entry.type === 'note' && entry.note.path === relPath) {
            return entry.note;
          }
          if (entry.type === 'folder') {
            const found = findNoteInTree(entry.folder.children);
            if (found) return found;
          }
        }
        return null;
      };

      const foundNote = findNoteInTree(tree);
      if (foundNote) {
        await selectNote(foundNote);
      } else {
        const stem = relPath.split('/').pop()?.replace(/\.md$/, '') || 'Untitled';
        await selectNote({
          id: stem,
          name: stem,
          path: relPath,
          created: new Date().toISOString(),
        });
      }
    },
    [tree, selectNote]
  );

  // Prevent flash while loading previously saved vault
  if (isInitializing) {
    return (
      <div
        className="app-container"
        data-theme={theme}
        style={{
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-muted, #888)',
          background: 'var(--bg-app, #1e1e1e)',
        }}
      >
        <div style={{ fontSize: '14px' }}>Loading vault...</div>
      </div>
    );
  }

  return (
    <NoteContextProvider>
      <div className="app-container" data-theme={theme}>
        {!vaultPath ? (
          <ErrorBoundary name="Vault Picker">
            <VaultPicker
              onPick={pickVault}
              onOpenPath={openVault}
              error={error}
              onClearError={clearError}
            />
          </ErrorBoundary>
        ) : (
          <>
            <ErrorBoundary name="Sidebar">
              <Sidebar
                vaultPath={vaultPath}
                tree={tree}
                activeNote={activeNote}
                onSelectNote={selectNote}
                onCreateNote={createNote}
                onCreateFolder={createFolder}
                onRenameEntry={renameEntry}
                onDeleteEntry={deleteEntry}
                onRefresh={refreshTree}
                onCloseVault={closeVault}
                theme={theme}
                onToggleTheme={toggleTheme}
              />
            </ErrorBoundary>

            <div
              className="main-content"
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
                overflow: 'hidden',
              }}
            >
              <ErrorBoundary name="Editor">
                <Editor
                  activeNote={activeNote}
                  content={noteContent}
                  vaultPath={vaultPath}
                  isSaving={isSaving}
                  lastSaved={lastSaved}
                  onContentChange={updateContent}
                  onSaveImmediate={saveActiveNoteImmediate}
                />
              </ErrorBoundary>
            </div>
          </>
        )}

        {/* Global shortcut overlays */}
        <CommandPalette
          vaultPath={vaultPath}
          onSelectNotePath={handleSelectNotePath}
        />
        <QuickSwitcher
          vaultPath={vaultPath}
          onSelectNotePath={handleSelectNotePath}
        />
      </div>
    </NoteContextProvider>
  );
};

export default App;
