import type { CustomDef, CustomField } from '../schema';
import { checkCustomCode } from './check';

/*
 * A worked example of an AI-written section: what the demo provider answers
 * with, and what tests and the sample site use.
 */

export const TIMELINE_CODE = `type Moment = { year: string; title: string; text: string };

export default function Section({ data }: { data: { eyebrow: string; heading: string; moments: Moment[] } }) {
  return (
    <section className="s-section">
      <div className="mx-auto w-full max-w-[1200px] px-5 @3xl:px-10">
        {data.eyebrow && <p className="mb-3 text-[0.8em] font-semibold tracking-[0.14em] text-site-primary uppercase">{data.eyebrow}</p>}
        <h2 className="s-heading s-h2 m-0">{data.heading}</h2>
        <ol className="m-0 mt-10 grid list-none gap-0 p-0">
          {data.moments.map((m, i) => (
            <li key={i} className="grid grid-cols-[5.5em_1fr] gap-6 border-t border-current/15 py-6">
              <span className="s-heading text-[1.6em] leading-none text-site-primary">{m.year}</span>
              <div>
                <h3 className="m-0 text-[1.1em] font-semibold">{m.title}</h3>
                {m.text && <p className="m-0 mt-1.5 max-w-[42em] text-site-muted">{m.text}</p>}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
`;

export const TIMELINE_FIELDS: CustomField[] = [
  { key: 'eyebrow', label: 'Small line above', type: 'text' },
  { key: 'heading', label: 'Heading', type: 'text' },
  {
    key: 'moments',
    label: 'Moments',
    type: 'list',
    max: 10,
    fields: [
      { key: 'year', label: 'Year', type: 'text' },
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'text', label: 'Text', type: 'paragraph' },
    ],
  },
];

export function timelineDef(purpose = 'The story of the business, year by year'): CustomDef {
  return { name: 'Timeline', purpose, fields: TIMELINE_FIELDS, code: TIMELINE_CODE, js: checkCustomCode(TIMELINE_CODE).js!, reviewed: false };
}
