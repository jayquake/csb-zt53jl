/*
 * The bag.
 *
 * Held in React state, mirrored into localStorage so a refresh (or a phone
 * putting the tab to sleep mid-scroll) doesn't lose a design someone spent
 * five minutes pulling into shape.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { cloneDesign, pricedFrom, sanitiseDesign, type Design } from './design';
import { extrasFor, totals as computeTotals, type Totals } from './catalog';

const STORAGE_KEY = 'smiley-socks.bag.v1';

export interface CartItem {
  id: string;
  design: Design;
  quantity: number;
}

interface CartValue {
  items: CartItem[];
  totals: Totals;
  count: number;
  /** True when the bag could not be written to storage — the UI says so. */
  storageBlocked: boolean;
  add(design: Design): void;
  setQuantity(id: string, quantity: number): void;
  remove(id: string): void;
  clear(): void;
}

const CartContext = createContext<CartValue | null>(null);

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function load(): CartItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Everything from storage goes through sanitiseDesign — an old release, a
    // hand-edited value or a truncated write must not be able to break a load.
    return parsed.slice(0, 40).map((item: Partial<CartItem>) => ({
      id: typeof item?.id === 'string' ? item.id : newId(),
      design: sanitiseDesign(item?.design),
      quantity: Math.min(20, Math.max(1, Math.round(Number(item?.quantity) || 1))),
    }));
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(() => (typeof window === 'undefined' ? [] : load()));
  const [storageBlocked, setStorageBlocked] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
      setStorageBlocked(false);
    } catch {
      // Private-mode Safari and a full quota both land here. Photos are
      // already downscaled before they ever reach a design, so this is rare —
      // but the bag still works for the session, and the UI admits it won't
      // survive a refresh rather than pretending everything is saved.
      setStorageBlocked(true);
    }
  }, [items]);

  const add = useCallback((design: Design) => {
    setItems((prev) => [...prev, { id: newId(), design: cloneDesign(design), quantity: 1 }]);
  }, []);

  const setQuantity = useCallback((id: string, quantity: number) => {
    setItems((prev) =>
      quantity <= 0
        ? prev.filter((i) => i.id !== id)
        : prev.map((i) => (i.id === id ? { ...i, quantity: Math.min(20, quantity) } : i)),
    );
  }, []);

  const remove = useCallback((id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const value = useMemo<CartValue>(() => {
    const totals = computeTotals(items.map((i) => ({ design: pricedFrom(i.design), quantity: i.quantity })));
    return {
      items,
      totals,
      count: totals.pairs,
      storageBlocked,
      add,
      setQuantity,
      remove,
      clear,
    };
  }, [items, storageBlocked, add, setQuantity, remove, clear]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside <CartProvider>');
  return ctx;
}

/**
 * Per-line price. `unit` is the pack rate the whole bag qualifies for, so
 * adding a third pair genuinely reprices the first two.
 */
export function linePrice(item: CartItem, unit: number): number {
  return (unit + extrasFor(pricedFrom(item.design))) * item.quantity;
}
