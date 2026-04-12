'use client';

import { useEffect, useRef, useState } from 'react';
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
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        className={styles.trigger}
        onClick={handleTrigger}
        aria-label="Row actions"
        type="button"
      >
        <MoreHorizontal size={16} strokeWidth={1.5} />
      </button>
      {open && position && (
        <div
          ref={menuRef}
          className={styles.menu}
          style={{ top: position.top, right: position.right }}
        >
          {actions.map((action) => (
            <button
              key={action.label}
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
        </div>
      )}
    </>
  );
}
