'use client';

/* eslint-disable @next/next/no-img-element */
import { Minus, Plus, ShoppingBag, X } from 'lucide-react';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { formatPrice, orderMessage } from './format';

/*
 * The cart: kept in the visitor's browser (one per site), opened from a
 * floating button, and sent as a pre-filled WhatsApp order. Card checkout
 * joins it in a later step.
 */

export interface CartLine {
  /** Product id plus chosen options, so "Tee, size M" and "Tee, size L" are separate lines. */
  key: string;
  productId: string;
  name: string;
  price: number;
  image: string;
  options: Record<string, string>;
  qty: number;
}

const listeners = new Set<() => void>();
const memory = new Map<string, CartLine[]>();
const EMPTY: CartLine[] = [];

function storageKey(site: string) {
  return `sono-cart:${site}`;
}

function read(site: string): CartLine[] {
  if (memory.has(site)) return memory.get(site)!;
  let lines: CartLine[] = EMPTY;
  try {
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem(storageKey(site)) : null;
    if (raw) lines = JSON.parse(raw) as CartLine[];
  } catch {}
  memory.set(site, lines);
  return lines;
}

function write(site: string, lines: CartLine[]) {
  memory.set(site, lines);
  try {
    window.localStorage.setItem(storageKey(site), JSON.stringify(lines));
  } catch {}
  listeners.forEach((l) => l());
}

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

export function useCart(site: string): CartLine[] {
  return useSyncExternalStore(
    subscribe,
    () => read(site),
    () => EMPTY,
  );
}

export function addToCart(site: string, line: Omit<CartLine, 'key' | 'qty'>, qty = 1) {
  const key = `${line.productId}|${Object.entries(line.options)
    .map(([k, v]) => `${k}=${v}`)
    .join('&')}`;
  const lines = read(site);
  const existing = lines.find((l) => l.key === key);
  write(site, existing ? lines.map((l) => (l.key === key ? { ...l, qty: Math.min(99, l.qty + qty) } : l)) : [...lines, { ...line, key, qty }]);
  window.dispatchEvent(new CustomEvent('sono-cart-open'));
}

export function setQty(site: string, key: string, qty: number) {
  const lines = read(site);
  write(site, qty <= 0 ? lines.filter((l) => l.key !== key) : lines.map((l) => (l.key === key ? { ...l, qty: Math.min(99, qty) } : l)));
}

export function clearCart(site: string) {
  write(site, []);
}

/* ---------- Add to cart ---------- */

export function AddToCart({
  site,
  product,
  options = [],
  soldOut = false,
  className = '',
  compact = false,
}: {
  site: string;
  product: { id: string; name: string; price: number; image: string };
  options?: { name: string; values: string[] }[];
  soldOut?: boolean;
  className?: string;
  compact?: boolean;
}) {
  const [chosen, setChosen] = useState<Record<string, string>>(() => Object.fromEntries(options.map((o) => [o.name, o.values[0]])));
  if (soldOut) {
    return (
      <span className={`inline-flex min-h-11 items-center justify-center rounded-site-button border border-current/25 px-5 text-[0.9em] font-semibold opacity-60 ${className}`}>
        Sold out
      </span>
    );
  }
  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      {!compact &&
        options.map((o) => (
          <fieldset key={o.name} className="m-0 flex flex-col gap-1.5 border-0 p-0">
            <legend className="mb-1.5 p-0 text-[0.85em] font-semibold">{o.name}</legend>
            <span className="flex flex-wrap gap-2">
              {o.values.map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={chosen[o.name] === v}
                  onClick={() => setChosen({ ...chosen, [o.name]: v })}
                  className={`min-h-10 min-w-10 cursor-pointer rounded-site-input border px-3 text-[0.95em] font-medium ${
                    chosen[o.name] === v ? 'border-site-primary bg-site-primary text-site-on-primary' : 'border-current/25 hover:border-current/60'
                  }`}
                >
                  {v}
                </button>
              ))}
            </span>
          </fieldset>
        ))}
      <button
        type="button"
        onClick={() => addToCart(site, { productId: product.id, name: product.name, price: product.price, image: product.image, options: compact ? Object.fromEntries(options.map((o) => [o.name, o.values[0]])) : chosen })}
        className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-site-button bg-site-primary px-5 text-[0.95em] font-semibold text-site-on-primary transition-[filter] hover:brightness-110"
      >
        <ShoppingBag size={17} aria-hidden />
        Add to cart
      </button>
    </div>
  );
}

/* ---------- Cart button and drawer ---------- */

export function CartDrawer({ site, business, currency, whatsapp }: { site: string; business: string; currency: string; whatsapp: string }) {
  const lines = useCart(site);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const count = lines.reduce((s, l) => s + l.qty, 0);
  const total = lines.reduce((s, l) => s + l.qty * l.price, 0);

  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener('sono-cart-open', show);
    return () => window.removeEventListener('sono-cart-open', show);
  }, []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const digits = whatsapp.replace(/[^0-9]/g, '');
  const order = () => {
    const text = orderMessage({ business, lines, currency, customer: name, note });
    window.open(`https://wa.me/${digits}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  };

  return (
    <>
      {count > 0 && (
        // A zero-height sticky strip, like the WhatsApp button, so it floats without taking space.
        <div className="pointer-events-none sticky bottom-[var(--s-float-offset,0px)] z-20 h-0">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label={`Cart, ${count} item${count === 1 ? '' : 's'}`}
            className="pointer-events-auto absolute bottom-4 left-4 flex h-12 cursor-pointer items-center gap-2 rounded-full bg-site-text px-5 font-semibold text-site-bg shadow-[0_8px_24px_rgba(0,0,0,.2)] @3xl:bottom-6 @3xl:left-6"
          >
            <ShoppingBag size={18} aria-hidden />
            Cart · {count}
          </button>
        </div>
      )}
      {open && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={() => setOpen(false)}>
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Your cart"
            onClick={(e) => e.stopPropagation()}
            className="flex h-full w-full max-w-[420px] flex-col bg-site-bg text-site-text shadow-[-12px_0_40px_rgba(0,0,0,.2)]"
            style={{ fontFamily: 'var(--s-font-body)' }}
          >
            <div className="flex items-center justify-between border-b border-current/10 px-5 py-4">
              <span className="s-heading text-[1.4em]">Your cart</span>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="flex size-10 cursor-pointer items-center justify-center rounded-full hover:bg-current/10">
                <X size={20} />
              </button>
            </div>
            {lines.length === 0 ? (
              <p className="m-0 p-5 text-site-muted">Your cart is empty.</p>
            ) : (
              <>
                <ul className="m-0 flex flex-1 list-none flex-col gap-4 overflow-auto p-5">
                  {lines.map((l) => (
                    <li key={l.key} className="flex gap-3">
                      <div className="s-placeholder size-16 flex-none overflow-hidden rounded-site-card">{l.image && <img src={l.image} alt="" className="size-full object-cover" />}</div>
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="font-semibold">{l.name}</span>
                        {Object.keys(l.options).length > 0 && (
                          <span className="text-[0.85em] text-site-muted">
                            {Object.entries(l.options)
                              .map(([k, v]) => `${k}: ${v}`)
                              .join(' · ')}
                          </span>
                        )}
                        <span className="flex items-center gap-2">
                          <button type="button" aria-label={`One fewer ${l.name}`} onClick={() => setQty(site, l.key, l.qty - 1)} className="flex size-8 cursor-pointer items-center justify-center rounded-full border border-current/20">
                            <Minus size={14} />
                          </button>
                          <span className="w-6 text-center">{l.qty}</span>
                          <button type="button" aria-label={`One more ${l.name}`} onClick={() => setQty(site, l.key, l.qty + 1)} className="flex size-8 cursor-pointer items-center justify-center rounded-full border border-current/20">
                            <Plus size={14} />
                          </button>
                          <span className="ml-auto font-semibold">{formatPrice(l.price * l.qty, currency)}</span>
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="flex flex-col gap-3 border-t border-current/10 p-5">
                  <div className="flex items-baseline justify-between text-[1.1em] font-semibold">
                    <span>Total</span>
                    <span>{formatPrice(total, currency)}</span>
                  </div>
                  <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" aria-label="Your name" className="min-h-11 rounded-site-input border border-current/20 bg-transparent px-3" />
                  <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Delivery address or note" aria-label="Delivery address or note" className="rounded-site-input border border-current/20 bg-transparent px-3 py-2" />
                  {digits ? (
                    <button type="button" onClick={order} className="inline-flex min-h-12 cursor-pointer items-center justify-center rounded-site-button bg-[#25D366] px-5 font-semibold text-[#0B3B1F] hover:brightness-105">
                      Order on WhatsApp
                    </button>
                  ) : (
                    <p className="m-0 text-[0.9em] text-site-muted">Ordering opens soon.</p>
                  )}
                  <button type="button" onClick={() => clearCart(site)} className="cursor-pointer self-center text-[0.85em] text-site-muted underline-offset-4 hover:underline">
                    Empty the cart
                  </button>
                </div>
              </>
            )}
          </aside>
        </div>
      )}
    </>
  );
}
