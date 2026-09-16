import React, { useEffect, useState } from 'react';
import { useNoteContext } from '../context/NoteContext';

// Simple utility to extract tags from front‑matter. Assumes front‑matter format:
// ---\n...\n tags: [tag1, tag2] \n...\n---
function extractTags(markdown: string): string[] {
  const match = markdown.match(/tags:\s*\[(.*?)\]/i);
  if (!match) return [];
  return match[1]
    .split(',')
    .map(t => t.trim().replace(/^['\"]|['\"]$/g, ''))
    .filter(Boolean);
}

const TagBrowser: React.FC = () => {
  const { markdownContent } = useNoteContext();
  const [tags, setTags] = useState<string[]>([]);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    const t = extractTags(markdownContent);
    setTags(t);
  }, [markdownContent]);

  const filtered = tags.filter(t => t.includes(filter));

  return (
    <div className="tag-browser" style={{ marginTop: '1rem', padding: '0.5rem', border: '1px solid var(--border)' }}>
      <h4>Tags</h4>
      <input
        placeholder="Filter tags"
        value={filter}
        onChange={e => setFilter(e.target.value)}
        style={{ width: '100%', marginBottom: '0.5rem' }}
      />
      <ul style={{ listStyle: 'none', paddingLeft: 0 }}>
        {filtered.map((t, i) => (
          <li key={i} style={{ padding: '2px 0' }}>{t}</li>
        ))}
      </ul>
    </div>
  );
};

export default TagBrowser;
