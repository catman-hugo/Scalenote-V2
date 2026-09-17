/**
 * SlashMenuDropdown.tsx
 *
 * The floating dropdown rendered by the slash command suggestion.
 * Renders as a small list of matching commands positioned below the cursor.
 * Supports keyboard navigation (↑ ↓ Enter) via the forwardRef/onKeyDown pattern.
 */

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from 'react';
import styles from './SlashMenuDropdown.module.css';

interface SlashCommand {
  id: string;
  label: string;
  description: string;
  icon: string;
}

interface SlashMenuDropdownProps {
  items: SlashCommand[];
  command: (item: SlashCommand) => void;
}

interface SlashMenuDropdownHandle {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

export const SlashMenuDropdown = forwardRef<
  SlashMenuDropdownHandle,
  SlashMenuDropdownProps
>((props, ref) => {
  const { items, command } = props;
  const [selectedIndex, setSelectedIndex] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Reset selection when items list changes
  useEffect(() => setSelectedIndex(0), [items]);

  // Scroll selected item into view on keyboard navigation
  useEffect(() => {
    const dropdown = dropdownRef.current;
    if (!dropdown) return;
    const selected = dropdown.querySelector(`.${styles.selected}`) as HTMLElement | null;
    selected?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const selectItem = useCallback(
    (index: number) => {
      const item = items[index];
      if (!item) return;
      command(item);
    },
    [items, command]
  );

  // Expose keyboard handler to the suggestion plugin
  useImperativeHandle(
    ref,
    () => ({
      onKeyDown: ({ event }: { event: KeyboardEvent }) => {
        if (event.key === 'ArrowUp') {
          setSelectedIndex((i) => (i - 1 + items.length) % items.length);
          return true;
        }
        if (event.key === 'ArrowDown') {
          setSelectedIndex((i) => (i + 1) % items.length);
          return true;
        }
        if (event.key === 'Enter') {
          selectItem(selectedIndex);
          return true;
        }
        return false;
      },
    }),
    [items, selectedIndex, selectItem]
  );

  if (!items.length) return null;

  return (
    <div ref={dropdownRef} className={styles.dropdown}>
      {items.map((item, index) => (
        <button
          key={item.id}
          type="button"
          className={`${styles.item} ${index === selectedIndex ? styles.selected : ''}`}
          onClick={() => selectItem(index)}
          onMouseEnter={() => setSelectedIndex(index)}
        >
          <span className={styles.icon}>{item.icon}</span>
          <span className={styles.text}>
            <span className={styles.label}>{item.label}</span>
            <span className={styles.desc}>{item.description}</span>
          </span>
        </button>
      ))}
    </div>
  );
});

SlashMenuDropdown.displayName = 'SlashMenuDropdown';
