/*
 * A tiny JSX runtime that turns an AI-written section into HTML. It runs
 * inside the sandboxed preview frame (it's sent there as source, so it must
 * stay self-contained: no imports, nothing from outside the function).
 * On export the same component runs as a normal React server component.
 */

export interface CustomRuntime {
  h: (type: unknown, props: Record<string, unknown> | null, ...children: unknown[]) => unknown;
  Fragment: unknown;
  /** Renders a component with its data to an HTML string. */
  render: (component: unknown, data: unknown) => string;
}

export function createRuntime(): CustomRuntime {
  class Html {
    constructor(public html: string) {}
  }
  const Fragment = Symbol('Fragment');
  const VOID = new Set(['area', 'br', 'col', 'hr', 'img', 'input', 'source', 'track', 'wbr']);
  const UNITLESS = new Set(['opacity', 'zIndex', 'fontWeight', 'lineHeight', 'flex', 'flexGrow', 'flexShrink', 'order', 'zoom', 'gridRow', 'gridColumn']);
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const safeUrl = (v: string) => (/^\s*(javascript|vbscript|data:text)/i.test(v) ? '#' : v);
  const flat = (c: unknown): string => {
    if (c === null || c === undefined || c === false || c === true) return '';
    if (Array.isArray(c)) return c.map(flat).join('');
    if (c instanceof Html) return c.html;
    return esc(String(c));
  };
  const style = (v: unknown) =>
    v && typeof v === 'object'
      ? Object.entries(v as Record<string, unknown>)
          .filter(([, x]) => x !== null && x !== undefined && x !== '')
          .map(([k, x]) => `${k.startsWith('--') ? k : k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}:${typeof x === 'number' && !UNITLESS.has(k) ? `${x}px` : String(x)}`)
          .join(';')
      : String(v ?? '');
  const h = (type: unknown, props: Record<string, unknown> | null, ...children: unknown[]): unknown => {
    const p = props ?? {};
    const kids = children.length ? children : (p.children as unknown);
    if (type === Fragment) return new Html(flat(kids));
    if (typeof type === 'function') return (type as (p: unknown) => unknown)({ ...p, children: kids });
    if (typeof type !== 'string' || !/^[a-z][a-z0-9-]*$/.test(type)) return new Html('');
    let attrs = '';
    for (const [k, v] of Object.entries(p)) {
      if (k === 'children' || k === 'key' || k === 'ref' || /^on[A-Z]/.test(k) || k === 'dangerouslySetInnerHTML') continue;
      if (v === null || v === undefined || v === false) continue;
      const name = k === 'className' ? 'class' : k === 'htmlFor' ? 'for' : k.replace(/[A-Z]/g, (m) => (k.startsWith('aria') || k.startsWith('data') ? `-${m.toLowerCase()}` : m.toLowerCase()));
      if (!/^[a-z][a-z0-9-:]*$/.test(name)) continue;
      const value = k === 'style' ? style(v) : name === 'href' || name === 'src' ? safeUrl(String(v)) : String(v);
      attrs += v === true ? ` ${name}` : ` ${name}="${esc(value)}"`;
    }
    return new Html(VOID.has(type) ? `<${type}${attrs}>` : `<${type}${attrs}>${flat(kids)}</${type}>`);
  };
  const render = (component: unknown, data: unknown) => flat(h(component, { data }));
  return { h, Fragment, render };
}
