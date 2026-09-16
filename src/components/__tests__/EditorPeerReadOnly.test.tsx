import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Editor } from '../Editor';
import type { NoteFile } from '../../types';

// Mock Tauri invoke to prevent network/ipc calls in test environment
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(['', 'no_snapshot']),
}));

describe('Editor Peer Read-Only Contract', () => {
  const mockNote: NoteFile = {
    id: '01937d2e-8f41-7a3c-9b22-5e1f0a6c8d44',
    name: 'Test Note',
    path: 'Test Note.md',
    created: '2026-09-16T12:00:00Z',
  };

  it('renders read-only warning banner and sets textarea readOnly when peerCount > 0 in markdown mode', async () => {
    const handleContentChange = vi.fn();
    const handleSaveImmediate = vi.fn();

    await act(async () => {
      render(
        <Editor
          activeNote={mockNote}
          content="---\nid: 01937d2e-8f41-7a3c-9b22-5e1f0a6c8d44\n---\n\nSample text"
          vaultPath="/test/vault"
          isSaving={false}
          lastSaved={new Date()}
          peerCount={1}
          mode="markdown"
          onContentChange={handleContentChange}
          onSaveImmediate={handleSaveImmediate}
        />
      );
    });

    // 1. Assert warning banner is rendered with the specific reason
    const banner = screen.getByText(/Markdown source mode is read-only while 1 collaborator is connected/i);
    expect(banner).toBeInTheDocument();

    // 2. Assert the textarea has readOnly set
    const textarea = screen.getByPlaceholderText(/Note is read-only while peers are connected/i);
    expect(textarea).toBeInTheDocument();
    expect(textarea).toHaveAttribute('readonly');
  });

  it('renders normal editable textarea with no warning banner when peerCount is 0 in markdown mode', async () => {
    const handleContentChange = vi.fn();
    const handleSaveImmediate = vi.fn();

    await act(async () => {
      render(
        <Editor
          activeNote={mockNote}
          content="---\nid: 01937d2e-8f41-7a3c-9b22-5e1f0a6c8d44\n---\n\nSample text"
          vaultPath="/test/vault"
          isSaving={false}
          lastSaved={new Date()}
          peerCount={0}
          mode="markdown"
          onContentChange={handleContentChange}
          onSaveImmediate={handleSaveImmediate}
        />
      );
    });

    // Assert banner is NOT present
    const banner = screen.queryByText(/Markdown source mode is read-only/i);
    expect(banner).not.toBeInTheDocument();

    // Assert textarea is editable
    const textarea = screen.getByPlaceholderText(/Start writing in Markdown/i);
    expect(textarea).toBeInTheDocument();
    expect(textarea).not.toHaveAttribute('readonly');
  });
});
