import { z } from 'zod';
import { SECTIONS } from '@/site/registry';
import { sectionSchema, type Section, type SectionType } from '@/site/schema';
import { briefSummary } from './plan';
import type { Brief, Extracted, PlanPage } from './brief';

/** Content schema for each section type, taken from the discriminated union in the site schema. */
export function contentSchemaFor(type: SectionType): z.ZodType {
  const option = sectionSchema.options.find((o) => o.shape.type.value === type);
  if (!option) throw new Error(`Unknown section type ${type}`);
  return option.shape.content;
}

function jsonSchemaText(type: SectionType): string {
  const schema = z.toJSONSchema(contentSchemaFor(type), { io: 'input', unrepresentable: 'any' }) as Record<string, unknown>;
  delete schema.$schema;
  return JSON.stringify(schema);
}

/** True when the owner gave little beyond a name and a kind of business. */
export function thin(brief: Brief, extracted: Extracted | null): boolean {
  const known = (extracted?.facts.length ?? 0) + (extracted?.items.length ?? 0) + (extracted?.tagline ? 1 : 0);
  return known < 2 && brief.paste.trim().length < 80;
}

export function fillPrompt(brief: Brief, extracted: Extracted | null, page: PlanPage, photoCount: number) {
  const items = extracted?.items ?? [];
  return {
    system: [
      'You write website copy for small local businesses. You reply with a single JSON object and nothing else.',
      'Write plainly and warmly, in short sentences, specific to this business. No clichés, no lorem ipsum.',
      'Never invent facts: no made-up prices, years, awards, ratings, numbers, staff names, customer reviews, amenities, services, products, room types, materials, policies, opening hours or locations.',
      'This copy goes in front of the real owner, who will notice anything untrue about their business.',
      'Use only the facts given. Where something is unknown, describe the experience in general terms that are true of any good business of this kind, or leave the field empty.',
    ].join(' '),
    prompt: `Write the content for the "${page.title}" page (${page.path}).

${briefSummary(brief, extracted)}
${brief.paste.trim() ? `\nWhat the owner sent (use it first):\n"""${brief.paste.trim().slice(0, 3000)}"""\n` : ''}${
      items.length
        ? `\nMenu or price-list items (use these exactly, grouped by category where it helps):\n${items
            .map((i) => `- ${i.category ? `[${i.category}] ` : ''}${i.name}${i.price ? ` — ${i.price}` : ''}${i.description ? `: ${i.description}` : ''}`)
            .join('\n')}\n`
        : ''
    }
Sections on this page, in order:
${page.sections
  .map(
    (s) =>
      `- id "${s.id}", type "${s.type}", variant "${s.variant}" (${SECTIONS[s.type].variants.find((v) => v.id === s.variant)?.note ?? ''}). Purpose: ${s.note}
  content JSON schema: ${jsonSchemaText(s.type)}`,
  )
  .join('\n')}

What is known about the business is listed above and nothing else. The section purposes say what each section is for; they are not facts.
${thin(brief, extracted) ? 'Very little is known, so keep the copy general: no specific amenities, services, items or features.\n' : ''}
Rules for fields:
- Every image is {"src": "", "alt": "..."}: leave src empty and write alt as a short description of the ideal photo (it is used to find one). ${photoCount ? `The owner supplied ${photoCount} photo(s); they are placed automatically.` : ''}
- Links: use page paths like "/contact" or "/menu", or "/#section-id" for a section on the home page.
- Testimonials: no real reviews were supplied, so write two or three short sample quotes, name each "Customer name" and set detail to "Sample review". Leave rating out.
- Stats: only numbers that appear in the facts.
- FAQ: only questions whose answers are in the facts or the contact details given. If none, ask how to book or get in touch and answer with only the channels given.
- Contact: leave address, phone, WhatsApp, email and hours empty unless they are given; they are filled in from the owner's details.
- Never mention WhatsApp, Instagram, email or a phone number unless it was given.
- Keep headings under 8 words.

Reply with JSON in exactly this shape:
{"sections":[{"id":"${page.sections[0]?.id ?? 'section-id'}","content":{ ... }}]}`,
  };
}

/** Accepts the model's page reply only if every planned section is present and valid. */
export function fillResponseSchema(page: PlanPage) {
  return z
    .object({ sections: z.array(z.object({ id: z.string(), content: z.unknown() })) })
    .superRefine((value, ctx) => {
      page.sections.forEach((planned) => {
        const got = value.sections.find((s) => s.id === planned.id);
        if (!got) {
          ctx.addIssue({ code: 'custom', message: `Missing section "${planned.id}"`, path: ['sections'] });
          return;
        }
        const check = contentSchemaFor(planned.type).safeParse(got.content);
        if (!check.success) {
          for (const issue of check.error.issues.slice(0, 6)) {
            ctx.addIssue({ code: 'custom', message: issue.message, path: ['sections', planned.id, 'content', ...issue.path.map(String)] });
          }
        }
      });
    });
}

/** Facts the brief already knows win over anything the model wrote. */
export function applyKnownFacts(section: Section, brief: Brief, extracted: Extracted | null): Section {
  const s = structuredClone(section);
  // Photos are chosen later; never trust a URL from a model.
  const clearImages = (v: unknown): void => {
    if (Array.isArray(v)) v.forEach(clearImages);
    else if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      if (typeof o.src === 'string' && typeof o.alt === 'string') o.src = '';
      else Object.values(o).forEach(clearImages);
    }
  };
  clearImages(s.content);
  if (s.type === 'contact') {
    const c = s.content;
    // Contact details only ever come from the owner, never from the model.
    c.address = brief.client.address;
    c.whatsapp = brief.client.whatsapp;
    c.phone = brief.client.whatsapp;
    c.email = '';
    c.mapQuery = brief.client.address;
    c.hours = extracted?.hours ?? [];
  }
  if (s.type === 'testimonials') {
    // We never have real reviews at this point, so they must read as samples.
    delete s.content.rating;
    delete s.content.ratingCount;
    s.content.items = s.content.items.map((t) => ({ ...t, name: 'Customer name', detail: 'Sample review' }));
  }
  return s;
}

export function toSections(reply: { sections: { id: string; content: unknown }[] }, page: PlanPage, brief: Brief, extracted: Extracted | null): Section[] {
  return page.sections.map((planned) => {
    const got = reply.sections.find((s) => s.id === planned.id)!;
    const section = sectionSchema.parse({ id: planned.id, type: planned.type, variant: planned.variant, content: got.content });
    return applyKnownFacts(section, brief, extracted);
  });
}
