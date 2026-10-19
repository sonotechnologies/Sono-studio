import { transform } from 'sucrase';

/*
 * The check an AI-written section must pass before it's accepted: one
 * component, plain JSX and Tailwind classes, its content from `data`, and
 * nothing that reaches outside (no imports, scripts, network, storage or
 * raw HTML). It's compiled first and the compiled code is scanned with every
 * string and piece of text removed, so words in the copy ("our history") can't
 * trip it. Vercel's build is the last check when the site is exported.
 */

const FORBIDDEN: [RegExp, string][] = [
  [/\bimport\b|\brequire\b|\bexport\b/, 'imports'],
  [/\b(window|document|globalThis|self|parent|top|frames|opener|localStorage|sessionStorage|indexedDB|navigator|location|history|cookie)\b/, 'browser globals'],
  [/\b(fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|Worker|postMessage|importScripts)\b/, 'network access'],
  [/\b(eval|Function|setTimeout|setInterval|requestAnimationFrame|queueMicrotask)\b/, 'running code later'],
  [/\b(process|Buffer|__dirname|__filename|module|exports)\b/, 'server globals'],
  [/\b(constructor|prototype|__proto__|Reflect|Proxy|Symbol|this|arguments)\b/, 'object internals'],
  [/dangerouslySetInnerHTML|innerHTML|outerHTML/, 'raw HTML'],
  [/\bon[A-Z][a-zA-Z]*\s*:/, 'event handlers'],
  [/\buse[A-Z][a-zA-Z]*\s*\(/, 'React hooks (state or effects)'],
  [/\bclass\b/, 'classes'],
  [/\b(async|await|yield)\b/, 'async code'],
  [/\[\s*\]\s*\[|\)\s*\[\s*["`]/, 'computed property tricks'],
];

const TAGS = /\bh\(\s*["'`](script|iframe|object|embed|form|style|link|meta|base|frame|frameset|svg:script)["'`]/i;

export interface CheckResult {
  /** Compiled for the preview frame, when the code passed: a function body that returns the component. */
  js?: string;
  problems: string[];
}

/**
 * The code with comments, strings and template text removed (template
 * expressions are kept, since they're code). Regex literals aren't allowed.
 */
export function codeOnly(src: string): string {
  let out = '';
  let i = 0;
  const depth: number[] = []; // brace depth inside each open template expression
  const scanTemplate = () => {
    // At a backtick or after a "}" closing an expression: skip text up to the end or the next "${".
    while (i < src.length) {
      const c = src[i];
      if (c === '\\') i += 2;
      else if (c === '`') {
        i++;
        return;
      } else if (c === '$' && src[i + 1] === '{') {
        i += 2;
        out += ' ';
        depth.push(0);
        return;
      } else i++;
    }
  };
  while (i < src.length) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') i++;
    } else if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      i = end < 0 ? src.length : end + 2;
    } else if (c === '"' || c === "'") {
      i++;
      while (i < src.length && src[i] !== c && src[i] !== '\n') i += src[i] === '\\' ? 2 : 1;
      i++;
      out += '""';
    } else if (c === '`') {
      i++;
      out += '""';
      scanTemplate();
    } else if (depth.length && c === '{') {
      depth[depth.length - 1]++;
      out += c;
      i++;
    } else if (depth.length && c === '}') {
      if (depth[depth.length - 1] === 0) {
        depth.pop();
        i++;
        scanTemplate();
      } else {
        depth[depth.length - 1]--;
        out += c;
        i++;
      }
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

export function checkCustomCode(code: string): CheckResult {
  if (code.length > 20_000) return { problems: ['The component is too long (keep it under 20,000 characters).'] };
  const head = /^\s*export\s+default\s+function\s+([A-Z]\w*)\s*\(/m.exec(code);
  if (!head) return { problems: ['Export one component as `export default function Section({ data })`.'] };
  // The preview runs the code as a function body that returns the component.
  const body = `${code.replace(head[0], head[0].replace(/^\s*export\s+default\s+/, ''))}\nreturn ${head[1]};`;
  let js: string;
  try {
    js = transform(body, { transforms: ['typescript', 'jsx'], jsxRuntime: 'classic', jsxPragma: 'h', jsxFragmentPragma: 'Fragment', production: true, disableESTransforms: true }).code;
  } catch (err) {
    return { problems: [`It doesn’t compile: ${(err as Error).message.split('\n')[0].slice(0, 200)}`] };
  }
  const problems: string[] = [];
  // The compiler drops unused imports, but the exported file would keep them.
  if (/(^|[;{}\n])\s*import[\s{*"']|\brequire\s*\(/.test(codeOnly(code))) problems.push('Not allowed: imports.');
  if (TAGS.test(js)) problems.push('Not allowed: script, iframe, form or style tags.');
  const scan = codeOnly(js);
  // A "/" that could start a regex literal (after an operator or bracket) isn't allowed: the scan can't see inside one.
  if (/[=(,:!&|?{};]\s*\/[^/*]/.test(scan)) problems.push('Not allowed: regular expressions.');
  for (const [re, what] of FORBIDDEN) if (re.test(scan)) problems.push(`Not allowed: ${what}.`);
  // obj[k] with a key built at run time can reach anything ("constr" + "uctor"): only obj[0]-style access.
  if (computedAccess(scan)) problems.push('Not allowed: reading properties by a computed name (use data.field, or .map over lists).');
  // A loop that never ends would freeze the page or the site's build: lists are rendered with .map.
  if (/\b(while|do)\b|\bfor\s*\(/.test(scan)) problems.push('Not allowed: loops (use .map over a list).');
  // Every element is a literal tag, Fragment or a component defined in the file, never a tag held in a variable.
  const own = new Set([...code.matchAll(/\bfunction\s+([A-Z]\w*)|\bconst\s+([A-Z]\w*)\s*=\s*(?:\([^)]*\)|[\w$]+)\s*=>/g)].map((m) => m[1] ?? m[2]));
  for (const m of js.matchAll(/\bh\(\s*([A-Za-z_$][\w$.]*)/g)) {
    if (m[1] !== 'Fragment' && !own.has(m[1])) {
      problems.push('Not allowed: elements whose tag comes from a variable.');
      break;
    }
  }
  return problems.length ? { problems: [...new Set(problems)] } : { js, problems: [] };
}

/** Words after which "[" starts an array, not a property read. */
const BEFORE_ARRAY = new Set(['const', 'let', 'var', 'return', 'in', 'of', 'typeof', 'case', 'else', 'void', 'delete', 'new', 'yield', 'await']);

/** Whether the code reads a property by anything other than a number: obj[k], obj["x"], f()[k]. */
function computedAccess(scan: string): boolean {
  for (const m of scan.matchAll(/([\w$)\]])\s*\[/g)) {
    const before = scan.slice(0, m.index! + 1);
    const word = /([A-Za-z_$][\w$]*)$/.exec(before)?.[1];
    if (word && BEFORE_ARRAY.has(word)) continue;
    const inside = scan.slice(m.index! + m[0].length);
    if (/^\s*\d+\s*\]/.test(inside)) continue;
    return true;
  }
  return false;
}
