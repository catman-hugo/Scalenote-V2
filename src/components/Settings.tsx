import { invoke } from '@tauri-apps/api/core';
import React, { useState, useEffect } from 'react';

type SettingsProps = {
  vaultPath?: string;
  theme?: 'dark' | 'light';
  onToggleTheme?: () => void;
  onClose: () => void;
};

const ACCENT_COLOR_KEY = 'scalenote:accent_color';
const FONT_SIZE_KEY = 'scalenote:font_size';
const EDITOR_WIDTH_KEY = 'scalenote:editor_width';
const DEFAULT_MODE_KEY = 'scalenote:default_mode';

const Settings: React.FC<SettingsProps> = ({
  vaultPath,
  theme = 'dark',
  onToggleTheme,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'general' | 'diagnostics'>('general');
  const [verbose, setVerbose] = useState(false);
  const [accentColor, setAccentColor] = useState(() => {
    return localStorage.getItem(ACCENT_COLOR_KEY) || '#007acc';
  });
  const [fontSize, setFontSize] = useState<number>(() => {
    return parseInt(localStorage.getItem(FONT_SIZE_KEY) || '15', 10);
  });
  const [editorWidth, setEditorWidth] = useState(() => {
    return localStorage.getItem(EDITOR_WIDTH_KEY) || 'standard';
  });
  const [defaultMode, setDefaultMode] = useState(() => {
    return localStorage.getItem(DEFAULT_MODE_KEY) || 'rich';
  });
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.style.setProperty('--accent-color', accentColor);
    localStorage.setItem(ACCENT_COLOR_KEY, accentColor);
  }, [accentColor]);

  useEffect(() => {
    document.documentElement.style.setProperty('--font-size-base', `${fontSize}px`);
    localStorage.setItem(FONT_SIZE_KEY, String(fontSize));
  }, [fontSize]);

  useEffect(() => {
    localStorage.setItem(EDITOR_WIDTH_KEY, editorWidth);
  }, [editorWidth]);

  useEffect(() => {
    localStorage.setItem(DEFAULT_MODE_KEY, defaultMode);
  }, [defaultMode]);

  const toggleVerbose = async () => {
    const newVal = !verbose;
    setVerbose(newVal);
    try {
      await invoke('set_verbose_logging', { enabled: newVal });
      setStatusMessage(`Verbose logging ${newVal ? 'enabled' : 'disabled'}`);
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (e: any) {
      console.error('Failed to set verbose logging', e);
    }
  };

  const openLogs = async () => {
    try {
      await invoke('open_logs_folder');
      setStatusMessage('Opening logs folder in file manager');
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (e: any) {
      console.error('Failed to open logs folder', e);
      setStatusMessage(`Failed to open logs: ${e?.message || e}`);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-dialog settings-dialog"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '560px',
          maxWidth: '90vw',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1rem',
          }}
        >
          <h3 style={{ margin: 0 }}>Settings</h3>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: '18px',
              cursor: 'pointer',
              color: 'var(--text-muted)',
            }}
          >
            ✕
          </button>
        </div>

        <div className="tabs" style={{ display: 'flex', gap: '8px', marginBottom: '1.2rem', borderBottom: '1px solid var(--border-color, #333)', paddingBottom: '8px' }}>
          <button
            className={`tab-button ${activeTab === 'general' ? 'primary' : ''}`}
            onClick={() => setActiveTab('general')}
            style={{
              padding: '6px 14px',
              fontSize: '13px',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            General
          </button>
          <button
            className={`tab-button ${activeTab === 'diagnostics' ? 'primary' : ''}`}
            onClick={() => setActiveTab('diagnostics')}
            style={{
              padding: '6px 14px',
              fontSize: '13px',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            Diagnostics
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', paddingRight: '4px' }}>
          {activeTab === 'general' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="settings-row" style={rowStyle}>
                <div>
                  <div style={labelStyle}>Theme</div>
                  <div style={descStyle}>Toggle between dark and light appearance</div>
                </div>
                <button
                  type="button"
                  onClick={onToggleTheme}
                  style={{ padding: '6px 12px', fontSize: '12px' }}
                >
                  {theme === 'dark' ? '☀️ Switch to Light' : '🌙 Switch to Dark'}
                </button>
              </div>

              <div className="settings-row" style={rowStyle}>
                <div>
                  <div style={labelStyle}>Accent Color</div>
                  <div style={descStyle}>Customize UI accent and highlight color</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="color"
                    value={accentColor}
                    onChange={(e) => setAccentColor(e.target.value)}
                    style={{
                      width: '36px',
                      height: '30px',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      background: 'transparent',
                    }}
                  />
                  <span style={{ fontSize: '12px', fontFamily: 'monospace' }}>{accentColor}</span>
                </div>
              </div>

              <div className="settings-row" style={rowStyle}>
                <div>
                  <div style={labelStyle}>Editor Font Size ({fontSize}px)</div>
                  <div style={descStyle}>Base typography scale for notes</div>
                </div>
                <input
                  type="range"
                  min={12}
                  max={24}
                  value={fontSize}
                  onChange={(e) => setFontSize(parseInt(e.target.value, 10))}
                  style={{ width: '120px' }}
                />
              </div>

              <div className="settings-row" style={rowStyle}>
                <div>
                  <div style={labelStyle}>Editor Max Width</div>
                  <div style={descStyle}>Reading line width limit</div>
                </div>
                <select
                  value={editorWidth}
                  onChange={(e) => setEditorWidth(e.target.value)}
                  style={{ padding: '4px 8px', borderRadius: '4px' }}
                >
                  <option value="compact">Compact (680px)</option>
                  <option value="standard">Standard (840px)</option>
                  <option value="full">Full width (100%)</option>
                </select>
              </div>

              <div className="settings-row" style={rowStyle}>
                <div>
                  <div style={labelStyle}>Default Note View Mode</div>
                  <div style={descStyle}>Default representation when opening notes</div>
                </div>
                <select
                  value={defaultMode}
                  onChange={(e) => setDefaultMode(e.target.value)}
                  style={{ padding: '4px 8px', borderRadius: '4px' }}
                >
                  <option value="rich">Rich Text (Tiptap)</option>
                  <option value="markdown">Markdown (Raw Source)</option>
                </select>
              </div>

              <div style={{ borderTop: '1px solid var(--border-color, #333)', paddingTop: '14px', marginTop: '6px' }}>
                <h4 style={{ margin: '0 0 10px 0', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)' }}>
                  Peer-to-Peer Connection
                </h4>
                <div className="settings-row" style={rowStyle}>
                  <div>
                    <div style={labelStyle}>P2P Discovery Status</div>
                    <div style={descStyle}>Local LAN & QUIC listening port</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#4caf50', display: 'inline-block' }}></span>
                    <span>Ready (UDP 57420)</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'diagnostics' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="settings-row" style={rowStyle}>
                <div>
                  <div style={labelStyle}>Verbose Logging</div>
                  <div style={descStyle}>Enable DEBUG level logs for troubleshooting</div>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={verbose}
                    onChange={toggleVerbose}
                    style={{ width: '16px', height: '16px' }}
                  />
                  <span style={{ fontSize: '13px' }}>{verbose ? 'Enabled' : 'Disabled'}</span>
                </label>
              </div>

              <div className="settings-row" style={rowStyle}>
                <div>
                  <div style={labelStyle}>Application Logs</div>
                  <div style={descStyle}>Open rotation log folder in OS file manager</div>
                </div>
                <button onClick={openLogs} style={{ padding: '6px 12px', fontSize: '12px' }}>
                  📁 Open Logs Folder
                </button>
              </div>

              <div className="settings-row" style={rowStyle}>
                <div>
                  <div style={labelStyle}>Active Vault</div>
                  <div style={descStyle}>{vaultPath || 'No vault currently open'}</div>
                </div>
              </div>

              <div className="settings-row" style={rowStyle}>
                <div>
                  <div style={labelStyle}>Version</div>
                  <div style={descStyle}>ScaleNote v0.2.1 (Milestone 2 Core Edition)</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {statusMessage && (
          <div
            style={{
              marginTop: '12px',
              padding: '6px 12px',
              fontSize: '12px',
              borderRadius: '4px',
              background: 'var(--bg-secondary, #252526)',
              color: 'var(--accent-color, #007acc)',
              border: '1px solid var(--accent-color, #007acc)',
            }}
          >
            {statusMessage}
          </div>
        )}

        <div style={{ marginTop: '1.2rem', display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '6px 16px', fontSize: '13px' }}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '10px 0',
  borderBottom: '1px solid var(--border-subtle, rgba(255,255,255,0.06))',
};

const labelStyle: React.CSSProperties = {
  fontSize: '13px',
  fontWeight: 500,
  marginBottom: '2px',
};

const descStyle: React.CSSProperties = {
  fontSize: '12px',
  color: 'var(--text-muted, #888)',
};

export default Settings;
