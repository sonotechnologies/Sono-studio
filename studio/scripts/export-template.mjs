// Collects the site renderer's source files into one JSON module, so the
// exporter can write them into a standalone project from a serverless function
// (where the studio's source files aren't on disk). Runs before dev, build, lint and test.
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (p) => readFile(path.join(root, p), 'utf8');

function region(css, name) {
  const m = css.match(new RegExp(`/\\* export:${name}:start[^*]*\\*/([\\s\\S]*?)/\\* export:${name}:end \\*/`));
  if (!m) throw new Error(`globals.css has no export:${name} region`);
  return m[1].trim();
}

const files = {};
for (const f of ['src/site/primitives.tsx', 'src/site/render.tsx', 'src/site/theme.ts', 'src/site/schema.ts', 'src/lib/presets.json']) files[f] = await read(f);
for (const f of await readdir(path.join(root, 'src/site/sections'))) if (f.endsWith('.tsx')) files[`src/site/sections/${f}`] = await read(`src/site/sections/${f}`);
for (const f of await readdir(path.join(root, 'src/site/store'))) if (/\.tsx?$/.test(f) && !f.includes('.test.')) files[`src/site/store/${f}`] = await read(`src/site/store/${f}`);
const presets = await read('src/lib/presets.ts');
const cut = presets.indexOf('// export:end');
if (cut < 0) throw new Error('presets.ts has no export:end marker');
files['src/lib/presets.ts'] = presets.slice(0, cut).trimEnd() + '\n';

const css = await read('src/app/globals.css');
// Exact versions the studio itself runs and tests with.
const versions = {};
for (const d of ['next', 'react', 'react-dom', 'lucide-react', 'zod', 'tailwindcss', '@tailwindcss/postcss', 'typescript', '@types/node', '@types/react', '@types/react-dom']) {
  versions[d] = JSON.parse(await read(`node_modules/${d}/package.json`)).version;
}

const out = { files, css: { fonts: region(css, 'fonts'), tokens: region(css, 'tokens'), site: region(css, 'site') }, versions };
await mkdir(path.join(root, 'src/export'), { recursive: true });
await writeFile(path.join(root, 'src/export/template.generated.json'), JSON.stringify(out, null, 1) + '\n');

// Tailwind's browser runtime, served to the sandboxed frame that previews AI-written sections.
await mkdir(path.join(root, 'public/vendor'), { recursive: true });
await writeFile(path.join(root, 'public/vendor/tailwind-browser.js'), await read('node_modules/@tailwindcss/browser/dist/index.global.js'));
