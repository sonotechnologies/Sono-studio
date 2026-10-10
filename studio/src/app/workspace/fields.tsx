'use client';

/* eslint-disable @next/next/no-img-element */
import { ArrowDown, ArrowUp, ChevronRight, ImagePlus, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { z } from 'zod';
import { inputClass } from '@/components/ui';

/*
 * The Edit panel's form, built from each section's content schema, so every
 * section and field is editable without a hand-written form per section.
 */

type Def = { type: string; shape?: Record<string, z.ZodType>; innerType?: z.ZodType; element?: z.ZodType; options?: z.ZodType[]; in?: z.ZodType; values?: unknown[] };
const def = (s: z.ZodType): Def => (s as unknown as { _zod: { def: Def } })._zod.def;

function unwrap(s: z.ZodType): { schema: z.ZodType; optional: boolean } {
  let cur = s;
  let optional = false;
  for (;;) {
    const d = def(cur);
    if (d.type === 'optional' || d.type === 'nullable') optional = true;
    if ((d.type === 'optional' || d.type === 'nullable' || d.type === 'default') && d.innerType) cur = d.innerType;
    else if (d.type === 'pipe' && d.in) cur = d.in;
    else return { schema: cur, optional };
  }
}

/** A blank value that fits the schema, for new list items and optional parts. */
export function emptyFor(s: z.ZodType): unknown {
  const { schema } = unwrap(s);
  const d = def(schema);
  if (d.type === 'object') {
    return Object.fromEntries(
      Object.entries(d.shape ?? {})
        .filter(([, v]) => !unwrap(v).optional)
        .map(([k, v]) => [k, emptyFor(v)]),
    );
  }
  if (d.type === 'array') return [];
  if (d.type === 'number') return 0;
  if (d.type === 'boolean') return false;
  if (d.type === 'union') return emptyFor(d.options![0]);
  if (d.type === 'literal') return d.values?.[0] ?? '';
  return '';
}

const LABELS: Record<string, string> = {
  eyebrow: 'Small line above', heading: 'Heading', subheading: 'Text under the heading', primaryCta: 'Main button', secondaryCta: 'Second button',
  cta: 'Button', button: 'Button', secondary: 'Second button', body: 'Paragraphs', intro: 'Intro', items: 'Items', images: 'Photos',
  image: 'Photo', logo: 'Logo', brand: 'Business name', links: 'Links', tagline: 'Tagline', note: 'Small print', instagram: 'Instagram',
  whatsapp: 'WhatsApp', phone: 'Phone', email: 'Email', address: 'Address', hours: 'Opening hours', days: 'Days', time: 'Time',
  mapQuery: 'Map location', title: 'Title', text: 'Text', price: 'Price', quote: 'Quote', name: 'Name', detail: 'Detail',
  rating: 'Rating (0 to 5)', ratingCount: 'Rating note', value: 'Number', label: 'Label', question: 'Question', answer: 'Answer',
  signature: 'Signature', number: 'WhatsApp number', message: 'Pre-filled message', alt: 'Description (alt text)',
};
const MULTILINE = new Set(['subheading', 'intro', 'text', 'answer', 'quote', 'tagline', 'message', 'body']);

export function humanLabel(key: string): string {
  return LABELS[key] ?? key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
}

export interface FieldCtx {
  set: (path: string, value: unknown) => void;
  pickImage: (path: string) => void;
  pages: { path: string; title: string }[];
  /** Field to scroll to and focus, e.g. after clicking text that can't be edited in place. */
  focusPath: string | null;
}

const fieldInput = `${inputClass} rounded-[10px] bg-bg px-[11px] text-[14px]`;

function TextField({ label, value, path, multiline, ctx }: { label: string; value: string; path: string; multiline: boolean; ctx: FieldCtx }) {
  const commit = (v: string) => v !== value && ctx.set(path, v);
  const focus = ctx.focusPath === path;
  return (
    <label className="flex flex-col gap-1.5 text-[13px] font-medium" data-field={path}>
      {label}
      {multiline ? (
        <textarea
          key={value}
          autoFocus={focus}
          defaultValue={value}
          rows={Math.min(6, Math.max(2, Math.ceil(value.length / 38)))}
          onBlur={(e) => commit(e.target.value)}
          className={`${fieldInput} resize-y py-[9px] leading-[1.45]`}
        />
      ) : (
        <input
          key={value}
          autoFocus={focus}
          defaultValue={value}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          className={`${fieldInput} h-[38px]`}
        />
      )}
    </label>
  );
}

function LinkField({ label, value, path, ctx, onRemove }: { label: string; value: { label: string; href: string }; path: string; ctx: FieldCtx; onRemove?: () => void }) {
  const listId = `links-${path}`;
  return (
    <fieldset className="m-0 flex flex-col gap-2 rounded-xl border border-border p-3" data-field={path}>
      <legend className="flex w-full items-center px-1 text-[13px] font-medium">
        <span className="flex-1">{label}</span>
      </legend>
      <input
        key={`l${value.label}`}
        autoFocus={ctx.focusPath === `${path}.label`}
        aria-label={`${label} text`}
        defaultValue={value.label}
        placeholder="Button text"
        onBlur={(e) => e.target.value !== value.label && ctx.set(`${path}.label`, e.target.value)}
        className={`${fieldInput} h-[38px]`}
      />
      <input
        key={`h${value.href}`}
        aria-label={`${label} link`}
        list={listId}
        defaultValue={value.href}
        placeholder="/contact, https://…, tel:…"
        onBlur={(e) => e.target.value !== value.href && ctx.set(`${path}.href`, e.target.value.trim())}
        className={`${fieldInput} h-[38px] font-mono text-[12px]`}
      />
      <datalist id={listId}>
        {ctx.pages.map((p) => (
          <option key={p.path} value={p.path}>
            {p.title}
          </option>
        ))}
      </datalist>
      {onRemove && (
        <button type="button" onClick={onRemove} className="self-start text-[12px] font-medium text-danger hover:underline">
          Remove {label.toLowerCase()}
        </button>
      )}
    </fieldset>
  );
}

function ImageField({ label, value, path, ctx, onRemove }: { label: string; value: { src: string; alt: string; credit?: string }; path: string; ctx: FieldCtx; onRemove?: () => void }) {
  return (
    <div className="flex flex-col gap-2" data-field={path}>
      <span className="text-[13px] font-medium">{label}</span>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => ctx.pickImage(path)}
          className="relative flex h-[72px] w-[96px] flex-none cursor-pointer items-center justify-center overflow-hidden rounded-[10px] border border-border bg-[repeating-linear-gradient(135deg,var(--sel)_0_7px,transparent_7px_14px)] text-muted hover:border-muted"
          aria-label={`Replace ${label.toLowerCase()}`}
        >
          {value.src ? <img src={value.src} alt="" className="absolute inset-0 h-full w-full object-cover" /> : <ImagePlus size={18} />}
        </button>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <input
            key={value.alt}
            aria-label={`${label} description`}
            defaultValue={value.alt}
            placeholder="What the photo shows"
            onBlur={(e) => e.target.value !== value.alt && ctx.set(`${path}.alt`, e.target.value)}
            className={`${fieldInput} h-[34px] text-[13px]`}
          />
          <div className="flex flex-wrap gap-x-3 text-[12px]">
            <button type="button" onClick={() => ctx.pickImage(path)} className="font-medium text-accent-text hover:underline">
              {value.src ? 'Replace' : 'Choose photo'}
            </button>
            {value.src && (
              <button type="button" onClick={() => ctx.set(`${path}.src`, '')} className="text-muted hover:text-text hover:underline">
                Use placeholder
              </button>
            )}
            {onRemove && (
              <button type="button" onClick={onRemove} className="text-danger hover:underline">
                Remove
              </button>
            )}
          </div>
          {value.credit && <span className="truncate text-[11px] text-muted">{value.credit}</span>}
        </div>
      </div>
    </div>
  );
}

function itemTitle(v: unknown, i: number): string {
  if (typeof v === 'string') return v || `Item ${i + 1}`;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    const s = [o.title, o.name, o.question, o.label, o.days, o.value, o.alt, o.quote].find((x) => typeof x === 'string' && x);
    if (s) return String(s);
  }
  return `Item ${i + 1}`;
}

function ArrayField({ label, schema, value, path, ctx }: { label: string; schema: z.ZodType; value: unknown[]; path: string; ctx: FieldCtx }) {
  const element = def(schema).element!;
  // Opens the item holding the field to focus, e.g. "items.2.title".
  const [open, setOpen] = useState<number | null>(() => {
    const rest = ctx.focusPath?.startsWith(`${path}.`) ? ctx.focusPath.slice(path.length + 1) : '';
    return /^\d+/.test(rest) ? parseInt(rest, 10) : null;
  });
  const isImage = def(unwrap(element).schema).type === 'object' && 'src' in (def(unwrap(element).schema).shape ?? {});
  const isText = def(unwrap(element).schema).type === 'string';
  const move = (i: number, to: number) => {
    if (to < 0 || to >= value.length) return;
    const arr = [...value];
    const [it] = arr.splice(i, 1);
    arr.splice(to, 0, it);
    ctx.set(path, arr);
  };
  return (
    <div className="flex flex-col gap-2" data-field={path}>
      <span className="text-[13px] font-medium">
        {label} <span className="font-normal text-muted">· {value.length}</span>
      </span>
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
        {value.map((item, i) => {
          const itemPath = `${path}.${i}`;
          const expanded = isText || open === i;
          return (
            <li key={i} className="rounded-xl border border-border">
              <div className="flex items-center gap-1 py-1 pr-1 pl-2">
                {!isText && (
                  <button type="button" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : i)} className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 py-1 text-left text-[13px]">
                    <ChevronRight size={14} className={`flex-none text-muted transition-transform ${expanded ? 'rotate-90' : ''}`} />
                    <span className="truncate">{itemTitle(item, i)}</span>
                  </button>
                )}
                {isText && <span className="flex-1 text-[12px] text-muted">Paragraph {i + 1}</span>}
                <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => move(i, i - 1)} className="flex size-7 cursor-pointer items-center justify-center rounded-full text-muted hover:bg-hover disabled:opacity-30">
                  <ArrowUp size={13} />
                </button>
                <button type="button" aria-label="Move down" disabled={i === value.length - 1} onClick={() => move(i, i + 1)} className="flex size-7 cursor-pointer items-center justify-center rounded-full text-muted hover:bg-hover disabled:opacity-30">
                  <ArrowDown size={13} />
                </button>
                <button type="button" aria-label="Remove" onClick={() => ctx.set(path, value.filter((_, j) => j !== i))} className="flex size-7 cursor-pointer items-center justify-center rounded-full text-muted hover:bg-hover hover:text-danger">
                  <Trash2 size={13} />
                </button>
              </div>
              {expanded && (
                <div className="flex flex-col gap-3 border-t border-border p-3">
                  <FieldFor name={isImage ? 'image' : isText ? 'body' : 'item'} schema={element} value={item} path={itemPath} ctx={ctx} hideLabel={isText} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        onClick={() => {
          const fresh = value.length && !isImage ? clearStrings(structuredClone(value.at(-1))) : emptyFor(element);
          ctx.set(path, [...value, fresh]);
          setOpen(value.length);
        }}
        className="flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-[10px] border border-dashed border-border text-[13px] font-medium text-muted hover:bg-hover hover:text-text"
      >
        <Plus size={14} />
        Add {label === 'Paragraphs' ? 'paragraph' : label === 'Photos' ? 'photo' : 'item'}
      </button>
    </div>
  );
}

/** A copy of the last item with its text cleared, so the new one has the same shape. */
function clearStrings(v: unknown): unknown {
  if (typeof v === 'string') return '';
  if (Array.isArray(v)) return v.map(clearStrings);
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (typeof o.src === 'string' && typeof o.alt === 'string') return { src: '', alt: '' };
    if (typeof o.href === 'string' && typeof o.label === 'string') return { ...o, label: '' };
    return Object.fromEntries(Object.entries(o).map(([k, x]) => [k, clearStrings(x)]));
  }
  return v;
}

export function FieldFor({
  name,
  schema,
  value,
  path,
  ctx,
  hideLabel = false,
}: {
  name: string;
  schema: z.ZodType;
  value: unknown;
  path: string;
  ctx: FieldCtx;
  hideLabel?: boolean;
}) {
  const { schema: inner, optional } = unwrap(schema);
  const d = def(inner);
  const label = hideLabel ? '' : humanLabel(name);
  const remove = optional ? () => ctx.set(path, undefined) : undefined;

  if (value === undefined) {
    return (
      <button
        type="button"
        onClick={() => ctx.set(path, emptyFor(inner))}
        className="flex h-9 cursor-pointer items-center gap-1.5 self-start rounded-full border border-dashed border-border px-3 text-[12px] font-medium text-muted hover:bg-hover hover:text-text"
      >
        <Plus size={13} />
        Add {humanLabel(name).toLowerCase()}
      </button>
    );
  }
  if (d.type === 'object') {
    const shape = d.shape ?? {};
    if ('src' in shape && 'alt' in shape) return <ImageField label={label || 'Photo'} value={value as { src: string; alt: string }} path={path} ctx={ctx} onRemove={remove} />;
    if ('href' in shape && 'label' in shape) return <LinkField label={label || 'Link'} value={value as { label: string; href: string }} path={path} ctx={ctx} onRemove={remove} />;
    return (
      <>
        {Object.entries(shape).map(([k, s]) => (
          <FieldFor key={k} name={k} schema={s} value={(value as Record<string, unknown>)[k]} path={path ? `${path}.${k}` : k} ctx={ctx} />
        ))}
      </>
    );
  }
  if (d.type === 'array') return <ArrayField label={label} schema={inner} value={(value as unknown[]) ?? []} path={path} ctx={ctx} />;
  if (d.type === 'number') {
    return (
      <label className="flex flex-col gap-1.5 text-[13px] font-medium" data-field={path}>
        {label}
        <span className="flex gap-2">
          <input
            key={String(value)}
            type="number"
            step="0.1"
            defaultValue={value as number}
            onBlur={(e) => Number(e.target.value) !== value && ctx.set(path, Number(e.target.value))}
            className={`${fieldInput} h-[38px] w-28`}
          />
          {remove && (
            <button type="button" onClick={remove} className="text-[12px] text-danger hover:underline">
              Remove
            </button>
          )}
        </span>
      </label>
    );
  }
  return <TextField label={label} value={String(value ?? '')} path={path} multiline={MULTILINE.has(name)} ctx={ctx} />;
}
