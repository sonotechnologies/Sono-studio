import { createHash } from 'node:crypto';
import { parse, serialize } from 'parse5';
import type { ExportFile, ImageLoader } from '@/export/generate';
import { applyEdits, type CopyEdit } from './edit';

/*
 * Turns an exact copy (plain HTML, CSS and JavaScript) into a Next.js project
 * in TypeScript with Tailwind, looking exactly the same:
 *
 * - each page becomes a route whose component is the page's own markup as
 *   JSX, its <head> as metadata, and its stylesheets in their original order;
 * - the site's CSS, scripts, fonts and images go in public/ unchanged;
 * - its scripts run in their original order once the page has loaded, as
 *   they did before, and links between pages are ordinary full page loads,
 *   so scripts written for a plain site keep working;
 * - Tailwind is set up without its reset and with a "tw:" prefix, so it
 *   can't restyle anything the site's own CSS styles; new work uses it.
 */

type Loc = { startOffset: number; endOffset: number };
type Node = {
  nodeName: string;
  tagName?: string;
  value?: string;
  data?: string;
  attrs?: { name: string; value: string; prefix?: string }[];
  childNodes?: Node[];
  content?: Node;
  namespaceURI?: string;
  sourceCodeLocation?: Loc | null;
};

export interface CopyProjectInput {
  /** The copy's files as saved (pages, styles, scripts, images). */
  files: Record<string, Uint8Array>;
  pages: { path: string; title: string; url: string }[];
  edits: CopyEdit[];
  name: string;
  version: number;
  sourceUrl: string;
  /** Downloads a picture an edit put in, so it ships with the site. */
  loadImage?: ImageLoader;
}

const KNOWN_TAGS = new Set(
  'a abbr address area article aside audio b base bdi bdo big blockquote body br button canvas caption center cite code col colgroup data datalist dd del details dfn dialog div dl dt em embed fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 head header hgroup hr html i iframe img input ins kbd keygen label legend li link main map mark menu menuitem meta meter nav noindex noscript object ol optgroup option output p param picture pre progress q rp rt ruby s samp search slot script section select small source span strong style sub summary sup table template tbody td textarea tfoot th thead time title tr track u ul var video wbr webview svg animate animateMotion animateTransform circle clipPath defs desc ellipse feBlend feColorMatrix feComponentTransfer feComposite feConvolveMatrix feDiffuseLighting feDisplacementMap feDistantLight feDropShadow feFlood feFuncA feFuncB feFuncG feFuncR feGaussianBlur feImage feMerge feMergeNode feMorphology feOffset fePointLight feSpecularLighting feSpotLight feTile feTurbulence filter foreignObject g image line linearGradient marker mask metadata mpath path pattern polygon polyline radialGradient rect set stop switch symbol text textPath tspan use view'.split(
    ' ',
  ),
);
const VOID = new Set('area base br col embed hr img input link meta param source track wbr keygen'.split(' '));
/** Elements where React (and the HTML parser) don't allow whitespace text between children. */
const NO_WHITESPACE = new Set('table thead tbody tfoot tr colgroup select optgroup datalist html head frameset'.split(' '));
const PRE = new Set(['pre', 'listing', 'plaintext']);
/** Elements that are blocks by default, where spaces at the start and end don't show. */
const BLOCK = new Set('address article aside blockquote body dd details dialog div dl dt fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 header hgroup li main nav ol p section summary td th ul'.split(' '));

/** HTML attribute names whose React prop name differs. */
const PROP: Record<string, string> = {
  class: 'className', for: 'htmlFor', 'accept-charset': 'acceptCharset', accesskey: 'accessKey', allowfullscreen: 'allowFullScreen', autocapitalize: 'autoCapitalize',
  autocomplete: 'autoComplete', autofocus: 'autoFocus', autoplay: 'autoPlay', cellpadding: 'cellPadding', cellspacing: 'cellSpacing', charset: 'charSet', colspan: 'colSpan',
  contenteditable: 'contentEditable', contextmenu: 'contextMenu', controlslist: 'controlsList', crossorigin: 'crossOrigin', datetime: 'dateTime', disablepictureinpicture: 'disablePictureInPicture',
  disableremoteplayback: 'disableRemotePlayback', enctype: 'encType', enterkeyhint: 'enterKeyHint', fetchpriority: 'fetchPriority', formaction: 'formAction', formenctype: 'formEncType',
  formmethod: 'formMethod', formnovalidate: 'formNoValidate', formtarget: 'formTarget', frameborder: 'frameBorder', hreflang: 'hrefLang', 'http-equiv': 'httpEquiv', imagesizes: 'imageSizes',
  imagesrcset: 'imageSrcSet', inputmode: 'inputMode', itemid: 'itemID', itemprop: 'itemProp', itemref: 'itemRef', itemscope: 'itemScope', itemtype: 'itemType', marginheight: 'marginHeight',
  marginwidth: 'marginWidth', maxlength: 'maxLength', mediagroup: 'mediaGroup', minlength: 'minLength', nomodule: 'noModule', novalidate: 'noValidate', playsinline: 'playsInline',
  readonly: 'readOnly', referrerpolicy: 'referrerPolicy', rowspan: 'rowSpan', spellcheck: 'spellCheck', srcdoc: 'srcDoc', srclang: 'srcLang', srcset: 'srcSet', tabindex: 'tabIndex',
  usemap: 'useMap', popovertarget: 'popoverTarget', popovertargetaction: 'popoverTargetAction',
  'xlink:href': 'xlinkHref', 'xlink:title': 'xlinkTitle', 'xlink:show': 'xlinkShow', 'xlink:actuate': 'xlinkActuate', 'xlink:arcrole': 'xlinkArcrole', 'xlink:role': 'xlinkRole',
  'xlink:type': 'xlinkType', 'xml:space': 'xmlSpace', 'xml:lang': 'xmlLang', 'xml:base': 'xmlBase', 'xmlns:xlink': 'xmlnsXlink',
};
const BOOLEAN = new Set(
  'allowFullScreen async autoFocus autoPlay checked defaultChecked controls default defer disabled disablePictureInPicture disableRemotePlayback formNoValidate hidden inert itemScope loop multiple muted noModule noValidate open playsInline readOnly required reversed selected'.split(' '),
);
const NUMBER = new Set('colSpan rowSpan tabIndex maxLength minLength size rows cols span start'.split(' '));
/** SVG presentation attributes React wants in camelCase. */
const SVG_CAMEL = new Set(
  'accent-height alignment-baseline arabic-form baseline-shift cap-height clip-path clip-rule color-interpolation color-interpolation-filters color-profile color-rendering dominant-baseline enable-background fill-opacity fill-rule flood-color flood-opacity font-family font-size font-size-adjust font-stretch font-style font-variant font-weight glyph-name glyph-orientation-horizontal glyph-orientation-vertical horiz-adv-x horiz-origin-x image-rendering letter-spacing lighting-color marker-end marker-mid marker-start overline-position overline-thickness paint-order panose-1 pointer-events rendering-intent shape-rendering stop-color stop-opacity strikethrough-position strikethrough-thickness stroke-dasharray stroke-dashoffset stroke-linecap stroke-linejoin stroke-miterlimit stroke-opacity stroke-width text-anchor text-decoration text-rendering underline-position underline-thickness unicode-bidi unicode-range units-per-em v-alphabetic v-hanging v-ideographic v-mathematical vector-effect vert-adv-y vert-origin-x vert-origin-y word-spacing writing-mode x-height'.split(
    ' ',
  ),
);
/** Props written as plain JSX attributes; everything else goes through attrs(), which React passes on as is. */
const PLAIN = new Set(['className', 'id', 'title', 'role', 'lang', 'dir']);
const PLAIN_ON: Record<string, string[]> = { a: ['href', 'target', 'rel'], img: ['src', 'alt'], link: ['rel', 'href'], meta: ['name', 'content'], source: ['src', 'srcSet', 'media'], iframe: ['src'], video: ['src', 'poster'], label: ['htmlFor'], form: ['action'], input: ['name', 'placeholder'], textarea: ['name', 'placeholder'] };
const URL_ATTRS = new Set(['href', 'src', 'srcset', 'poster', 'data-src', 'data-srcset', 'data-lazy-src', 'data-bg', 'data-background', 'imagesrcset', 'action', 'data']);

const camel = (s: string) => s.replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase());
const str = (s: string) => JSON.stringify(s);
const isPage = (p: string) => p.endsWith('.html');

/** "about.html" → "about", "index.html" → "", "blog/post.html" → "blog/post". */
export function routeOf(page: string): string {
  return page === 'index.html' ? '' : page.replace(/\.html$/, '');
}
/** App Router folders starting with "_" are private: "%5F" keeps them as routes. */
const folderOf = (route: string) => route.split('/').map((s) => s.replace(/^_/, '%5F')).join('/');

/** One <script> as the site had it, run in order after the page loads. */
export interface LegacyScript {
  src?: string;
  code?: string;
  attrs?: Record<string, string>;
}

interface PageOut {
  file: string;
  route: string;
  /** <html> and <body> attributes, which live in the root layout. */
  shell: { html: [string, string][]; body: [string, string][] };
  code: string;
}

class Converter {
  customTags = new Set<string>();
  scripts: LegacyScript[] = [];
  head: string[] = [];
  styleCount = 0;
  title = '';
  description = '';
  viewport: string | null = null;

  constructor(
    private page: string,
    private resolveUrl: (value: string) => string,
  ) {}

  /** A URL in the page, pointing at the new routes and public/ files. */
  url(name: string, value: string): string {
    if (!URL_ATTRS.has(name)) return value;
    if (/srcset$/i.test(name))
      return value
        .split(/,\s+(?=\S)/)
        .map((part) => {
          const [u, ...rest] = part.trim().split(/\s+/);
          return [this.resolveUrl(u), ...rest].join(' ');
        })
        .join(', ');
    return this.resolveUrl(value);
  }

  /** JSX attributes for an element. */
  props(n: Node): string {
    const tag = n.tagName!;
    const svg = n.namespaceURI === 'http://www.w3.org/2000/svg';
    const plain: string[] = [];
    const loose: [string, string | number | boolean][] = [];
    let style: string | null = null;
    const attrs = [...(n.attrs ?? [])];
    // A <select>'s chosen option becomes its defaultValue (React doesn't take "selected").
    if (tag === 'select') {
      const chosen = options(n).find((o) => o.attrs?.some((a) => a.name === 'selected'));
      if (chosen) attrs.push({ name: '__defaultValue', value: chosen.attrs?.find((a) => a.name === 'value')?.value ?? textOf(chosen) });
    }
    for (const a of attrs) {
      const raw = a.prefix ? `${a.prefix}:${a.name}` : a.name;
      if (tag === 'option' && raw === 'selected') continue;
      if (raw === '__defaultValue') {
        loose.push(['defaultValue', a.value]);
        continue;
      }
      const value = this.url(raw, a.value);
      // Inline handlers (onclick="…") are put back by the script runner, which React would otherwise refuse.
      if (/^on[a-z]+$/i.test(raw)) {
        plain.push(`data-legacy-${raw.toLowerCase()}=${str(value)}`);
        continue;
      }
      if (raw === 'style') {
        style = styleObject(value);
        continue;
      }
      if (raw.startsWith('data-')) {
        plain.push(`${raw}=${str(value)}`);
        continue;
      }
      let name = PROP[raw] ?? (svg && SVG_CAMEL.has(raw) ? camel(raw) : raw);
      if ((tag === 'input' || tag === 'textarea') && name === 'value') name = 'defaultValue';
      if (tag === 'input' && name === 'checked') name = 'defaultChecked';
      if (!/^[A-Za-z_][\w.:-]*$/.test(name)) continue;
      if (BOOLEAN.has(name)) loose.push([name, true]);
      else if (NUMBER.has(name) && /^-?\d+$/.test(value.trim())) loose.push([name, Number(value.trim())]);
      else if (PLAIN.has(name) || PLAIN_ON[tag]?.includes(name)) plain.push(`${name}=${str(value)}`);
      else loose.push([name, value]);
    }
    if (tag === 'textarea') {
      const text = (n.childNodes ?? []).map((c) => c.value ?? '').join('');
      if (text) loose.push(['defaultValue', text]);
    }
    const out = [...plain];
    if (style !== null) out.push(`style={css(${style})}`);
    if (loose.length) out.push(`{...attrs({ ${loose.map(([k, v]) => `${str(k)}: ${typeof v === 'string' ? str(v) : String(v)}`).join(', ')} })}`);
    return out.length ? ` ${out.join(' ')}` : '';
  }

  /** The page's <head>: title and description become metadata, the rest is rendered (React puts it in <head>). */
  readHead(head: Node) {
    for (const c of head.childNodes ?? []) {
      const tag = c.tagName;
      if (!tag) continue;
      const get = (k: string) => c.attrs?.find((a) => a.name === k)?.value;
      if (tag === 'title') this.title = textOf(c).trim();
      else if (tag === 'meta') {
        const name = get('name')?.toLowerCase();
        if (get('charset') || get('http-equiv')) continue;
        if (name === 'viewport') this.viewport = get('content') ?? null;
        else if (name === 'description') this.description = get('content') ?? '';
        else this.head.push(`<meta${this.props(c)} />`);
      } else if (tag === 'link' || tag === 'style' || tag === 'script' || tag === 'noscript' || tag === 'base') {
        const out = this.element(c, 0, false);
        if (out) this.head.push(out);
      }
    }
  }

  /** One element as JSX, or null when it's taken out of the markup (scripts). */
  element(n: Node, depth: number, inPre: boolean): string | null {
    const tag = n.tagName!;
    const pad = '  '.repeat(depth);
    const get = (k: string) => n.attrs?.find((a) => a.name === k)?.value;
    if (tag === 'base') return null;
    if (tag === 'script') {
      const type = (get('type') ?? '').toLowerCase();
      const js = !type || /(java|ecma)script|^module$/.test(type);
      if (js) {
        if (get('nomodule') !== undefined) return null;
        const attrs = Object.fromEntries((n.attrs ?? []).filter((a) => !['src', 'async', 'defer'].includes(a.name)).map((a) => [a.name, a.value]));
        const src = get('src');
        this.scripts.push({ ...(src ? { src: this.resolveUrl(src) } : { code: textOf(n) }), ...(Object.keys(attrs).length ? { attrs } : {}) });
        return null;
      }
      // Data (JSON-LD, templates) stays where it was.
      return `${pad}<script${this.props(n)} dangerouslySetInnerHTML={{ __html: ${str(textOf(n))} }} />`;
    }
    if (tag === 'link' && /stylesheet/i.test(get('rel') ?? '')) {
      // Loaded-later stylesheets (media="print" onload="this.media='all'") just load.
      const deferred = /media/.test(get('onload') ?? '');
      const href = this.resolveUrl(get('href') ?? '');
      const media = !deferred && get('media') && get('media') !== 'all' ? ` media=${str(get('media')!)}` : '';
      return `${pad}<link rel="stylesheet" href=${str(href)}${media} precedence="default" />`;
    }
    if (tag === 'style') {
      const media = get('media') ? ` media=${str(get('media')!)}` : '';
      return `${pad}<style href=${str(`${routeOf(this.page) || 'home'}-${++this.styleCount}`)}${media} precedence="default">{${str(textOf(n))}}</style>`;
    }
    if (tag === 'noscript') return `${pad}<noscript dangerouslySetInnerHTML={{ __html: ${str(textOf(n))} }} />`;
    if (tag === 'template') return `${pad}<template${this.props(n)} dangerouslySetInnerHTML={{ __html: ${str(n.content ? serialize(n.content as never) : '')} }} />`;
    if (!KNOWN_TAGS.has(tag)) this.customTags.add(tag);
    const open = `${pad}<${tag}${this.props(n)}`;
    // A frame's fallback text and a textarea's text (now its defaultValue) aren't children in React.
    if (VOID.has(tag) || tag === 'textarea' || tag === 'iframe') return `${open} />`;
    const pre = inPre || PRE.has(tag);
    const kids = this.children(n, depth + 1, pre);
    if (!kids.length) return `${open}></${tag}>`;
    // Short text-only content on one line.
    if (kids.length === 1 && !kids[0].includes('\n') && kids[0].trim().length < 80) return `${open}>${kids[0].trim()}</${tag}>`;
    return `${open}>\n${kids.join('\n')}\n${pad}</${tag}>`;
  }

  children(n: Node, depth: number, inPre: boolean): string[] {
    const pad = '  '.repeat(depth);
    const space = `${pad}{" "}`;
    const out: string[] = [];
    for (const c of n.childNodes ?? []) {
      if (c.nodeName === '#comment') continue;
      if (c.nodeName === '#text') {
        const v = c.value ?? '';
        if (!v) continue;
        if (!v.trim()) {
          // Spaces between elements show between inline ones: keep one (all of it inside <pre>).
          if (inPre) out.push(`${pad}{${str(v)}}`);
          // One space is enough, also where a script was taken out between two.
          else if (!NO_WHITESPACE.has(n.tagName ?? '') && out.at(-1) !== space) out.push(space);
          continue;
        }
        const simple = !inPre && /^[^\s{}<>&"'`\\]([^{}<>&\n\\]*[^\s{}<>&\\])?$/.test(v) && !/\s{2}/.test(v);
        out.push(`${pad}${simple ? v : `{${str(inPre ? v : v.replace(/\s+/g, ' '))}}`}`);
        continue;
      }
      if (!c.tagName) continue;
      const el = this.element(c, depth, inPre);
      if (el) out.push(el);
    }
    // Spaces at the start or end of a block don't show.
    if (!inPre && BLOCK.has(n.tagName ?? '')) {
      while (out[0] === space) out.shift();
      while (out.at(-1) === space) out.pop();
    }
    return out;
  }
}

function options(n: Node): Node[] {
  return (n.childNodes ?? []).flatMap((c) => (c.tagName === 'option' ? [c] : c.tagName === 'optgroup' ? options(c) : []));
}
function textOf(n: Node): string {
  return (n.childNodes ?? []).map((c) => (c.nodeName === '#text' ? (c.value ?? '') : textOf(c))).join('');
}

/** An inline style as an object literal; !important can't be set from React, and inline styles already win. */
export function styleObject(css: string): string {
  const entries: string[] = [];
  for (const decl of splitDecls(css)) {
    const i = decl.indexOf(':');
    if (i < 1) continue;
    const prop = decl.slice(0, i).trim();
    const value = decl.slice(i + 1).trim().replace(/\s*!important$/i, '');
    if (!prop || !value) continue;
    const key = prop.startsWith('--') ? prop : prop.toLowerCase().replace(/^-ms-/, 'ms-').replace(/^-(webkit|moz|o)-/, (_m, v: string) => `${v[0].toUpperCase()}${v.slice(1)}-`).replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase());
    entries.push(`${str(key)}: ${str(value)}`);
  }
  return `{ ${entries.join(', ')} }`;
}
function splitDecls(css: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote = '';
  let cur = '';
  for (const ch of css) {
    if (quote) {
      if (ch === quote) quote = '';
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === ';' && depth <= 0) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  return [...out, cur];
}

/** A viewport <meta> as Next's viewport export. Without one, phones show the page zoomed out, as before. */
function viewportExport(content: string | null): string {
  if (content === null) return `export const viewport: Viewport = { width: 980 };\n`;
  const map: Record<string, string> = { width: 'width', height: 'height', 'initial-scale': 'initialScale', 'minimum-scale': 'minimumScale', 'maximum-scale': 'maximumScale', 'user-scalable': 'userScalable', 'viewport-fit': 'viewportFit', 'interactive-widget': 'interactiveWidget' };
  const parts = content
    .split(/[,;]/)
    .map((p) => p.split('=').map((s) => s.trim()))
    .filter(([k, v]) => k && v && map[k.toLowerCase()]);
  const fields = parts.map(([k, v]) => {
    const key = map[k.toLowerCase()];
    if (key === 'userScalable') return `${key}: ${!/^(no|0)$/i.test(v)}`;
    if (/scale$/i.test(key) && /^[\d.]+$/.test(v)) return `${key}: ${Number(v)}`;
    if ((key === 'width' || key === 'height') && /^\d+$/.test(v)) return `${key}: ${Number(v)}`;
    return `${key}: ${str(v)}`;
  });
  return `export const viewport: Viewport = { ${fields.join(', ')} };\n`;
}

/** Converts one page. */
export function convertPage(file: string, html: string, resolveUrl: (pageFile: string, value: string) => string): PageOut & { customTags: Set<string> } {
  const doc = parse(html) as unknown as Node;
  const root = doc.childNodes?.find((c) => c.tagName === 'html');
  const head = root?.childNodes?.find((c) => c.tagName === 'head');
  const body = root?.childNodes?.find((c) => c.tagName === 'body');
  const conv = new Converter(file, (v) => resolveUrl(file, v));
  if (head) conv.readHead(head);
  const kids = body ? conv.children(body, 3, false) : [];
  const route = routeOf(file);
  const scripts = conv.scripts.length ? `\n      <LegacyScripts page=${str(route || 'home')} scripts={${JSON.stringify(conv.scripts)}} />` : '';
  const pair = (n: Node | undefined): [string, string][] => (n?.attrs ?? []).map((a) => [a.prefix ? `${a.prefix}:${a.name}` : a.name, a.value]);
  const imports = [
    `import type { Metadata, Viewport } from 'next';`,
    conv.scripts.length ? `import { LegacyScripts } from '@/components/legacy-scripts';` : '',
    `import { attrs, css } from '@/lib/legacy';`,
  ].filter(Boolean);
  const code = `${imports.join('\n')}

// ${file} from the original site.
export const metadata: Metadata = { title: ${str(conv.title)}${conv.description ? `, description: ${str(conv.description)}` : ''} };
${viewportExport(conv.viewport)}
export default function Page() {
  return (
    <>
${[...conv.head.map((h) => `      ${h.trimStart()}`), ...kids].join('\n')}${scripts}
    </>
  );
}
`;
  return { file, route, shell: { html: pair(root), body: pair(body) }, code, customTags: conv.customTags };
}

/** The <html> or <body> tag's attributes as JSX. */
function shellProps(attrs: [string, string][], tag: string): string {
  const c = new Converter('', (v) => v);
  return c.props({ nodeName: tag, tagName: tag, attrs: attrs.map(([name, value]) => ({ name, value })) });
}

const json = (v: unknown) => `${JSON.stringify(v, null, 2)}\n`;

/** The whole Next.js project for a copied site, with its edits in. */
export async function copyToNext(input: CopyProjectInput, versions: Record<string, string>): Promise<ExportFile[]> {
  const files: ExportFile[] = [];
  const add = (path: string, data: string | Uint8Array) => files.push({ path, data });
  const pageFiles = Object.keys(input.files).filter(isPage).sort((a, b) => (a === 'index.html' ? -1 : b === 'index.html' ? 1 : a.localeCompare(b)));
  const known = new Set(Object.keys(input.files));

  // Pictures put in by edits are downloaded into public/edits/.
  const edited = new Map<string, string>();
  for (const e of input.edits) {
    // Uploads are web addresses (or /api/uploads/… on a local studio).
    if (e.kind !== 'image' || !e.src || !/^(https?:|\/api\/uploads\/)/i.test(e.src) || edited.has(e.src) || !input.loadImage) continue;
    const img = await input.loadImage(e.src).catch(() => null);
    if (!img) continue;
    const type = img.contentType.split(';')[0].trim().toLowerCase();
    const ext = ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/svg+xml': 'svg', 'image/avif': 'avif', 'image/gif': 'gif' } as Record<string, string>)[type] ?? 'img';
    const path = `edits/${createHash('sha1').update(e.src).digest('hex').slice(0, 12)}.${ext}`;
    add(`public/${path}`, img.bytes);
    edited.set(e.src, `/${path}`);
  }

  const resolveUrl = (pageFile: string, value: string): string => {
    const v = value.trim();
    if (!v || /^([a-z][a-z0-9+.-]*:|\/\/|#)/i.test(v)) return edited.get(v) ?? value;
    let u: URL;
    try {
      u = new URL(v, `https://site.invalid/${pageFile}`);
    } catch {
      return value;
    }
    if (u.host !== 'site.invalid') return value;
    let path = u.pathname.replace(/^\/+/, '');
    try {
      path = decodeURIComponent(path);
    } catch {}
    if (isPage(path) && known.has(path)) return `/${routeOf(path)}${u.search}${u.hash}`;
    return `/${path}${u.search}${u.hash}`;
  };

  const pages = pageFiles.map((file) => {
    const html = applyEdits(file, new TextDecoder().decode(input.files[file]), input.edits, { mapSrc: (s) => edited.get(s) ?? s }).html;
    return convertPage(file, html, resolveUrl);
  });

  // Pages sharing the same <html> and <body> attributes share a root layout.
  const groups = new Map<string, typeof pages>();
  for (const p of pages) {
    const k = JSON.stringify(p.shell);
    groups.set(k, [...(groups.get(k) ?? []), p]);
  }
  const grouped = groups.size > 1;
  [...groups.values()].forEach((list, i) => {
    const dir = grouped ? `src/app/(layout-${i + 1})` : 'src/app';
    const shell = list[0].shell;
    add(
      `${dir}/layout.tsx`,
      `import '${grouped ? '../' : './'}globals.css';
import { attrs, css } from '@/lib/legacy';

// The <html> and <body> of ${list.length === 1 ? list[0].file : `${list.length} pages`}, as on the original site.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html${shellProps(shell.html, 'html')} suppressHydrationWarning>
      <body${shellProps(shell.body, 'body')} suppressHydrationWarning>{children}</body>
    </html>
  );
}
`.replace("import { attrs, css } from '@/lib/legacy';\n", (m) => (/attrs\(|css\(/.test(shellProps(shell.html, 'html') + shellProps(shell.body, 'body')) ? m : '')),
    );
    for (const p of list) add(`${dir}/${p.route ? `${folderOf(p.route)}/` : ''}page.tsx`, p.code);
  });

  // Everything that isn't a page is served as it was, from public/.
  for (const [path, data] of Object.entries(input.files)) if (!isPage(path)) add(`public/${path}`, data);

  const custom = [...new Set(pages.flatMap((p) => [...p.customTags]))].sort();
  add(
    'src/lib/legacy.ts',
    `import type { CSSProperties } from 'react';

/** Attributes from the original HTML that React passes on as they are. */
export const attrs = (a: Record<string, string | number | boolean>) => a as object;

/** An inline style from the original HTML. */
export const css = (s: Record<string, string>) => s as CSSProperties;
`,
  );
  if (custom.length)
    add(
      'src/legacy-elements.d.ts',
      `import 'react';

// Tags the original site uses that aren't in React's list (older HTML, custom elements).
declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
${custom.map((t) => `      ${str(t)}: DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & Record<string, unknown>;`).join('\n')}
    }
  }
}
`,
    );
  add('src/components/legacy-scripts.tsx', LEGACY_SCRIPTS);
  add(
    'src/app/globals.css',
    `/*
 * Tailwind, without its reset (preflight) so the site's own CSS looks exactly
 * as before, and with a "tw:" prefix so its classes can't clash with the
 * site's (it has its own .container, .hidden and so on). New work:
 * className="tw:flex tw:gap-4". The site's stylesheets load after this one.
 */
@layer theme, base, components, utilities;
@import 'tailwindcss/theme.css' layer(theme) prefix(tw);
@import 'tailwindcss/utilities.css' layer(utilities) prefix(tw);
`,
  );

  // Old addresses keep working: /about.html and the original paths go to the new routes.
  const redirects = new Map<string, string>();
  for (const p of pages) {
    const to = `/${p.route}`;
    if (p.file !== 'index.html') redirects.set(`/${p.file}`, to);
    else redirects.set('/index.html', '/');
  }
  for (const p of input.pages) {
    let from = '';
    try {
      from = new URL(p.url).pathname.replace(/\/+$/, '') || '/';
    } catch {}
    const to = `/${routeOf(p.path)}`;
    if (from && from !== to && from !== '/' && /^[\w./-]+$/.test(from) && !redirects.has(from)) redirects.set(from, to);
  }
  add('package.json', json({
    name: input.name,
    version: `1.0.${input.version}`,
    private: true,
    scripts: { dev: 'next dev', build: 'next build', start: 'next start' },
    dependencies: { next: versions.next, react: versions.react, 'react-dom': versions['react-dom'] },
    devDependencies: {
      '@tailwindcss/postcss': versions['@tailwindcss/postcss'],
      tailwindcss: versions.tailwindcss,
      typescript: versions.typescript,
      '@types/node': versions['@types/node'],
      '@types/react': versions['@types/react'],
      '@types/react-dom': versions['@types/react-dom'],
    },
  }));
  add('tsconfig.json', json({
    compilerOptions: {
      target: 'ES2022', lib: ['dom', 'dom.iterable', 'esnext'], allowJs: false, skipLibCheck: true, strict: true, noEmit: true, esModuleInterop: true, module: 'esnext',
      moduleResolution: 'bundler', resolveJsonModule: true, isolatedModules: true, jsx: 'react-jsx', incremental: true, plugins: [{ name: 'next' }], paths: { '@/*': ['./src/*'] },
    },
    include: ['next-env.d.ts', '**/*.ts', '**/*.tsx', '.next/types/**/*.ts', '.next/dev/types/**/*.ts'],
    exclude: ['node_modules'],
  }));
  add(
    'next.config.ts',
    `import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The original addresses (about.html, /about/) go to the new pages.
  async redirects() {
    return [
${[...redirects].map(([source, destination]) => `      { source: ${str(source)}, destination: ${str(destination)}, permanent: true },`).join('\n')}
    ];
  },
};

export default nextConfig;
`,
  );
  add('postcss.config.mjs', `export default { plugins: { '@tailwindcss/postcss': {} } };\n`);
  add('.gitignore', 'node_modules\n.next\n.env*.local\nnext-env.d.ts\n*.tsbuildinfo\n.vercel\n');
  return files;
}

/** Runs the original site's scripts, in order, after the page has loaded, as the browser did before. */
const LEGACY_SCRIPTS = `'use client';

import { useEffect } from 'react';

export interface LegacyScript {
  src?: string;
  code?: string;
  attrs?: Record<string, string>;
}

let ran: string | null = null;

/**
 * The original site's scripts, run one after another in their original order
 * once the page is on screen, then the page's "loaded" events again for code
 * that waits for them. Links between pages are full page loads, so each page
 * starts fresh, as it did on the old site.
 */
export function LegacyScripts({ page, scripts }: { page: string; scripts: LegacyScript[] }) {
  useEffect(() => {
    if (ran === page) return;
    ran = page;
    // Inline handlers (onclick="…") from the original HTML.
    for (const el of document.querySelectorAll('*')) {
      for (const a of [...el.attributes]) if (a.name.startsWith('data-legacy-on')) el.setAttribute(a.name.slice(12), a.value);
    }
    (async () => {
      for (const s of scripts) {
        const el = document.createElement('script');
        for (const [k, v] of Object.entries(s.attrs ?? {})) el.setAttribute(k, v);
        if (s.src) {
          el.async = false;
          el.src = s.src;
          await new Promise<void>((done) => {
            el.onload = el.onerror = () => done();
            document.body.appendChild(el);
          });
        } else {
          el.text = s.code ?? '';
          document.body.appendChild(el);
        }
      }
      document.dispatchEvent(new Event('DOMContentLoaded', { bubbles: true }));
      window.dispatchEvent(new Event('load'));
    })();
  }, [page, scripts]);
  return null;
}
`;
