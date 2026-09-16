import React from 'react';
import { Editor } from '@tiptap/react';

type ToolbarProps = {
  editor: Editor | null;
  mode: 'rich' | 'markdown';
  onToggleMode: () => void;
  onSaveImmediate?: () => void;
};

export const Toolbar: React.FC<ToolbarProps> = ({
  editor,
  mode,
  onToggleMode,
  onSaveImmediate,
}) => {
  if (!editor && mode === 'rich') return null;

  const toggleHeading = (level: 1 | 2 | 3) => {
    editor?.chain().focus().toggleHeading({ level }).run();
  };

  const toggleBold = () => {
    editor?.chain().focus().toggleBold().run();
  };

  const toggleItalic = () => {
    editor?.chain().focus().toggleItalic().run();
  };

  const toggleUnderline = () => {
    editor?.chain().focus().toggleUnderline().run();
  };

  const toggleStrike = () => {
    editor?.chain().focus().toggleStrike().run();
  };

  const toggleBulletList = () => {
    editor?.chain().focus().toggleBulletList().run();
  };

  const toggleOrderedList = () => {
    editor?.chain().focus().toggleOrderedList().run();
  };

  const toggleTaskList = () => {
    editor?.chain().focus().toggleTaskList().run();
  };

  const toggleBlockquote = () => {
    editor?.chain().focus().toggleBlockquote().run();
  };

  const toggleCodeBlock = () => {
    editor?.chain().focus().toggleCodeBlock().run();
  };

  return (
    <div
      className="editor-toolbar"
      style={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '4px',
        padding: '6px 12px',
        background: 'var(--bg-secondary, #252526)',
        borderBottom: '1px solid var(--border-color, #333)',
        fontSize: '12px',
      }}
    >
      <div style={{ display: 'flex', gap: '3px', alignItems: 'center' }}>
        <button
          type="button"
          className={`toolbar-btn ${editor?.isActive('heading', { level: 1 }) ? 'active' : ''}`}
          onClick={() => toggleHeading(1)}
          disabled={mode !== 'rich'}
          title="Heading 1"
          style={btnStyle(editor?.isActive('heading', { level: 1 }))}
        >
          H1
        </button>
        <button
          type="button"
          className={`toolbar-btn ${editor?.isActive('heading', { level: 2 }) ? 'active' : ''}`}
          onClick={() => toggleHeading(2)}
          disabled={mode !== 'rich'}
          title="Heading 2"
          style={btnStyle(editor?.isActive('heading', { level: 2 }))}
        >
          H2
        </button>
        <button
          type="button"
          className={`toolbar-btn ${editor?.isActive('heading', { level: 3 }) ? 'active' : ''}`}
          onClick={() => toggleHeading(3)}
          disabled={mode !== 'rich'}
          title="Heading 3"
          style={btnStyle(editor?.isActive('heading', { level: 3 }))}
        >
          H3
        </button>
      </div>

      <div style={separatorStyle} />

      <div style={{ display: 'flex', gap: '3px', alignItems: 'center' }}>
        <button
          type="button"
          className={`toolbar-btn ${editor?.isActive('bold') ? 'active' : ''}`}
          onClick={toggleBold}
          disabled={mode !== 'rich'}
          title="Bold (Ctrl+B)"
          style={{ ...btnStyle(editor?.isActive('bold')), fontWeight: 'bold' }}
        >
          B
        </button>
        <button
          type="button"
          className={`toolbar-btn ${editor?.isActive('italic') ? 'active' : ''}`}
          onClick={toggleItalic}
          disabled={mode !== 'rich'}
          title="Italic (Ctrl+I)"
          style={{ ...btnStyle(editor?.isActive('italic')), fontStyle: 'italic' }}
        >
          I
        </button>
        <button
          type="button"
          className={`toolbar-btn ${editor?.isActive('underline') ? 'active' : ''}`}
          onClick={toggleUnderline}
          disabled={mode !== 'rich'}
          title="Underline (Ctrl+U)"
          style={{ ...btnStyle(editor?.isActive('underline')), textDecoration: 'underline' }}
        >
          U
        </button>
        <button
          type="button"
          className={`toolbar-btn ${editor?.isActive('strike') ? 'active' : ''}`}
          onClick={toggleStrike}
          disabled={mode !== 'rich'}
          title="Strikethrough"
          style={{ ...btnStyle(editor?.isActive('strike')), textDecoration: 'line-through' }}
        >
          S
        </button>
      </div>

      <div style={separatorStyle} />

      <div style={{ display: 'flex', gap: '3px', alignItems: 'center' }}>
        <button
          type="button"
          className={`toolbar-btn ${editor?.isActive('bulletList') ? 'active' : ''}`}
          onClick={toggleBulletList}
          disabled={mode !== 'rich'}
          title="Bullet List"
          style={btnStyle(editor?.isActive('bulletList'))}
        >
          • List
        </button>
        <button
          type="button"
          className={`toolbar-btn ${editor?.isActive('orderedList') ? 'active' : ''}`}
          onClick={toggleOrderedList}
          disabled={mode !== 'rich'}
          title="Numbered List"
          style={btnStyle(editor?.isActive('orderedList'))}
        >
          1. List
        </button>
        <button
          type="button"
          className={`toolbar-btn ${editor?.isActive('taskList') ? 'active' : ''}`}
          onClick={toggleTaskList}
          disabled={mode !== 'rich'}
          title="Task List / Checkbox"
          style={btnStyle(editor?.isActive('taskList'))}
        >
          ☑ Todo
        </button>
      </div>

      <div style={separatorStyle} />

      <div style={{ display: 'flex', gap: '3px', alignItems: 'center' }}>
        <button
          type="button"
          className={`toolbar-btn ${editor?.isActive('blockquote') ? 'active' : ''}`}
          onClick={toggleBlockquote}
          disabled={mode !== 'rich'}
          title="Blockquote"
          style={btnStyle(editor?.isActive('blockquote'))}
        >
          &gt; Quote
        </button>
        <button
          type="button"
          className={`toolbar-btn ${editor?.isActive('codeBlock') ? 'active' : ''}`}
          onClick={toggleCodeBlock}
          disabled={mode !== 'rich'}
          title="Code Block"
          style={btnStyle(editor?.isActive('codeBlock'))}
        >
          &lt;/&gt; Code
        </button>
      </div>

      <div style={{ flex: 1 }} />

      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
        <button
          type="button"
          onClick={onToggleMode}
          title={mode === 'rich' ? 'Switch to Raw Markdown' : 'Switch to Rich Text'}
          style={{
            padding: '3px 10px',
            fontSize: '11px',
            borderRadius: '4px',
            background: mode === 'markdown' ? 'var(--accent-color, #007acc)' : 'transparent',
            color: mode === 'markdown' ? '#fff' : 'inherit',
            border: '1px solid var(--border-color, #444)',
            cursor: 'pointer',
          }}
        >
          {mode === 'rich' ? '⌨️ Markdown (Raw)' : '📝 Rich Text'}
        </button>
      </div>
    </div>
  );
};

const separatorStyle: React.CSSProperties = {
  width: '1px',
  height: '18px',
  background: 'var(--border-color, #444)',
  margin: '0 4px',
};

const btnStyle = (active?: boolean): React.CSSProperties => ({
  padding: '4px 8px',
  minWidth: '28px',
  fontSize: '12px',
  borderRadius: '3px',
  border: '1px solid transparent',
  background: active ? 'var(--accent-color, #007acc)' : 'transparent',
  color: active ? '#ffffff' : 'inherit',
  cursor: 'pointer',
  transition: 'background 0.15s, color 0.15s',
});

export default Toolbar;
