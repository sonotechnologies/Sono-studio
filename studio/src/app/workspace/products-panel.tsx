'use client';

/* eslint-disable @next/next/no-img-element */
import { AlertTriangle, ArrowDown, ArrowUp, ChevronLeft, Copy, ExternalLink, ImagePlus, Plus, ShoppingBag, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { inputClass, Switch } from '@/components/ui';
import type { Product, SiteConfig } from '@/site/schema';
import { formatPrice } from '@/site/store/format';
import { PAYSTACK_CURRENCIES } from '@/site/store/payments-info';
import { CURRENCIES, moveProduct, newProduct, productId, removeProduct, saveProduct } from '@/workspace/store';

/*
 * The Products tab: the shop's currency and WhatsApp number, and its
 * products, each edited in place. Product pages are built from this list, so
 * there's nothing to lay out per product.
 */

const field = `${inputClass} rounded-[10px] bg-bg px-[11px] text-[14px]`;
const pill = 'flex h-[34px] cursor-pointer items-center gap-1.5 rounded-full border border-border px-3 text-[13px] font-medium hover:bg-hover disabled:cursor-default disabled:opacity-40';
const link = 'cursor-pointer text-[13px] font-medium text-accent-text hover:underline';

export function ProductsPanel({
  config,
  openId,
  onOpen,
  onChange,
  onPickImage,
  onAddShop,
  onPreview,
  testKeys,
}: {
  config: SiteConfig;
  /** The product being edited, or null for the list. */
  openId: string | null;
  onOpen: (id: string | null) => void;
  /** Throws nothing: the workspace reports a change it can't make. */
  onChange: (next: SiteConfig, summary: string, coalesce?: string) => void;
  /** Opens the media library for a product's photo ("image" or "images.N"). */
  onPickImage: (productId: string, path: string) => void;
  onAddShop: (currency: string) => void;
  onPreview: (productId: string) => void;
  testKeys: { paystack: boolean; stripe: boolean };
}) {
  const store = config.store;
  const [currency, setCurrency] = useState('NGN');

  if (!store) {
    return (
      <div className="flex flex-1 flex-col gap-4 overflow-auto p-5">
        <div className="flex flex-col gap-3 rounded-[14px] border border-border bg-bg p-4">
          <span className="flex size-10 items-center justify-center rounded-full bg-sel">
            <ShoppingBag size={18} />
          </span>
          <div className="text-[16px] font-semibold">Sell from this site</div>
          <p className="m-0 text-[13px] leading-normal text-muted">
            Adds a Shop page with a product grid, a Shop link in the menu and three sample products to replace. Visitors fill a cart and send the order to the business on WhatsApp.
          </p>
          <label className="flex items-center gap-3 text-[13px] font-medium">
            Currency
            <select value={currency} onChange={(e) => setCurrency(e.target.value)} className={`${field} h-9 w-28 cursor-pointer`}>
              {CURRENCIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <button type="button" onClick={() => onAddShop(currency)} className="flex h-10 cursor-pointer items-center justify-center gap-1.5 rounded-full bg-terracotta px-4 text-[14px] font-semibold text-white hover:bg-terracotta-hover">
            <Plus size={16} />
            Add a shop
          </button>
        </div>
      </div>
    );
  }

  const product = openId ? store.products.find((p) => p.id === openId) : undefined;
  if (product) {
    const index = store.products.indexOf(product);
    return (
      <ProductEditor
        key={product.id}
        product={product}
        currency={store.currency}
        categories={[...new Set(store.products.map((p) => p.category).filter(Boolean))]}
        isFirst={index === 0}
        isLast={index === store.products.length - 1}
        onBack={() => onOpen(null)}
        onSave={(next, key) => onChange(saveProduct(config, { ...next, sample: undefined }), product.name || 'Product', `product:${product.id}:${key}`)}
        onPickImage={(path) => onPickImage(product.id, path)}
        onMove={(dir) => onChange(moveProduct(config, product.id, index + dir), 'Product order')}
        onDuplicate={() => {
          const copy = { ...structuredClone(product), id: productId(config, `${product.name} copy`), name: `${product.name} (copy)`.slice(0, 80), sample: undefined };
          onChange(moveProduct(saveProduct(config, copy), copy.id, index + 1), `Duplicated ${product.name}`);
          onOpen(copy.id);
        }}
        onRemove={() => {
          onChange(removeProduct(config, product.id), `Removed ${product.name}`);
          onOpen(null);
        }}
        onPreview={() => onPreview(product.id)}
      />
    );
  }

  const setStore = (patch: Partial<typeof store>, summary: string) => onChange({ ...config, store: { ...store, ...patch } }, summary, `store:${summary}`);
  const samples = store.products.filter((p) => p.sample).length;
  const digits = store.whatsapp.replace(/[^0-9]/g, '');

  return (
    <div className="flex flex-1 flex-col gap-[22px] overflow-auto p-5">
      <div className="flex flex-col gap-3">
        <div className="text-[20px] font-semibold tracking-[-0.01em]">Shop</div>
        <div className="flex gap-3">
          <label className="flex w-28 flex-col gap-1.5 text-[13px] font-medium">
            Currency
            <select value={store.currency} onChange={(e) => setStore({ currency: e.target.value }, 'Currency')} className={`${field} h-[38px] cursor-pointer`}>
              {[...new Set([store.currency, ...CURRENCIES])].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="flex min-w-0 flex-1 flex-col gap-1.5 text-[13px] font-medium">
            Orders to WhatsApp
            <input
              key={store.whatsapp}
              defaultValue={store.whatsapp}
              inputMode="tel"
              placeholder="+234 803 000 0000"
              onBlur={(e) => e.target.value.trim() !== store.whatsapp && setStore({ whatsapp: e.target.value.trim() }, 'WhatsApp number')}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              className={`${field} h-[38px]`}
            />
          </label>
        </div>
        {digits.length < 8 && (
          <Warn>Without a WhatsApp number (with the country code) the cart can’t send orders; visitors see “Ordering opens soon”.</Warn>
        )}
        {samples > 0 && <Warn>{samples === 1 ? 'One product is a sample' : `${samples} products are samples`}. Replace them with the client’s real products, or remove them.</Warn>}
      </div>

      <Payments store={store} testKeys={testKeys} onChange={(payments) => setStore({ payments }, 'Payments')} />

      <div className="flex flex-col gap-2">
        <span className="text-[13px] font-medium">
          Products <span className="font-normal text-muted">· {store.products.length}</span>
        </span>
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {store.products.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => onOpen(p.id)} className="flex w-full cursor-pointer items-center gap-3 rounded-xl border border-border p-1.5 pr-3 text-left hover:bg-hover">
                <span className="relative flex size-11 flex-none items-center justify-center overflow-hidden rounded-[8px] bg-[repeating-linear-gradient(135deg,var(--sel)_0_6px,transparent_6px_12px)] text-muted">
                  {p.image.src ? <img src={p.image.src} alt="" className="absolute inset-0 size-full object-cover" /> : <ImagePlus size={15} />}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-[13px] font-medium">{p.name}</span>
                  <span className="truncate text-[12px] text-muted">
                    {formatPrice(p.price, store.currency)}
                    {p.category ? ` · ${p.category}` : ''}
                  </span>
                </span>
                {p.sample && <Badge>Sample</Badge>}
                {p.soldOut && <Badge>Sold out</Badge>}
              </button>
            </li>
          ))}
        </ul>
        {store.products.length < 300 && (
          <button
            type="button"
            onClick={() => {
              const p = newProduct(config);
              onChange(saveProduct(config, p), 'Added a product');
              onOpen(p.id);
            }}
            className="flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-[10px] border border-dashed border-border text-[13px] font-medium text-muted hover:bg-hover hover:text-text"
          >
            <Plus size={14} />
            Add product
          </button>
        )}
      </div>
      <p className="m-0 text-[12px] leading-normal text-muted">Each product gets its own page at /product/… with its photos, options and an Add to cart button. Click a product in the preview to edit it here.</p>
    </div>
  );
}

type Payments = NonNullable<NonNullable<SiteConfig['store']>['payments']>;

function Payments({ store, testKeys, onChange }: { store: NonNullable<SiteConfig['store']>; testKeys: { paystack: boolean; stripe: boolean }; onChange: (p: Payments) => void }) {
  const p: Payments = store.payments ?? { whatsapp: true, paystack: false, stripe: false };
  const set = (k: keyof Payments, v: boolean) => {
    const next = { ...p, [k]: v };
    // At least one way to order.
    if (!next.whatsapp && !next.paystack && !next.stripe) return;
    onChange(next);
  };
  const paystackCurrency = PAYSTACK_CURRENCIES.includes(store.currency);
  const rows: { k: keyof Payments; name: string; note: string; warn?: string }[] = [
    { k: 'whatsapp', name: 'Order on WhatsApp', note: 'The cart is sent as a pre-filled message; payment is arranged in the chat.' },
    {
      k: 'paystack',
      name: 'Paystack',
      note: 'Card, bank transfer and mobile money. Paid into the business’s own Paystack account.',
      warn: !paystackCurrency ? `Paystack doesn’t charge in ${store.currency}; it’s hidden until the currency is ${PAYSTACK_CURRENCIES.join(', ')}.` : p.paystack && !testKeys.paystack ? 'Add your Paystack test key in Settings → Test payments to try it on the pitch link.' : undefined,
    },
    {
      k: 'stripe',
      name: 'Stripe',
      note: 'International cards, Apple Pay and Google Pay. Paid into the business’s own Stripe account.',
      warn: p.stripe && !testKeys.stripe ? 'Add your Stripe test key in Settings → Test payments to try it on the pitch link.' : undefined,
    },
  ];
  return (
    <div className="flex flex-col gap-3">
      <span className="text-[13px] font-medium">How customers pay</span>
      {rows.map((r) => (
        <div key={r.k} className="flex flex-col gap-1.5">
          <div className="flex items-start gap-3">
            <span className="flex flex-1 flex-col gap-0.5">
              <span className="text-[13px] font-medium">{r.name}</span>
              <span className="text-[12px] leading-snug text-muted">{r.note}</span>
            </span>
            <Switch on={p[r.k]} label={r.name} size="sm" onChange={(v) => set(r.k, v)} />
          </div>
          {r.warn && <span className="text-[12px] leading-snug text-warn">{r.warn}</span>}
        </div>
      ))}
      {(p.paystack || p.stripe) && (
        <p className="m-0 text-[12px] leading-snug text-muted">
          On the pitch link and in the preview, card payments run in test mode with your own test keys. The client’s live keys go in when you deploy: the Deploy dialog asks for them.
        </p>
      )}
    </div>
  );
}

function Warn({ children }: { children: React.ReactNode }) {
  return (
    <div role="status" className="flex gap-2 rounded-[10px] bg-warn-bg p-3 text-[13px] text-warn">
      <AlertTriangle size={15} className="mt-0.5 flex-none" />
      <span>{children}</span>
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="flex-none rounded-full bg-sel px-2 py-0.5 text-[11px] font-medium text-muted">{children}</span>;
}

/* ---------- One product ---------- */

function ProductEditor({
  product: p,
  currency,
  categories,
  isFirst,
  isLast,
  onBack,
  onSave,
  onPickImage,
  onMove,
  onDuplicate,
  onRemove,
  onPreview,
}: {
  product: Product;
  currency: string;
  categories: string[];
  isFirst: boolean;
  isLast: boolean;
  onBack: () => void;
  onSave: (next: Product, key: string) => void;
  onPickImage: (path: string) => void;
  onMove: (dir: -1 | 1) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onPreview: () => void;
}) {
  const set = <K extends keyof Product>(key: K, value: Product[K]) => onSave({ ...p, [key]: value }, key);
  const text = (key: 'name' | 'category' | 'description', label: string, opts: { multiline?: boolean; list?: string; placeholder?: string } = {}) => {
    const props = {
      defaultValue: p[key],
      placeholder: opts.placeholder,
      onBlur: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const v = e.target.value.trim();
        if (v !== p[key] && (v || key !== 'name')) set(key, v);
      },
    };
    return (
      <label className="flex flex-col gap-1.5 text-[13px] font-medium">
        {label}
        {opts.multiline ? (
          <textarea key={p[key]} {...props} rows={Math.min(7, Math.max(3, Math.ceil(p[key].length / 38)))} className={`${field} resize-y py-[9px] leading-[1.45]`} />
        ) : (
          <input key={p[key]} {...props} list={opts.list} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} className={`${field} h-[38px]`} />
        )}
      </label>
    );
  };
  const money = (key: 'price' | 'compareAt', label: string) => (
    <label className="flex min-w-0 flex-1 flex-col gap-1.5 text-[13px] font-medium">
      {label}
      <span className="relative flex">
        <input
          key={String(p[key] ?? '')}
          type="number"
          min={0}
          step="any"
          inputMode="decimal"
          defaultValue={p[key] ?? ''}
          placeholder={key === 'compareAt' ? 'Optional' : '0'}
          onBlur={(e) => {
            const raw = e.target.value.trim();
            const v = raw === '' ? undefined : Math.max(0, Number(raw));
            if (v !== undefined && !Number.isFinite(v)) return;
            if (key === 'price') v !== undefined && v !== p.price && set('price', v);
            else if (v !== p.compareAt) set('compareAt', v || undefined);
          }}
          className={`${field} h-[38px] w-full pr-12`}
        />
        <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[12px] text-muted">{currency}</span>
      </span>
    </label>
  );
  const photos = p.images ?? [];
  const options = p.options ?? [];

  return (
    <div className="flex flex-1 flex-col gap-[22px] overflow-auto p-5">
      <div className="flex flex-col gap-2">
        <button type="button" onClick={onBack} className="flex cursor-pointer items-center gap-1 self-start text-[13px] text-muted hover:text-text">
          <ChevronLeft size={15} />
          All products
        </button>
        <div className="flex items-baseline gap-2">
          <div className="min-w-0 flex-1 truncate text-[20px] font-semibold tracking-[-0.01em]">{p.name}</div>
          <button type="button" onClick={onPreview} className={`${link} flex flex-none items-center gap-1`}>
            Preview
            <ExternalLink size={13} />
          </button>
        </div>
        <span className="truncate font-mono text-[12px] text-muted">/product/{p.id}</span>
        {p.sample && <Warn>This is a sample product. Editing it marks it as real.</Warn>}
      </div>

      {text('name', 'Name')}
      <div className="flex gap-3">
        {money('price', 'Price')}
        {money('compareAt', 'Was (struck through)')}
      </div>
      {p.compareAt !== undefined && p.compareAt <= p.price && <span className="-mt-3 text-[12px] text-muted">The old price only shows when it’s higher than the price.</span>}
      {text('category', 'Category', { list: 'product-categories', placeholder: 'e.g. Dresses, Audio, Starters' })}
      <datalist id="product-categories">
        {categories.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      {text('description', 'Description', { multiline: true })}

      <div className="flex flex-col gap-2">
        <span className="text-[13px] font-medium">Photos</span>
        <div className="grid grid-cols-3 gap-2">
          <Photo src={p.image.src} label="Main photo" onPick={() => onPickImage('image')} />
          {photos.map((img, i) => (
            <Photo key={i} src={img.src} label={`Photo ${i + 2}`} onPick={() => onPickImage(`images.${i}`)} onRemove={() => set('images', photos.length > 1 ? photos.filter((_, j) => j !== i) : undefined)} />
          ))}
          {photos.length < 6 && (
            <button
              type="button"
              onClick={() => onPickImage(`images.${photos.length}`)}
              aria-label="Add a photo"
              className="flex aspect-square cursor-pointer items-center justify-center rounded-[10px] border border-dashed border-border text-muted hover:bg-hover hover:text-text"
            >
              <Plus size={18} />
            </button>
          )}
        </div>
        <label className="flex flex-col gap-1.5 text-[13px] font-medium">
          Main photo description
          <input
            key={p.image.alt}
            defaultValue={p.image.alt}
            placeholder="What the photo shows"
            onBlur={(e) => e.target.value !== p.image.alt && set('image', { ...p.image, alt: e.target.value })}
            className={`${field} h-[34px] text-[13px]`}
          />
        </label>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-[13px] font-medium">Options</span>
        {options.map((o, i) => (
          <div key={i} className="flex flex-col gap-2 rounded-xl border border-border p-3">
            <div className="flex items-center gap-2">
              <input
                key={o.name}
                aria-label="Option name"
                defaultValue={o.name}
                placeholder="Size, Colour…"
                onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== o.name && set('options', options.map((x, j) => (j === i ? { ...x, name: e.target.value.trim() } : x)))}
                className={`${field} h-[34px] min-w-0 flex-1 text-[13px]`}
              />
              <button
                type="button"
                aria-label={`Remove ${o.name}`}
                onClick={() => set('options', options.length > 1 ? options.filter((_, j) => j !== i) : undefined)}
                className="flex size-8 flex-none cursor-pointer items-center justify-center rounded-full text-muted hover:bg-hover hover:text-danger"
              >
                <X size={14} />
              </button>
            </div>
            <input
              key={o.values.join(',')}
              aria-label={`${o.name} choices`}
              defaultValue={o.values.join(', ')}
              placeholder="S, M, L"
              onBlur={(e) => {
                const values = [...new Set(e.target.value.split(',').map((v) => v.trim().slice(0, 24)).filter(Boolean))].slice(0, 12);
                if (values.length && values.join(',') !== o.values.join(',')) set('options', options.map((x, j) => (j === i ? { ...x, values } : x)));
              }}
              className={`${field} h-[34px] text-[13px]`}
            />
            <span className="text-[11px] text-muted">Choices separated by commas, up to 12.</span>
          </div>
        ))}
        {options.length < 2 && (
          <button
            type="button"
            onClick={() => set('options', [...options, options.some((o) => o.name === 'Size') ? { name: 'Colour', values: ['Black', 'White'] } : { name: 'Size', values: ['S', 'M', 'L'] }])}
            className="flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-[10px] border border-dashed border-border text-[13px] font-medium text-muted hover:bg-hover hover:text-text"
          >
            <Plus size={14} />
            Add an option (size, colour…)
          </button>
        )}
      </div>

      <div className="flex items-center gap-3 text-[13px] font-medium">
        <span className="flex-1">Sold out</span>
        <Switch on={!!p.soldOut} label="Sold out" size="sm" onChange={(v) => set('soldOut', v || undefined)} />
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        <button type="button" disabled={isFirst} onClick={() => onMove(-1)} className={pill}>
          <ArrowUp size={14} />
          Move up
        </button>
        <button type="button" disabled={isLast} onClick={() => onMove(1)} className={pill}>
          <ArrowDown size={14} />
          Move down
        </button>
        <button type="button" onClick={onDuplicate} className={pill}>
          <Copy size={14} />
          Duplicate
        </button>
        <button type="button" onClick={onRemove} className={`${pill} border-transparent text-danger`}>
          <Trash2 size={14} />
          Remove
        </button>
      </div>
    </div>
  );
}

function Photo({ src, label, onPick, onRemove }: { src: string; label: string; onPick: () => void; onRemove?: () => void }) {
  return (
    <div className="group relative aspect-square">
      <button
        type="button"
        onClick={onPick}
        aria-label={`Replace ${label.toLowerCase()}`}
        title={label}
        className="relative flex size-full cursor-pointer items-center justify-center overflow-hidden rounded-[10px] border border-border bg-[repeating-linear-gradient(135deg,var(--sel)_0_7px,transparent_7px_14px)] text-muted hover:border-muted"
      >
        {src ? <img src={src} alt="" className="absolute inset-0 size-full object-cover" /> : <ImagePlus size={18} />}
      </button>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${label.toLowerCase()}`}
          className="absolute top-1 right-1 flex size-6 cursor-pointer items-center justify-center rounded-full bg-raised text-muted shadow-raised hover:text-danger"
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
}
