'use client';

import { useEffect, useMemo, useRef } from 'react';
import { SECTIONS } from '@/site/registry';
import { SitePageView } from '@/site/render';
import type { SiteConfig, SitePage } from '@/site/schema';
import { findSection, getIn } from '@/workspace/model';

export type Device = 'desktop' | 'tablet' | 'phone';
const FRAME: Record<Device, string> = { desktop: 'w-full max-w-[1280px] rounded-[10px]', tablet: 'w-[768px] rounded-[10px]', phone: 'w-[390px] rounded-[28px]' };

/*
 * The live site, rendered from the same config and components as the preview.
 * Clicking a section selects it; clicking a short text edits it in place;
 * clicking a photo opens the media library. Anything else is edited in the panel.
 */
export function Stage({
  config,
  page,
  device,
  selectedId,
  hoverId,
  flashIds,
  scrollKey,
  onHover,
  onSelect,
  onEditText,
  onFocusField,
  onPickImage,
}: {
  config: SiteConfig;
  page: SitePage;
  device: Device;
  selectedId: string | null;
  hoverId: string | null;
  flashIds: string[];
  /** Changes when the selection came from outside the stage, so it scrolls into view. */
  scrollKey: number;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
  onEditText: (sectionId: string, path: string, value: string) => void;
  onFocusField: (sectionId: string, path: string) => void;
  onPickImage: (sectionId: string, path: string) => void;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const ctx = useMemo(() => ({ link: (href: string) => href, editable: true }), []);

  useEffect(() => {
    if (!selectedId || !scrollKey) return;
    frame.current?.querySelector(`[data-section-id="${selectedId}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [scrollKey, selectedId]);

  const css = useMemo(() => {
    const box = (id: string, extra = '') => `.ws-stage [data-section-id="${id}"]::after{content:"";position:absolute;inset:0;z-index:30;pointer-events:none;border:2px solid #B4502E;${extra}}`;
    const label = (id: string) => {
      const s = findSection(config, id)?.section;
      return s ? `.ws-stage [data-section-id="${id}"]::before{content:"${SECTIONS[s.type].label}";position:absolute;top:0;left:0;z-index:31;pointer-events:none;background:#B4502E;color:#fff;font:500 11px/1 var(--font-space-grotesk),sans-serif;letter-spacing:.02em;padding:5px 9px;border-radius:0 0 8px 0}` : '';
    };
    const rules: string[] = [];
    if (hoverId && hoverId !== selectedId) rules.push(box(hoverId), label(hoverId));
    if (selectedId) rules.push(box(selectedId), label(selectedId));
    for (const id of flashIds) rules.push(box(id, 'animation:ws-flash 1.3s ease-out forwards;'));
    return rules.join('\n');
  }, [config, hoverId, selectedId, flashIds]);

  const onClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('a, button, summary')) {
      // In the editor, links don't navigate and buttons (add to cart, menus) don't act: a click selects.
      e.preventDefault();
      e.stopPropagation();
    }
    if (target.isContentEditable) return;
    const sec = target.closest<HTMLElement>('[data-section-id]');
    if (!sec) return;
    const id = sec.dataset.sectionId!;
    onSelect(id);
    const el = target.closest<HTMLElement>('[data-edit]');
    if (!el || !sec.contains(el)) return;
    const path = el.dataset.edit!;
    const kind = el.dataset.editKind;
    if (kind === 'image') return onPickImage(id, path);
    const textPath = kind === 'link' ? `${path}.label` : path;
    const section = findSection(config, id)?.section;
    const stored = section ? getIn(section.content, textPath) : undefined;
    const plain = el.childNodes.length === 1 && el.firstChild?.nodeType === Node.TEXT_NODE;
    if (typeof stored === 'string' && plain && el.textContent === stored) editInPlace(el, e.clientX, e.clientY, (v) => v !== stored && onEditText(id, textPath, v));
    else onFocusField(id, textPath);
  };

  return (
    <div
      className="ws-stage isolate flex min-h-full justify-center md:p-7"
      onMouseOver={(e) => {
        const id = (e.target as HTMLElement).closest<HTMLElement>('[data-section-id]')?.dataset.sectionId ?? null;
        if (id !== hoverId) onHover(id);
      }}
      onMouseLeave={() => onHover(null)}
      onClickCapture={onClick}
      onSubmitCapture={(e) => e.preventDefault()}
    >
      <style>{`${css}
.ws-stage [data-section-id]{cursor:pointer}
.ws-stage [data-section-id]:not(.sticky){position:relative}
.ws-stage [data-edit]:not([contenteditable]):hover{outline:1px dashed color-mix(in srgb,#B4502E 70%,transparent);outline-offset:3px}
.ws-stage [contenteditable]{outline:2px solid #B4502E;outline-offset:3px;cursor:text;border-radius:2px}
@keyframes ws-flash{0%{background:rgba(180,80,46,.22)}100%{background:transparent;border-color:transparent}}`}</style>
      <div
        ref={frame}
        className={`${FRAME[device]} flex-none self-start overflow-clip shadow-[0_18px_50px_rgba(22,20,15,.22)] transition-[width] duration-200 ease-out max-md:w-full max-md:max-w-none max-md:rounded-none max-md:shadow-none`}
      >
        <SitePageView config={config} page={page} ctx={ctx} />
      </div>
    </div>
  );
}

/**
 * Makes one text element editable where it is. The DOM text is put back before
 * the change is committed, so React stays the owner of what is rendered.
 */
function editInPlace(el: HTMLElement, x: number, y: number, commit: (value: string) => void) {
  const original = el.textContent ?? '';
  el.setAttribute('contenteditable', 'plaintext-only');
  if (el.contentEditable !== 'plaintext-only') el.setAttribute('contenteditable', 'true');
  el.spellcheck = true;
  el.focus();
  const doc = document as Document & { caretRangeFromPoint?: (x: number, y: number) => Range | null };
  const range = doc.caretRangeFromPoint?.(x, y);
  if (range && el.contains(range.startContainer)) {
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }
  const finish = (save: boolean) => {
    el.removeEventListener('blur', onBlur);
    el.removeEventListener('keydown', onKey);
    el.removeEventListener('paste', onPaste);
    const value = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
    el.removeAttribute('contenteditable');
    el.textContent = original;
    if (save && value) commit(value);
  };
  const onBlur = () => finish(true);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      el.blur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      finish(false);
    }
  };
  const onPaste = (e: ClipboardEvent) => {
    e.preventDefault();
    document.execCommand('insertText', false, (e.clipboardData?.getData('text/plain') ?? '').replace(/\s+/g, ' '));
  };
  el.addEventListener('blur', onBlur);
  el.addEventListener('keydown', onKey);
  el.addEventListener('paste', onPaste);
}
