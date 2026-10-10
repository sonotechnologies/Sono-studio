'use client';

import { Check, ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { startTransition, useActionState, useState } from 'react';
import { Field, btn, inputClass } from '@/components/ui';
import { PRESETS, PRESET_THUMBS } from '@/lib/presets';
import { PRESET_IDS, SITE_TYPES, SITE_TYPE_LABELS, type PresetId, type SiteType } from '@/lib/types';
import { createProjectAction, type CreateState } from '../actions';

const SITE_TYPE_NOTES: Record<SiteType, string> = {
  showcase: 'Menu, rooms or services, gallery, contact',
  store: 'Products, cart, WhatsApp or card checkout',
  booking: 'Services, date and time, deposit',
};

const BUSINESS_TYPES = [
  'Restaurant', 'Bakery', 'Café', 'Hotel', 'Salon', 'Barber', 'Fashion boutique', 'Streetwear',
  'Gadget store', 'Wellness studio', 'Travel agency', 'Events',
];

function RingTick() {
  return (
    <span className="flex size-6 items-center justify-center rounded-full bg-terracotta text-white">
      <Check size={14} strokeWidth={3} />
    </span>
  );
}

function ChoiceCard({
  name,
  value,
  checked,
  onSelect,
  children,
}: {
  name: string;
  value: string;
  checked: boolean;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <label
      className={`relative flex cursor-pointer flex-col overflow-hidden rounded-dialog border-[1.5px] bg-surface transition-[border-color,transform] duration-150 has-[:focus-visible]:shadow-focus ${
        checked ? 'border-terracotta' : 'border-border hover:border-muted'
      }`}
    >
      <input type="radio" name={name} value={value} checked={checked} onChange={onSelect} className="sr-only" />
      {children}
      {checked && (
        <span className="absolute top-3 right-3">
          <RingTick />
        </span>
      )}
    </label>
  );
}

function SectionTitle({ children, note }: { children: React.ReactNode; note?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <h2 className="m-0 text-[20px] font-semibold tracking-[-0.01em]">{children}</h2>
      {note && <p className="m-0 text-[14px] text-muted">{note}</p>}
    </div>
  );
}

export function NewProjectForm() {
  const [state, action, pending] = useActionState<CreateState, FormData>(createProjectAction, {});
  const [siteType, setSiteType] = useState<SiteType>('showcase');
  const [preset, setPreset] = useState<PresetId>('warm-table');
  const e = state.errors ?? {};
  const input = `${inputClass} h-11 text-[16px]`;

  return (
    <form
      // Submitted by hand rather than via the action prop, so a validation error doesn't clear the fields.
      onSubmit={(ev) => {
        ev.preventDefault();
        const data = new FormData(ev.currentTarget);
        startTransition(() => action(data));
      }}
      className="flex flex-col gap-10"
    >
      <Link
        href="/"
        className="-mb-4 flex min-h-8 items-center gap-1.5 self-start text-[14px] text-muted hover:text-text"
      >
        <ChevronLeft size={16} strokeWidth={2} />
        All projects
      </Link>

      <section className="flex flex-col gap-4">
        <SectionTitle note="The site wizard with AI generation arrives in a later phase. For now, add the project and client by hand.">
          Business
        </SectionTitle>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Business name" error={e.name}>
            <input name="name" required maxLength={80} className={input} placeholder="Kora Kitchen" />
          </Field>
          <Field label="Kind of business" error={e.businessType}>
            <input
              name="businessType"
              required
              maxLength={60}
              list="business-types"
              className={input}
              placeholder="Restaurant"
            />
            <datalist id="business-types">
              {BUSINESS_TYPES.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </Field>
        </div>
        <Field label="Headline" hint="Optional. Shown on the project thumbnail." error={e.headline}>
          <input name="headline" maxLength={120} className={input} placeholder="Slow-cooked family recipes" />
        </Field>
      </section>

      <section className="flex flex-col gap-4">
        <SectionTitle>Site type</SectionTitle>
        <div role="radiogroup" aria-label="Site type" className="grid gap-3 md:grid-cols-3">
          {SITE_TYPES.map((t) => (
            <ChoiceCard key={t} name="siteType" value={t} checked={siteType === t} onSelect={() => setSiteType(t)}>
              <div className="flex flex-col gap-1.5 p-5 pr-12">
                <span className="text-[16px] font-semibold">{SITE_TYPE_LABELS[t]}</span>
                <span className="text-[13px] leading-snug text-muted">{SITE_TYPE_NOTES[t]}</span>
              </div>
            </ChoiceCard>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <SectionTitle>Style preset</SectionTitle>
        <div role="radiogroup" aria-label="Style preset" className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
          {PRESET_IDS.map((id) => {
            const t = PRESET_THUMBS[id];
            return (
              <ChoiceCard key={id} name="preset" value={id} checked={preset === id} onSelect={() => setPreset(id)}>
                <div
                  aria-hidden
                  style={{ background: t.bg, color: t.text }}
                  className="flex h-[110px] flex-col justify-end gap-2 p-4"
                >
                  <span
                    style={{
                      fontFamily: t.headingFont,
                      letterSpacing: t.headingTracking,
                      textTransform: t.uppercase ? 'uppercase' : 'none',
                    }}
                    className="text-[22px] leading-[1.02]"
                  >
                    {t.sample}
                  </span>
                  <span
                    style={{ background: t.primary, color: t.onPrimary, fontFamily: t.bodyFont, borderRadius: t.buttonRadius }}
                    className="self-start px-2.5 py-1 text-[9px]"
                  >
                    {t.cta}
                  </span>
                </div>
                <div className="flex flex-col gap-0.5 px-4 py-3">
                  <span className="text-[14px] font-semibold">{PRESETS[id].name}</span>
                  <span className="text-[12px] text-muted">{t.suits}</span>
                </div>
              </ChoiceCard>
            );
          })}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <SectionTitle>Client</SectionTitle>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Owner" error={e.ownerName}>
            <input name="ownerName" maxLength={80} className={input} placeholder="Amara Osei" />
          </Field>
          <Field label="WhatsApp" error={e.whatsapp}>
            <input name="whatsapp" type="tel" maxLength={32} className={input} placeholder="+1 555 214 0090" />
          </Field>
          <Field label="Instagram" error={e.instagram}>
            <input name="instagram" maxLength={60} className={input} placeholder="@korakitchen" />
          </Field>
          <Field label="Address" error={e.address}>
            <input name="address" maxLength={160} className={input} placeholder="14 Mill Lane, Old Town" />
          </Field>
        </div>
        <Field label="Notes" error={e.notes}>
          <textarea
            name="notes"
            rows={4}
            maxLength={4000}
            className={`${inputClass} resize-y py-3 text-[14px] leading-normal`}
            placeholder="Where you met, what they want, how they like to be contacted"
          />
        </Field>
      </section>

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-6">
        {state.message && (
          <p role="alert" className="m-0 mr-auto text-[14px] text-danger">
            {state.message}
          </p>
        )}
        <Link href="/" className={`${btn.ghost} h-11 px-4 text-[14px]`}>
          Cancel
        </Link>
        <button type="submit" disabled={pending} className={`${btn.primary} h-11 px-5 text-[15px]`}>
          {pending ? 'Creating…' : 'Create project'}
        </button>
      </div>
    </form>
  );
}
