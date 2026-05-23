'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import type { ModelOption } from '@platform/shared';
import type { CatalogModel } from './ModelSettingsClient';
import styles from './modelSettings.module.css';

interface Props {
  value: string;
  onChange: (id: string) => void;
  placeholder: string;
  catalog: CatalogModel[];
  popular: ModelOption[];
  ariaLabel: string;
}

interface MenuPosition {
  top: number;
  left: number;
  width: number;
}

function formatContext(len: number | null | undefined): string | null {
  if (!len || len <= 0) return null;
  if (len >= 1_000_000) return `${(len / 1_000_000).toFixed(1).replace(/\.0$/, '')}M ctx`;
  if (len >= 1000) return `${Math.round(len / 1000)}K ctx`;
  return `${len} ctx`;
}

export function ModelCombobox({
  value,
  onChange,
  placeholder,
  catalog,
  popular,
  ariaLabel,
}: Props) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<MenuPosition | null>(null);
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeItemRef = useRef<HTMLLIElement>(null);

  const catalogById = useMemo(() => new Map(catalog.map((m) => [m.id, m])), [catalog]);

  const currentModel = value ? catalogById.get(value) ?? null : null;
  const triggerLabel = value
    ? currentModel?.name ?? value
    : placeholder;

  // Build the candidate list: popular first (deduped against the catalog),
  // then the rest of the catalog alphabetically.
  const orderedAll = useMemo(() => {
    const popularIds = new Set(popular.map((p) => p.id));
    const popularModels: CatalogModel[] = popular.map((p) => {
      const fromCatalog = catalogById.get(p.id);
      return (
        fromCatalog ?? {
          id: p.id,
          name: p.label,
          contextLength: null,
        }
      );
    });
    const rest = catalog
      .filter((m) => !popularIds.has(m.id))
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));
    return { popular: popularModels, rest };
  }, [catalog, catalogById, popular]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return orderedAll;
    const match = (m: CatalogModel) =>
      m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q);
    return {
      popular: orderedAll.popular.filter(match),
      rest: orderedAll.rest.filter(match),
    };
  }, [orderedAll, query]);

  const flatList = useMemo(
    () => [...filtered.popular, ...filtered.rest],
    [filtered],
  );

  function openMenu() {
    const rect = triggerRef.current!.getBoundingClientRect();
    const menuHeight = 360;
    const margin = 8;
    const spaceBelow = window.innerHeight - rect.bottom;
    const top =
      spaceBelow >= menuHeight + margin
        ? rect.bottom + 4
        : Math.max(margin, rect.top - menuHeight - 4);
    setPosition({ top, left: rect.left, width: rect.width });
    setOpen(true);
    setQuery('');
    setActiveIdx(0);
  }

  function closeMenu() {
    setOpen(false);
    setPosition(null);
  }

  function handleTrigger(e: React.MouseEvent) {
    e.stopPropagation();
    if (open) closeMenu();
    else openMenu();
  }

  function selectId(id: string) {
    onChange(id);
    closeMenu();
    triggerRef.current?.focus();
  }

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) {
        closeMenu();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeMenu();
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

  // Keep the active item scrolled into view as the user arrows through.
  useEffect(() => {
    if (!open) return;
    activeItemRef.current?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx, open]);

  // Clamp active index when the filtered list shrinks.
  useEffect(() => {
    if (activeIdx >= flatList.length) setActiveIdx(Math.max(0, flatList.length - 1));
  }, [flatList.length, activeIdx]);

  function handleInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(flatList.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const m = flatList[activeIdx];
      if (m) selectId(m.id);
    }
  }

  const popularCount = filtered.popular.length;
  const showCurrentNotInCatalog = value && !currentModel;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={styles.comboboxTrigger}
        onClick={handleTrigger}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={value ? styles.comboboxValue : styles.comboboxPlaceholder}>
          {triggerLabel}
        </span>
        <ChevronDown size={16} strokeWidth={1.5} className={styles.comboboxChevron} />
      </button>
      {open && position && (
        <div
          ref={menuRef}
          className={styles.comboboxMenu}
          style={{ top: position.top, left: position.left, width: position.width }}
          role="dialog"
        >
          <div className={styles.comboboxSearch}>
            <Search size={14} strokeWidth={1.5} className={styles.comboboxSearchIcon} />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActiveIdx(0);
              }}
              onKeyDown={handleInputKeyDown}
              placeholder="Search models…"
              className={styles.comboboxSearchInput}
              spellCheck={false}
              autoComplete="off"
            />
          </div>
          <ul className={styles.comboboxList} role="listbox">
            {showCurrentNotInCatalog && (
              <>
                <li className={styles.comboboxGroupLabel}>Currently set</li>
                <li
                  className={`${styles.comboboxOption} ${styles.comboboxOptionMuted}`}
                  role="option"
                  aria-selected="true"
                >
                  <div className={styles.comboboxOptionMain}>
                    <span className={styles.comboboxOptionName}>{value}</span>
                    <span className={styles.comboboxOptionMeta}>Not in OpenRouter catalog</span>
                  </div>
                </li>
              </>
            )}
            {filtered.popular.length > 0 && (
              <li className={styles.comboboxGroupLabel}>Popular</li>
            )}
            {filtered.popular.map((m, idx) => {
              const flatIdx = idx;
              const isActive = flatIdx === activeIdx;
              const isSelected = m.id === value;
              return (
                <li
                  key={`pop-${m.id}`}
                  ref={isActive ? activeItemRef : undefined}
                  className={`${styles.comboboxOption} ${isActive ? styles.comboboxOptionActive : ''}`}
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setActiveIdx(flatIdx)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => selectId(m.id)}
                >
                  <div className={styles.comboboxOptionMain}>
                    <span className={styles.comboboxOptionName}>{m.name}</span>
                    <span className={styles.comboboxOptionId}>{m.id}</span>
                  </div>
                  <div className={styles.comboboxOptionRight}>
                    {formatContext(m.contextLength) && (
                      <span className={styles.comboboxOptionMeta}>
                        {formatContext(m.contextLength)}
                      </span>
                    )}
                    {isSelected && <Check size={14} strokeWidth={1.5} />}
                  </div>
                </li>
              );
            })}
            {filtered.rest.length > 0 && (
              <li className={styles.comboboxGroupLabel}>All models</li>
            )}
            {filtered.rest.map((m, idx) => {
              const flatIdx = popularCount + idx;
              const isActive = flatIdx === activeIdx;
              const isSelected = m.id === value;
              return (
                <li
                  key={m.id}
                  ref={isActive ? activeItemRef : undefined}
                  className={`${styles.comboboxOption} ${isActive ? styles.comboboxOptionActive : ''}`}
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setActiveIdx(flatIdx)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => selectId(m.id)}
                >
                  <div className={styles.comboboxOptionMain}>
                    <span className={styles.comboboxOptionName}>{m.name}</span>
                    <span className={styles.comboboxOptionId}>{m.id}</span>
                  </div>
                  <div className={styles.comboboxOptionRight}>
                    {formatContext(m.contextLength) && (
                      <span className={styles.comboboxOptionMeta}>
                        {formatContext(m.contextLength)}
                      </span>
                    )}
                    {isSelected && <Check size={14} strokeWidth={1.5} />}
                  </div>
                </li>
              );
            })}
            {flatList.length === 0 && (
              <li className={styles.comboboxEmpty}>No models match "{query}"</li>
            )}
          </ul>
        </div>
      )}
    </>
  );
}
