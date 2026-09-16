export interface NoteFile {
  id: string;         // UUIDv7 from frontmatter
  name: string;       // filename without .md
  path: string;       // vault-relative path
  created: string;    // RFC 3339
}

export interface FolderEntry {
  name: string;
  path: string;
  children: FileTreeEntry[];
}

export type FileTreeEntry =
  | { type: 'note'; note: NoteFile }
  | { type: 'folder'; folder: FolderEntry };

export interface VaultState {
  path: string;       // absolute path on disk
  tree: FileTreeEntry[];
}

export type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'trace';
