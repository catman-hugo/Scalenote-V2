import React, { useState } from 'react';

interface Props {
  onPick: () => void;
  onOpenPath: (path: string) => void;
  error: string | null;
  onClearError: () => void;
}

export const VaultPicker: React.FC<Props> = ({
  onPick,
  onOpenPath,
  error,
  onClearError,
}) => {
  const [manualPath, setManualPath] = useState('');

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualPath.trim()) {
      onOpenPath(manualPath.trim());
    }
  };

  return (
    <div className="vault-picker-container">
      <div className="vault-picker-card">
        <div className="vault-picker-header">
          <h1>ScaleNote</h1>
          <p>Local-first, offline notes and drawings</p>
        </div>

        {error && (
          <div className="error-boundary" style={{ margin: 0 }}>
            <p>{error}</p>
            <button onClick={onClearError} style={{ marginTop: 6 }}>
              Dismiss
            </button>
          </div>
        )}

        <div className="vault-picker-actions">
          <button className="primary" onClick={onPick} style={{ justifyContent: 'center', padding: '10px' }}>
            Choose Vault Folder
          </button>

          <form onSubmit={handleManualSubmit} className="manual-path-input">
            <input
              type="text"
              placeholder="/path/to/vault"
              value={manualPath}
              onChange={(e) => setManualPath(e.target.value)}
            />
            <button type="submit" disabled={!manualPath.trim()}>
              Open
            </button>
          </form>
        </div>

        <div className="vault-picker-notice">
          Everything is stored in standard Markdown and JSON sidecars inside your chosen folder.
          No accounts, no telemetry, and zero network calls.
        </div>
      </div>
    </div>
  );
};
