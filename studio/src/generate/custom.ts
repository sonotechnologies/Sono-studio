import { z } from 'zod';
import { checkCustomCode } from '@/site/custom/check';
import { customDataSchema, customFieldSchema, type CustomDef } from '@/site/schema';

/*
 * Writing a custom section: one request to the strongest model for a single
 * component, its editable fields and their content. The reply's code is
 * checked as part of the schema, so problems go back to the model for its one
 * repair attempt, like any other invalid reply.
 */

export interface CustomRequest {
  businessName: string;
  businessType: string;
  /** What the section should do, in a sentence or two. */
  purpose: string;
  pageTitle: string;
  /** Known facts about the business, to write the content from. */
  facts?: string;
  /** When changing an existing section: it, its content, and what to change. */
  existing?: { def: CustomDef; data: Record<string, unknown>; change: string };
}

const SAMPLE = `export default function Section({ data }: { data: { heading: string; steps: { title: string; text: string }[] } }) {
  return (
    <section className="s-section">
      <div className="mx-auto w-full max-w-[1200px] px-5 @3xl:px-10">
        <h2 className="s-heading s-h2 m-0">{data.heading}</h2>
        <ol className="m-0 mt-8 grid list-none gap-6 p-0 @3xl:grid-cols-3">
          {data.steps.map((s, i) => (
            <li key={i} className="s-outline rounded-site-card bg-site-surface p-6">
              <span className="text-site-primary font-semibold">{i + 1}</span>
              <h3 className="m-0 mt-2 font-semibold">{s.title}</h3>
              <p className="m-0 mt-1 text-site-muted">{s.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}`;

export function customPrompt(req: CustomRequest) {
  const ex = req.existing;
  return {
    system: [
      'You write one section of a small-business website as a React component with Tailwind CSS. You reply with a single JSON object and nothing else.',
      'The component is a pure function: no hooks, no state, no event handlers, no imports, no browser globals, no fetch, no timers, no dangerouslySetInnerHTML, no script, style, iframe or form tags, no regular expressions, no classes, no loops (use .map), no obj[key] reads (use data.field or .map; only number indexes like list[0]), and every tag is written literally (no <Tag> from a variable).',
      'All words and photos come from `data`, so the owner can edit them; never hard-code copy in the JSX.',
      'Never invent facts about the business: no made-up prices, years, numbers, names, awards or reviews. Use only the facts given, or general wording that is true of any good business of this kind.',
    ].join(' '),
    prompt: `${ex ? 'Change this existing section' : 'Write a section'} for ${req.businessName} (${req.businessType}), on its "${req.pageTitle}" page.

What the section is for: ${req.purpose}
${req.facts ? `\nWhat is known about the business:\n${req.facts}\n` : ''}${
      ex
        ? `
The change asked for: ${ex.change}

Current fields: ${JSON.stringify(ex.def.fields)}
Current content: ${JSON.stringify(ex.data).slice(0, 4000)}
Current code:
${ex.def.code}
`
        : ''
    }
Rules for the code:
- Exactly one component: \`export default function Section({ data }: { data: ... })\`. Helper functions in the same file are fine.
- Wrap it in <section className="s-section"> and put the content in <div className="mx-auto w-full max-w-[1200px] px-5 @3xl:px-10">, like the site's other sections.
- Use the site's theme classes so it matches: colours text-site-text, text-site-muted, text-site-primary, bg-site-surface, bg-site-primary with text-site-on-primary, bg-site-accent; headings className="s-heading s-h2" (or s-h3); cards "s-outline rounded-site-card bg-site-surface"; buttons "rounded-site-button bg-site-primary text-site-on-primary px-5 py-3 font-semibold".
- Make it responsive with container queries: @3xl: for wider layouts (not md: or lg:).
- Images: <img src={data.photo.src} alt={data.photo.alt} />, and show nothing or a plain block when src is empty.
- Links: <a href={data.button.href}>{data.button.label}</a>.

Rules for the fields (what the owner can edit):
- Up to 16 fields. Each is {"key": camelCase, "label": "Short label", "type": "text" | "paragraph" | "image" | "link" | "list"}.
- text is one line (under 200 characters), paragraph is longer text, image is {"src": "", "alt": "..."}, link is {"label": "...", "href": "/contact"}.
- A list has "fields" (only text, paragraph, image or link) and "max" items; its content is an array of objects.
- Every key the code reads from data must be a field, and the content must match the fields exactly.
- Leave every image src empty and describe the ideal photo in alt.

Example of the code style:
${SAMPLE}

Reply with JSON in exactly this shape:
{"name": "Short name", "fields": [...], "data": {...}, "code": "export default function Section({ data }) { ... }"}`,
  };
}

/** The model's reply, accepted only when the fields, content and code all check out. */
export const customReplySchema = z
  .object({
    name: z.string().transform((v) => v.trim().slice(0, 60) || 'Custom section'),
    fields: z.array(customFieldSchema).min(1).max(16),
    data: z.record(z.string(), z.unknown()),
    code: z.string().max(20_000),
  })
  .superRefine((r, ctx) => {
    const keys = new Set(r.fields.map((f) => f.key));
    if (keys.size !== r.fields.length) ctx.addIssue({ code: 'custom', message: 'Field keys must be unique', path: ['fields'] });
    for (const f of r.fields) if (f.type === 'list' && !f.fields?.length) ctx.addIssue({ code: 'custom', message: `List "${f.key}" needs its item fields`, path: ['fields'] });
    const data = customDataSchema(r.fields).safeParse(r.data);
    if (!data.success) for (const i of data.error.issues.slice(0, 4)) ctx.addIssue({ code: 'custom', message: `Content doesn't match the fields: ${i.message}`, path: ['data', ...i.path.map(String)] });
    const check = checkCustomCode(r.code);
    for (const p of check.problems) ctx.addIssue({ code: 'custom', message: p, path: ['code'] });
  });

export type CustomReply = z.infer<typeof customReplySchema>;

/** A checked reply as a custom section definition and its content. Images never keep a URL from a model. */
export function toCustom(reply: CustomReply, purpose: string): { def: CustomDef; data: Record<string, unknown> } {
  const clear = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(clear);
    if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      if (typeof o.src === 'string' && typeof o.alt === 'string') return { ...o, src: '' };
      return Object.fromEntries(Object.entries(o).map(([k, x]) => [k, clear(x)]));
    }
    return v;
  };
  const data = customDataSchema(reply.fields).parse(clear(reply.data)) as Record<string, unknown>;
  return {
    def: { name: reply.name, purpose: purpose.slice(0, 300), fields: reply.fields, code: reply.code, js: checkCustomCode(reply.code).js!, reviewed: false },
    data,
  };
}
