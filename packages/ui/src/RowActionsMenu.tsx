'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal } from 'lucide-react';
import styles from './RowActionsMenu.module.css';

export interface RowAction {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  destructive?: boolean;
}

interface RowActionsMenuProps {
  actions: RowAction[];
}

interface MenuPosition {
  top: number;
  right: number;
}

export function RowActionsMenu({ actions }: RowActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<MenuPosition | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleTrigger = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (open) {
      setOpen(false);
      return;
    }
    const rect = triggerRef.current!.getBoundingClientRect();
    const menuHeight = actions.length * 36 + 8;
    const spaceBelow = window.innerHeight - rect.bottom;
    const top = spaceBelow >= menuHeight
      ? rect.bottom + 4
      : rect.top - menuHeight - 4;
    setPosition({ top, right: window.innerWidth - rect.right });
    setOpen(true);
  };

  // Focus the first item when the menu opens (keyboard users land inside it).
  useEffect(() => {
    if (!open) return;
    const firstItem = menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]');
    firstItem?.focus();
  }, [open, position]);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  // Arrow-key navigation between menu items.
  const handleMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [],
    );
    if (items.length === 0) return;
    const currentIndex = items.findIndex((el) => el === document.activeElement);
    const nextIndex =
      e.key === 'ArrowDown'
        ? (currentIndex + 1) % items.length
        : (currentIndex - 1 + items.length) % items.length;
    items[nextIndex].focus();
  };

  return (
    <>
      <button
        ref={triggerRef}
        className={styles.trigger}
        onClick={handleTrigger}
        aria-label="Row actions"
        aria-haspopup="menu"
        aria-expanded={open}
        type="button"
      >
        <MoreHorizontal size={16} strokeWidth={1.5} />
      </button>
      {open && position && createPortal(
        <div
          ref={menuRef}
          className={styles.menu}
          style={{ top: position.top, right: position.right }}
          role="menu"
          tabIndex={-1}
          onKeyDown={handleMenuKeyDown}
        >
          {actions.map((action) => (
            <button
              key={action.label}
              role="menuitem"
              className={`${styles.item} ${action.destructive ? styles.destructive : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
                action.onClick();
              }}
              type="button"
            >
              {action.icon && <span className={styles.icon}>{action.icon}</span>}
              {action.label}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}
