import React, { useState, useEffect } from 'react';
import Settings from './Settings';
import type { FileTreeEntry, FolderEntry, NoteFile } from '../types';

interface Props {
  vaultPath: string;
  tree: FileTreeEntry[];
  activeNote: NoteFile | null;
  onSelectNote: (note: NoteFile) => void;
  onCreateNote: (parentFolder: string, name: string) => Promise<NoteFile | null>;
  onCreateFolder: (parentFolder: string, name: string) => Promise<FolderEntry | null>;
  onRenameEntry: (oldRelPath: string, newName: string) => Promise<string | undefined>;
  onDeleteEntry: (relPath: string) => Promise<void>;
  onRefresh: () => void;
  onCloseVault: () => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
}

interface ModalState {
  type: 'create_note' | 'create_folder' | 'rename';
  parentFolder?: string;
  oldPath?: string;
  currentName?: string;
}

interface ContextMenuState {
  x: number;
  y: number;
  type: 'note' | 'folder' | 'root';
  relPath?: string;
  name?: string;
}

export const Sidebar: React.FC<Props> = ({
  vaultPath,
  tree,
  activeNote,
  onSelectNote,
  onCreateNote,
  onCreateFolder,
  onRenameEntry,
  onDeleteEntry,
  onRefresh,
  onCloseVault,
  theme,
  onToggleTheme,
}) => {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [showSettings, setShowSettings] = useState(false);
  const [modalInput, setModalInput] = useState('');
  const [modalError, setModalError] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const vaultName = vaultPath.split('/').filter(Boolean).pop() || 'Vault';

  // Close context menu on any global click or escape
  useEffect(() => {
    const handleDismiss = () => setContextMenu(null);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setContextMenu(null);
        if (modal) setModal(null);
      }
    };
    window.addEventListener('click', handleDismiss);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('click', handleDismiss);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [modal]);

  const toggleFolder = (path: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const handleOpenModal = (
    type: ModalState['type'],
    opts: { parentFolder?: string; oldPath?: string; currentName?: string } = {}
  ) => {
    setContextMenu(null);
    setModal({ type, ...opts });
    setModalInput(opts.currentName || '');
    setModalError(null);
  };

  // Helper to check for duplicates in the current target folder
  const checkDuplicate = (name: string, parentFolder: string = '', isDir: boolean = false): boolean => {
    const clean = name.trim().toLowerCase();
    const findInEntries = (entries: FileTreeEntry[], targetFolder: string): boolean => {
      if (!targetFolder) {
        return entries.some((e) => {
          if (isDir && e.type === 'folder') return e.folder.name.toLowerCase() === clean;
          if (!isDir && e.type === 'note') return e.note.name.toLowerCase() === clean;
          return false;
        });
      }

      for (const entry of entries) {
        if (entry.type === 'folder') {
          if (entry.folder.path === targetFolder) {
            return entry.folder.children.some((child) => {
              if (isDir && child.type === 'folder') return child.folder.name.toLowerCase() === clean;
              if (!isDir && child.type === 'note') return child.note.name.toLowerCase() === clean;
              return false;
            });
          }
          if (findInEntries(entry.folder.children, targetFolder)) return true;
        }
      }
      return false;
    };
    return findInEntries(tree, parentFolder);
  };

  const handleModalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modal || !modalInput.trim()) return;

    const input = modalInput.trim();

    // Client-side duplicate check
    if (modal.type === 'create_note') {
      if (checkDuplicate(input, modal.parentFolder || '', false)) {
        setModalError(`A note named "${input}" already exists in this folder.`);
        return;
      }
    } else if (modal.type === 'create_folder') {
      if (checkDuplicate(input, modal.parentFolder || '', true)) {
        setModalError(`A folder named "${input}" already exists in this folder.`);
        return;
      }
    } else if (modal.type === 'rename' && modal.currentName !== input) {
      const parent = modal.oldPath?.includes('/')
        ? modal.oldPath.substring(0, modal.oldPath.lastIndexOf('/'))
        : '';
      const isDir = modal.oldPath ? !modal.oldPath.endsWith('.md') : false;
      if (checkDuplicate(input, parent, isDir)) {
        setModalError(`An item named "${input}" already exists here.`);
        return;
      }
    }

    try {
      setModalError(null);
      if (modal.type === 'create_note') {
        await onCreateNote(modal.parentFolder || '', input);
      } else if (modal.type === 'create_folder') {
        await onCreateFolder(modal.parentFolder || '', input);
      } else if (modal.type === 'rename' && modal.oldPath) {
        await onRenameEntry(modal.oldPath, input);
      }

      setModal(null);
      setModalInput('');
    } catch (err: any) {
      const msg = typeof err === 'string' ? err : err?.message || String(err);
      setModalError(msg);
    }
  };

  const handleDelete = async (e: React.MouseEvent | null, relPath: string, isFolder: boolean) => {
    if (e) e.stopPropagation();
    setContextMenu(null);
    const kind = isFolder ? 'folder and its contents' : 'note';
    if (window.confirm(`Are you sure you want to delete this ${kind}?`)) {
      try {
        await onDeleteEntry(relPath);
      } catch (err: any) {
        alert(`Failed to delete: ${err?.message || err}`);
      }
    }
  };

  const handleContextMenu = (
    e: React.MouseEvent,
    type: 'note' | 'folder' | 'root',
    relPath?: string,
    name?: string
  ) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      type,
      relPath,
      name,
    });
  };

  const renderTree = (entries: FileTreeEntry[], depth = 0) => {
    return entries.map((entry) => {
      if (entry.type === 'folder') {
        const folder = entry.folder;
        const isExpanded = expandedFolders.has(folder.path);

        return (
          <div key={folder.path} className="tree-node">
            <div
              className="tree-row"
              onClick={() => toggleFolder(folder.path)}
              onContextMenu={(e) => handleContextMenu(e, 'folder', folder.path, folder.name)}
              style={{ paddingLeft: `${depth * 12 + 8}px` }}
              title={folder.path}
            >
              <span className="tree-toggle">{isExpanded ? '▼' : '▶'}</span>
              <span className="tree-icon">📁</span>
              <span className="tree-label">{folder.name}</span>
              <div className="tree-actions" onClick={(e) => e.stopPropagation()}>
                <button
                  className="tree-action-btn"
                  title="New Note in Folder"
                  onClick={() => handleOpenModal('create_note', { parentFolder: folder.path })}
                >
                  +📄
                </button>
                <button
                  className="tree-action-btn"
                  title="Rename Folder"
                  onClick={() =>
                    handleOpenModal('rename', {
                      oldPath: folder.path,
                      currentName: folder.name,
                    })
                  }
                >
                  ✏️
                </button>
                <button
                  className="tree-action-btn danger"
                  title="Delete Folder"
                  onClick={(e) => handleDelete(e, folder.path, true)}
                >
                  🗑️
                </button>
              </div>
            </div>
            {isExpanded && (
              <div className="tree-children">
                {folder.children.length === 0 ? (
                  <div
                    style={{
                      paddingLeft: `${(depth + 1) * 12 + 8}px`,
                      fontSize: '11px',
                      color: 'var(--text-muted)',
                      paddingTop: '3px',
                      paddingBottom: '3px',
                    }}
                  >
                    Empty folder
                  </div>
                ) : (
                  renderTree(folder.children, depth + 1)
                )}
              </div>
            )}
          </div>
        );
      } else {
        const note = entry.note;
        const isActive = activeNote?.path === note.path;

        return (
          <div key={note.path} className="tree-node">
            <div
              className={`tree-row ${isActive ? 'active' : ''}`}
              onClick={() => onSelectNote(note)}
              onContextMenu={(e) => handleContextMenu(e, 'note', note.path, note.name)}
              style={{ paddingLeft: `${depth * 12 + 8}px` }}
              title={note.path}
            >
              <span className="tree-toggle" style={{ visibility: 'hidden' }}>•</span>
              <span className="tree-icon">📝</span>
              <span className="tree-label">{note.name}</span>
              <div className="tree-actions" onClick={(e) => e.stopPropagation()}>
                <button
                  className="tree-action-btn"
                  title="Rename Note"
                  onClick={() =>
                    handleOpenModal('rename', {
                      oldPath: note.path,
                      currentName: note.name,
                    })
                  }
                >
                  ✏️
                </button>
                <button
                  className="tree-action-btn danger"
                  title="Delete Note"
                  onClick={(e) => handleDelete(e, note.path, false)}
                >
                  🗑️
                </button>
              </div>
            </div>
          </div>
        );
      }
    });
  };

  return (
    <aside
      className="sidebar"
      onContextMenu={(e) => handleContextMenu(e, 'root')}
    >
      <div className="sidebar-header">
        <div className="vault-info">
          <span className="vault-title">{vaultName}</span>
          <span className="vault-path" title={vaultPath}>
            {vaultPath}
          </span>
        </div>
        <div className="sidebar-actions">
          <button
            className="sidebar-icon-btn"
            title="New Note"
            onClick={() => handleOpenModal('create_note', { parentFolder: '' })}
          >
            +📄
          </button>
          <button
            className="sidebar-icon-btn"
            title="New Folder"
            onClick={() => handleOpenModal('create_folder', { parentFolder: '' })}
          >
            +📁
          </button>
          <button className="sidebar-icon-btn" title="Refresh Tree" onClick={onRefresh}>
            🔄
          </button>
        </div>
      </div>

      <div className="sidebar-tree">
        {tree.length === 0 ? (
          <div style={{ padding: '16px', color: 'var(--text-muted)', fontSize: '13px' }}>
            No notes or folders yet. Click +📄 to create your first note.
          </div>
        ) : (
          renderTree(tree)
        )}
      </div>

      <div className="sidebar-footer">
        <button
          className="sidebar-icon-btn"
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          onClick={onToggleTheme}
        >
          {theme === 'dark' ? '☀️ Light' : '🌙 Dark'}
        </button>
        <button
          className="sidebar-icon-btn"
          title="Settings"
          onClick={() => setShowSettings(true)}
        >
          ⚙️
        </button>
        <button className="sidebar-icon-btn" title="Close Vault" onClick={onCloseVault}>
          ✕ Close
        </button>
      </div>

      {/* Custom Context Menu */}
      {contextMenu && (
        <div
          className="custom-context-menu"
          style={{
            position: 'fixed',
            top: contextMenu.y,
            left: contextMenu.x,
            background: 'var(--bg-secondary, #252526)',
            border: '1px solid var(--border-color, #3c3c3c)',
            borderRadius: '6px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
            zIndex: 9999,
            minWidth: '150px',
            padding: '4px 0',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.type === 'note' && (
            <>
              <button
                className="context-menu-item"
                style={contextMenuItemStyle}
                onClick={() =>
                  handleOpenModal('rename', {
                    oldPath: contextMenu.relPath,
                    currentName: contextMenu.name,
                  })
                }
              >
                ✏️ Rename
              </button>
              <button
                className="context-menu-item danger"
                style={{ ...contextMenuItemStyle, color: 'var(--danger, #ff6b6b)' }}
                onClick={() => handleDelete(null, contextMenu.relPath!, false)}
              >
                🗑️ Delete
              </button>
            </>
          )}

          {contextMenu.type === 'folder' && (
            <>
              <button
                className="context-menu-item"
                style={contextMenuItemStyle}
                onClick={() =>
                  handleOpenModal('create_note', { parentFolder: contextMenu.relPath })
                }
              >
                +📄 New Note
              </button>
              <button
                className="context-menu-item"
                style={contextMenuItemStyle}
                onClick={() =>
                  handleOpenModal('create_folder', { parentFolder: contextMenu.relPath })
                }
              >
                +📁 New Folder
              </button>
              <button
                className="context-menu-item"
                style={contextMenuItemStyle}
                onClick={() =>
                  handleOpenModal('rename', {
                    oldPath: contextMenu.relPath,
                    currentName: contextMenu.name,
                  })
                }
              >
                ✏️ Rename
              </button>
              <button
                className="context-menu-item danger"
                style={{ ...contextMenuItemStyle, color: 'var(--danger, #ff6b6b)' }}
                onClick={() => handleDelete(null, contextMenu.relPath!, true)}
              >
                🗑️ Delete
              </button>
            </>
          )}

          {contextMenu.type === 'root' && (
            <>
              <button
                className="context-menu-item"
                style={contextMenuItemStyle}
                onClick={() => handleOpenModal('create_note', { parentFolder: '' })}
              >
                +📄 New Note
              </button>
              <button
                className="context-menu-item"
                style={contextMenuItemStyle}
                onClick={() => handleOpenModal('create_folder', { parentFolder: '' })}
              >
                +📁 New Folder
              </button>
            </>
          )}
        </div>
      )}

      {/* Modal for Create/Rename */}
      {modal && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>
              {modal.type === 'create_note' && 'New Note'}
              {modal.type === 'create_folder' && 'New Folder'}
              {modal.type === 'rename' && 'Rename Item'}
            </h3>
            {modalError && (
              <div
                style={{
                  background: 'rgba(255, 75, 75, 0.15)',
                  border: '1px solid var(--danger, #ff4b4b)',
                  borderRadius: '4px',
                  padding: '8px 12px',
                  fontSize: '12px',
                  color: 'var(--danger, #ff4b4b)',
                  marginBottom: '12px',
                }}
              >
                ⚠️ {modalError}
              </div>
            )}
            <form onSubmit={handleModalSubmit}>
              <input
                autoFocus
                type="text"
                value={modalInput}
                onChange={(e) => {
                  setModalInput(e.target.value);
                  if (modalError) setModalError(null);
                }}
                placeholder="Name"
                style={{ width: '100%', marginBottom: '14px' }}
              />
              <div className="modal-actions">
                <button type="button" onClick={() => setModal(null)}>
                  Cancel
                </button>
                <button type="submit" className="primary" disabled={!modalInput.trim()}>
                  {modal.type === 'rename' ? 'Rename' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showSettings && (
        <Settings
          vaultPath={vaultPath}
          theme={theme}
          onToggleTheme={onToggleTheme}
          onClose={() => setShowSettings(false)}
        />
      )}
    </aside>
  );
};

const contextMenuItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  width: '100%',
  padding: '8px 14px',
  background: 'transparent',
  border: 'none',
  textAlign: 'left',
  fontSize: '13px',
  color: 'inherit',
  cursor: 'pointer',
};
