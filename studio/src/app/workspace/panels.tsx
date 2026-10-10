'use client';

import { AlertTriangle, ArrowDown, ArrowUp, Check, Copy, Eye, EyeOff, Sparkles, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { contentSchemaFor } from '@/generate/fill';
import { PRESETS } from '@/lib/presets';
import { PRESET_IDS, type PresetId } from '@/lib/types';
import { SECTIONS } from '@/site/registry';
import type { Section, SiteTheme } from '@/site/schema';
import { contrast, FONT_VARS, readableOn, themeFromPreset } from '@/site/theme';
import { sectionLabel } from '@/workspace/model';
import { FieldFor, type FieldCtx } from './fields';

const pill = 'flex h-[34px] cursor-pointer items-center gap-1.5 rounded-full border border-border px-3 text-[13px] font-medium hover:bg-hover disabled:cursor-default disabled:opacity-40';

/* ---------- Edit ---------- */

export function EditPanel({
  section,
  isFirst,
  isLast,
  ctx,
  onVariant,
  onMove,
  onDuplicate,
  onToggleHidden,
  onRemove,
  onAsk,
}: {
  section: Section | null;
  isFirst: boolean;
  isLast: boolean;
  ctx: FieldCtx;
  onVariant: (variant: string) => void;
  onMove: (dir: -1 | 1) => void;
  onDuplicate: () => void;
  onToggleHidden: () => void;
  onRemove: () => void;
  onAsk: () => void;
}) {
  if (!section) {
    return <div className="flex flex-1 items-center justify-center p-8 text-center text-[14px] leading-normal text-muted">Select a section in the preview or the list to edit it.</div>;
  }
  const def = SECTIONS[section.type];
  const { detail } = sectionLabel(section);
  const fixed = section.type === 'navbar' || section.type === 'footer';
  return (
    // Keyed by section so a new selection starts with fresh inputs.
    <div key={section.id} className="flex flex-1 flex-col gap-[22px] overflow-auto p-5">
      <div className="flex flex-col gap-0.5">
        <div className="text-[20px] font-semibold tracking-[-0.01em]">{def.label}</div>
        <div className="truncate text-[13px] text-muted">{section.hidden ? 'Hidden on the site' : detail}</div>
      </div>

      {def.variants.length > 1 && (
        <div className="flex flex-col gap-2">
          <div className="text-[13px] font-medium">Layout</div>
          <div className="grid grid-cols-2 gap-2">
            {def.variants.map((v) => {
              const on = v.id === section.variant;
              return (
                <button
                  key={v.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => !on && onVariant(v.id)}
                  title={v.note}
                  className={`relative flex cursor-pointer flex-col gap-1 rounded-xl bg-bg p-2.5 text-left ${on ? 'border-[1.5px] border-terracotta' : 'border-[1.5px] border-border hover:border-muted'}`}
                >
                  <span className="text-[12px] font-medium">{v.label}</span>
                  <span className="text-[11px] leading-snug text-muted">{v.note}</span>
                  {on && (
                    <span className="absolute -top-1.5 -right-1.5 flex size-[18px] items-center justify-center rounded-full bg-terracotta text-white">
                      <Check size={11} strokeWidth={3} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-4">
        <FieldFor name="content" schema={contentSchemaFor(section.type)} value={section.content} path="" ctx={ctx} hideLabel />
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        <button type="button" disabled={fixed || isFirst} onClick={() => onMove(-1)} className={pill}>
          <ArrowUp size={14} />
          Move up
        </button>
        <button type="button" disabled={fixed || isLast} onClick={() => onMove(1)} className={pill}>
          <ArrowDown size={14} />
          Move down
        </button>
        {!fixed && (
          <button type="button" onClick={onDuplicate} className={pill}>
            <Copy size={14} />
            Duplicate
          </button>
        )}
        <button type="button" onClick={onToggleHidden} className={pill}>
          {section.hidden ? <Eye size={14} /> : <EyeOff size={14} />}
          {section.hidden ? 'Show' : 'Hide'}
        </button>
        {!fixed && (
          <button type="button" onClick={onRemove} className={`${pill} border-transparent text-danger`}>
            <Trash2 size={14} />
            Remove
          </button>
        )}
      </div>
      <button type="button" onClick={onAsk} className="flex cursor-pointer items-center gap-1.5 self-start text-[13px] font-medium text-accent-text hover:underline">
        <Sparkles size={14} />
        Ask the AI to change this section
      </button>
    </div>
  );
}

/* ---------- Theme ---------- */

const CORNERS = {
  sharp: { label: 'Sharp', radius: { card: 2, button: 2, input: 2 } },
  soft: { label: 'Soft', radius: { card: 14, button: 12, input: 10 } },
  round: { label: 'Round', radius: { card: 24, button: 999, input: 999 } },
} as const;
type Corner = keyof typeof CORNERS;

const COLOR_ROLES = [
  ['background', 'Background'],
  ['surface', 'Surface'],
  ['text', 'Text'],
  ['muted', 'Muted text'],
  ['primary', 'Primary'],
  ['accent', 'Accent'],
] as const;

function warnings(t: SiteTheme): string[] {
  const c = t.colors;
  const out: string[] = [];
  if (contrast(c.text, c.background) < 4.5) out.push('Text is hard to read on the background.');
  if (contrast(c.text, c.surface) < 4.5) out.push('Text is hard to read on the surface colour.');
  if (contrast(c.muted, c.background) < 3) out.push('Muted text is too faint on the background.');
  if (contrast(c.onPrimary, c.primary) < 4.5) out.push('Button text is hard to read on the primary colour.');
  return out;
}

export function ThemePanel({ theme, onChange }: { theme: SiteTheme; onChange: (theme: SiteTheme, summary: string) => void }) {
  const [choosing, setChoosing] = useState(false);
  const preset = PRESETS[theme.preset];
  const corner = (Object.keys(CORNERS) as Corner[]).find((k) => JSON.stringify(CORNERS[k].radius) === JSON.stringify(theme.radius));
  const modes = (['light', 'dark'] as const).filter((m) => preset.colors[m]);
  const font = (name: string) => `${FONT_VARS[name] ?? `'${name}'`}, serif`;
  const setColor = (role: (typeof COLOR_ROLES)[number][0], hex: string) => {
    const colors = { ...theme.colors, [role]: hex.toUpperCase() };
    colors.onPrimary = readableOn(colors.primary, colors.background, colors.text);
    onChange({ ...theme, colors }, 'Colours');
  };
  const fresh = (id: PresetId, mode = theme.mode) => themeFromPreset(id, { mode });
  const isDefault = JSON.stringify(fresh(theme.preset)) === JSON.stringify(theme);
  const warn = warnings(theme);

  return (
    <div className="flex flex-1 flex-col gap-[22px] overflow-auto p-5">
      <div className="flex flex-col gap-3.5 rounded-[14px] border border-border bg-bg p-4">
        <div className="flex items-baseline gap-2">
          <div className="flex-1 text-[16px] font-semibold">{preset.name}</div>
          <button type="button" onClick={() => setChoosing((v) => !v)} className="cursor-pointer text-[13px] font-medium text-accent-text hover:underline">
            {choosing ? 'Done' : 'Change'}
          </button>
        </div>
        <div className="text-[13px] text-muted">{preset.feel}</div>
        <div className="flex items-center gap-3.5 rounded-[10px] p-3.5" style={{ background: theme.colors.background, color: theme.colors.text }}>
          <div className="text-[34px] leading-none font-medium" style={{ fontFamily: font(theme.fonts.heading) }}>
            Aa
          </div>
          <div className="flex min-w-0 flex-col gap-0.5 text-[12px]">
            <span className="truncate text-[15px]" style={{ fontFamily: font(theme.fonts.heading) }}>
              {theme.fonts.heading}
            </span>
            <span className="truncate" style={{ fontFamily: font(theme.fonts.body), color: theme.colors.muted }}>
              {theme.fonts.body} for body
            </span>
          </div>
          <span className="ml-auto h-7 flex-none rounded-full px-3 text-[12px] leading-7 font-semibold" style={{ background: theme.colors.primary, color: theme.colors.onPrimary }}>
            Button
          </span>
        </div>
        {choosing && (
          <div className="flex flex-col gap-1.5">
            {PRESET_IDS.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  if (id !== theme.preset) onChange(fresh(id), `Style: ${PRESETS[id].name}`);
                  setChoosing(false);
                }}
                className={`flex cursor-pointer items-center gap-3 rounded-[10px] px-2.5 py-2 text-left hover:bg-hover ${id === theme.preset ? 'bg-sel' : ''}`}
              >
                <span className="flex flex-none">
                  {(['background', 'primary', 'accent'] as const).map((k) => (
                    <span key={k} className="-mr-1.5 size-5 rounded-full border border-border" style={{ background: (PRESETS[id].colors.light ?? PRESETS[id].colors.dark)![k] }} />
                  ))}
                </span>
                <span className="flex min-w-0 flex-col pl-1.5">
                  <span className="text-[13px] font-medium">{PRESETS[id].name}</span>
                  <span className="truncate text-[12px] text-muted">{PRESETS[id].feel}</span>
                </span>
              </button>
            ))}
            <p className="m-0 text-[12px] text-muted">Changing the style resets colours, fonts and corners. Undo brings them back.</p>
          </div>
        )}
      </div>

      {modes.length > 1 && (
        <div className="flex flex-col gap-2">
          <div className="text-[13px] font-medium">Mode</div>
          <Seg options={modes.map((m) => [m, m === 'light' ? 'Light' : 'Dark'] as const)} value={theme.mode} onPick={(m) => onChange(fresh(theme.preset, m), m === 'light' ? 'Light mode' : 'Dark mode')} />
        </div>
      )}

      <div className="flex flex-col gap-1">
        <div className="pb-1.5 text-[13px] font-medium">Colours</div>
        {COLOR_ROLES.map(([role, label]) => (
          <label key={role} className="flex h-9 cursor-pointer items-center gap-3">
            <span className="relative size-[26px] flex-none overflow-hidden rounded-full border border-border" style={{ background: theme.colors[role] }}>
              <input
                type="color"
                value={theme.colors[role]}
                onChange={(e) => setColor(role, e.target.value)}
                className="absolute inset-0 size-full cursor-pointer opacity-0"
                aria-label={`${label} colour`}
              />
            </span>
            <span className="flex-1 text-[14px]">{label}</span>
            <span className="font-mono text-[12px] text-muted">{theme.colors[role]}</span>
          </label>
        ))}
        {warn.length > 0 && (
          <div role="status" className="mt-2 flex gap-2 rounded-[10px] bg-warn-bg p-3 text-[13px] text-warn">
            <AlertTriangle size={15} className="mt-0.5 flex-none" />
            <span>{warn.join(' ')}</span>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <div className="text-[13px] font-medium">Fonts</div>
        {(['heading', 'body'] as const).map((k) => (
          <label key={k} className="flex items-center gap-3 text-[13px]">
            <span className="w-16 text-muted">{k === 'heading' ? 'Headings' : 'Body'}</span>
            <select
              value={theme.fonts[k]}
              onChange={(e) => onChange({ ...theme, fonts: { ...theme.fonts, [k]: e.target.value } }, 'Fonts')}
              className="h-9 flex-1 cursor-pointer rounded-[10px] border border-border bg-bg px-2.5 text-[14px] text-text outline-none focus:border-terracotta"
            >
              {Object.keys(FONT_VARS).map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <div className="text-[13px] font-medium">Corners</div>
        <Seg
          options={(Object.keys(CORNERS) as Corner[]).map((k) => [k, CORNERS[k].label] as const)}
          value={corner ?? null}
          onPick={(k) => onChange({ ...theme, radius: { ...CORNERS[k].radius } }, 'Corners')}
        />
      </div>

      {!isDefault && (
        <button type="button" onClick={() => onChange(fresh(theme.preset), 'Reset style')} className="cursor-pointer self-start text-[13px] font-medium text-muted hover:text-text hover:underline">
          Reset to {preset.name} defaults
        </button>
      )}
    </div>
  );
}

function Seg<T extends string>({ options, value, onPick }: { options: readonly (readonly [T, string])[]; value: T | null; onPick: (v: T) => void }) {
  return (
    <div className="flex rounded-full bg-sel p-[3px]">
      {options.map(([k, label]) => {
        const on = k === value;
        return (
          <button
            key={k}
            type="button"
            aria-pressed={on}
            onClick={() => !on && onPick(k)}
            className={`h-8 flex-1 cursor-pointer rounded-full text-[13px] font-medium ${on ? 'bg-surface text-text shadow-[0_1px_3px_rgba(0,0,0,.12)]' : 'text-muted hover:text-text'}`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
