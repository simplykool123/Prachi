import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { Product } from '../../types';

interface ProductComboboxProps {
  products: Product[];
  value: string;
  onSelect: (product: Product) => void;
  onEnterOnQty?: () => void;
  inputRef?: React.RefObject<HTMLInputElement>;
  godownStockMap?: Record<string, number>;
  className?: string;
}

export default function ProductCombobox({
  products,
  value,
  onSelect,
  inputRef: externalRef,
  godownStockMap = {},
  className = '',
}: ProductComboboxProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const internalRef = useRef<HTMLInputElement>(null);
  const inputRef = externalRef ?? internalRef;
  const listRef = useRef<HTMLUListElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = products.find(p => p.id === value);

  useEffect(() => {
    if (!open) setQuery(selected?.name ?? '');
  }, [value, open, selected]);

  const filtered = query.trim()
    ? products.filter(p => p.name.toLowerCase().includes(query.toLowerCase()))
    : products;

  const confirmSelection = useCallback((product: Product) => {
    onSelect(product);
    setQuery(product.name);
    setOpen(false);
    setHighlighted(0);
  }, [onSelect]);

  useEffect(() => {
    setHighlighted(0);
  }, [query]);

  useEffect(() => {
    if (open && listRef.current) {
      const el = listRef.current.children[highlighted] as HTMLElement | undefined;
      el?.scrollIntoView({ block: 'nearest' });
    }
  }, [highlighted, open]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        if (selected) setQuery(selected.name);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [selected]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setHighlighted(h => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted(h => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (open && filtered[highlighted]) {
        confirmSelection(filtered[highlighted]);
      } else if (!open && filtered.length > 0) {
        confirmSelection(filtered[0]);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
      if (selected) setQuery(selected.name);
    } else if (e.key === 'Tab') {
      if (open && filtered[highlighted]) {
        confirmSelection(filtered[highlighted]);
      }
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => { setOpen(true); setQuery(''); }}
        onKeyDown={handleKeyDown}
        placeholder="Search product..."
        className={`input text-xs w-full ${className}`}
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <ul
          ref={listRef}
          className="absolute z-[9999] left-0 right-0 top-full max-h-44 overflow-y-auto bg-white border border-neutral-200 rounded shadow-md py-0.5"
        >
          {filtered.map((p, idx) => {
            const stock = godownStockMap[p.id] !== undefined ? godownStockMap[p.id] : 0;
            return (
              <li
                key={p.id}
                onMouseDown={e => { e.preventDefault(); confirmSelection(p); }}
                onMouseEnter={() => setHighlighted(idx)}
                className={`px-2.5 py-1 cursor-pointer flex items-center justify-between text-xs ${idx === highlighted ? 'bg-primary-50 text-primary-700' : 'text-neutral-700 hover:bg-neutral-50'}`}
              >
                <span className="truncate">{p.name}</span>
                <span className={`ml-2 shrink-0 text-[10px] font-semibold ${stock === 0 ? 'text-error-500' : stock <= (p.low_stock_alert ?? 5) ? 'text-warning-500' : 'text-success-600'}`}>
                  {stock}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
