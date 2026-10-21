import 'server-only';
import { createHmac } from 'node:crypto';
import { decryptSecret, openSecret, serverSecret } from '@/lib/crypto';
import { siteUrl } from '@/lib/format';
import type { Deployment, Repo } from '@/lib/data/repo';
import { exportSite, packageName, type ExportResult, type ImageLoader } from '@/export/generate';
import template from '@/export/template.generated.json';
import { siteConfigSchema, type PaymentProvider } from '@/site/schema';
import { cardProviders, depositProviders } from '@/site/store/payments-info';
import { sha256 } from '@/site/store/payments';
import { unzipSync } from 'fflate';
import { copyChecklist } from '@/mirror/checklist';
import { applyEdits } from '@/mirror/edit';
import { copyToNext } from '@/mirror/to-next';
import { DeployError, pushToGitHub } from './github';
import { deployToVercel, deploymentState, projectUrl } from './vercel';

/*
 * One deploy: export the current version, commit it to GitHub (when a token
 * is set), upload it to Vercel. The build then runs on Vercel; refreshDeploy()
 * checks on it and, once it's ready, records the live address.
 */

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
/** Starts the note kept on a deploy that went live without its GitHub copy. */
export const GITHUB_NOTE = 'Live, but the code wasn’t saved to GitHub';
/** Starts the note on a shop that went live without a key for one of its card payments. */
export const PAYMENTS_NOTE = 'Card payments';
const isNote = (e: string | null | undefined) => !!e && (e.startsWith(GITHUB_NOTE) || e.startsWith(PAYMENTS_NOTE));

/** The business's own payment keys, typed into the Deploy dialog. Sent to the hosting, never stored here. */
export interface PaymentKeys {
  paystack?: string;
  stripe?: string;
  stripeWebhook?: string;
}

const KEY_FORMAT: Record<keyof PaymentKeys, { env: string; re: RegExp; name: string }> = {
  paystack: { env: 'PAYSTACK_SECRET_KEY', re: /^sk_(live|test)_[A-Za-z0-9]{10,}$/, name: 'Paystack secret key (sk_live_…)' },
  stripe: { env: 'STRIPE_SECRET_KEY', re: /^(sk|rk)_(live|test)_[A-Za-z0-9]{10,}$/, name: 'Stripe secret key (sk_live_…)' },
  stripeWebhook: { env: 'STRIPE_WEBHOOK_SECRET', re: /^whsec_[A-Za-z0-9]{10,}$/, name: 'Stripe signing secret (whsec_…)' },
};

/** Checks the keys' format and turns them into environment variables. */
export function paymentEnv(keys: PaymentKeys | undefined): Record<string, string> {
  const env: Record<string, string> = {};
  for (const k of Object.keys(KEY_FORMAT) as (keyof PaymentKeys)[]) {
    const v = keys?.[k]?.trim();
    if (!v) continue;
    if (!KEY_FORMAT[k].re.test(v)) throw new DeployError(`That doesn’t look like a ${KEY_FORMAT[k].name}. Copy it again from the client’s dashboard.`);
    env[KEY_FORMAT[k].env] = v;
  }
  return env;
}

/** Loads a site photo: relative paths (dev uploads) from this server, others over https. */
export function imageLoader(origin: string): ImageLoader {
  return async (src) => {
    const url = new URL(src, origin);
    if (url.protocol !== 'https:' && url.origin !== new URL(origin).origin) return null;
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return null;
    const type = res.headers.get('content-type') ?? '';
    if (!type.startsWith('image/')) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    return bytes.byteLength <= MAX_IMAGE_BYTES ? { bytes, contentType: type } : null;
  };
}

export async function tokens(repo: Repo): Promise<{ github: string | null; vercel: string | null }> {
  const rows = await repo.listProviderKeys();
  const get = (p: string) => {
    const row = rows.find((r) => r.provider === p);
    if (!row) return null;
    const key = openSecret(row.ciphertext);
    if (!key) throw new DeployError(`Your saved ${p === 'github' ? 'GitHub' : 'Vercel'} token can’t be read any more. Enter it again in Settings → Connections.`);
    return key;
  };
  return { github: get('github'), vercel: get('vercel') };
}

export interface ProjectExport extends ExportResult {
  name: string;
  version: number;
  /** "nextjs" for generated sites and converted copies; null for a copy exported as plain files. */
  framework: 'nextjs' | null;
  /** An exact copy of the client's own site, rather than a site built here. */
  copy: boolean;
  /** Card payments the shop takes, which need keys on the hosting. */
  payments: PaymentProvider[];
}

export async function exportProject(repo: Repo, projectId: string, origin: string, opts: { plain?: boolean } = {}): Promise<ProjectExport> {
  const project = await repo.getProject(projectId);
  if (!project) throw new DeployError('This project no longer exists.');
  const version = await repo.getSiteVersion(projectId);
  if (!version) {
    // A project made by copying a client's site as it is.
    const copy = await repo.getSiteCopy(projectId);
    if (!copy) throw new DeployError('This project has no site yet.');
    const { meta } = copy;
    const edits = meta.edits ?? [];
    const checklist = copyChecklist(meta);
    const unzipped = unzipSync(copy.zip);
    const when = meta.copiedAt.slice(0, 10);
    const todo = `## Before it replaces the original\n\n${checklist.map((c) => `- [ ] **${c.title}.** ${c.detail}`).join('\n')}\n`;
    const name = packageName(project.name);
    if (opts.plain) {
      // The copy as plain HTML files, with the editor's changes in.
      const files = Object.entries(unzipped).map(([path, data]) => ({
        path,
        data: path.endsWith('.html') && edits.length ? applyEdits(path, new TextDecoder().decode(data), edits).html : data,
      }));
      files.push({ path: 'vercel.json', data: `${JSON.stringify({ cleanUrls: true, trailingSlash: false }, null, 2)}\n` });
      files.push({
        path: 'HANDOVER.md',
        data: `# ${project.name}\n\nAn exact copy of ${meta.sourceUrl}, made ${when}: ${meta.pages.length} pages, ${meta.files} files. Static files: open index.html, or deploy the folder to any static host.\n\n${todo}`,
      });
      return { files, checklist, name, version: 1, framework: null, copy: true, payments: [] };
    }
    const files = await copyToNext(
      { files: unzipped, pages: meta.pages, edits, name, version: 1, sourceUrl: meta.sourceUrl, loadImage: imageLoader(origin) },
      (template as { versions: Record<string, string> }).versions,
    );
    files.push({
      path: 'README.md',
      data: `# ${project.name}

The site from ${meta.sourceUrl} (copied ${when}), as a Next.js project in TypeScript with Tailwind CSS. It looks and behaves exactly like the original.

\`\`\`bash
npm install
npm run dev
\`\`\`

## How it's put together

- **Pages**: each page of the original site is a route in \`src/app/\` (\`about.html\` → \`src/app/about/page.tsx\`), its markup written as JSX. Edit the words and pictures there.
- **Styles**: the original CSS files are in \`public/\` and still style the pages, exactly as before.
- **Tailwind**: set up without its reset and with a \`tw:\` prefix so it can't clash with the original CSS. Use it for new work: \`className="tw:flex tw:gap-4"\`. The original CSS wins where both style the same thing; add \`!\` to win instead (\`tw:mt-4!\`).
- **Scripts**: the original JavaScript files are in \`public/\` and run in their original order once a page loads (\`src/components/legacy-scripts.tsx\`). Inline handlers like \`onclick\` are kept as \`data-legacy-onclick\`.
- **Old addresses**: \`about.html\` and the original paths redirect to the new pages (\`next.config.ts\`).
- **Head**: each page's title and description are its \`metadata\`; its other tags are rendered at the top of the page and placed in \`<head>\` by React.

${todo}`,
    });
    return { files, checklist, name, version: 1, framework: 'nextjs', copy: true, payments: [] };
  }
  const config = siteConfigSchema.parse(version.config);
  const result = await exportSite({ config, projectName: project.name, version: version.version, loadImage: imageLoader(origin) });
  return { ...result, name: packageName(project.name), version: version.version, framework: 'nextjs', copy: false, payments: [...new Set([...cardProviders(config.store), ...depositProviders(config.bookings)])] };
}

export async function startDeploy(repo: Repo, projectId: string, origin: string, opts: { paymentKeys?: PaymentKeys } = {}): Promise<Deployment> {
  const { github, vercel } = await tokens(repo);
  if (!vercel) throw new DeployError('Add a Vercel token in Settings → Connections first.');
  const project = (await repo.getProject(projectId))!;
  const previous = await repo.getLatestDeployment(projectId);
  // One deploy at a time: a second (another tab, a double click) would make a second repo and Vercel project.
  if (previous?.status === 'building' && Date.now() - new Date(previous.createdAt).getTime() < 10 * 60_000) {
    throw new DeployError('A deploy is already running for this site. Wait for it to finish.');
  }
  // The address live sites call back: the studio's own domain, not a preview or localhost address it was deployed from.
  const studio = /\/\/localhost[:/]|\/\/localhost$/.test(siteUrl()) ? origin : siteUrl();
  const site = await exportProject(repo, projectId, origin);
  // A shop taking cards needs the business's keys, and reports paid orders back here with a fresh key.
  // Generated sites read their published content from the studio, so client edits go live without a rebuild.
  let env: Record<string, string> | undefined = site.copy ? undefined : { SONO_SITE_API: `${studio}/api/sites/${projectId}` };
  if (site.payments.length) {
    // The same key every deploy (worked out from the studio's secret), so the site that's live while a
    // new one builds, or after a failed deploy, can still report orders and bookings.
    const ordersKey = createHmac('sha256', serverSecret('orders-key')).update(projectId).digest('hex');
    await repo.setOrdersKeyHash(projectId, sha256(ordersKey));
    env = {
      ...env,
      ...paymentEnv(opts.paymentKeys),
      SONO_ORDERS_URL: `${studio}/api/sites/${projectId}/orders`,
      SONO_ORDERS_KEY: ordersKey,
      // The studio keeps the booking calendar for sites taking deposits.
      SONO_SITE_API: `${studio}/api/sites/${projectId}`,
    };
  }

  const d = await repo.createDeployment(projectId, {
    version: site.version,
    status: 'building',
    repoFullName: previous?.repoFullName ?? null,
    repoUrl: previous?.repoUrl ?? null,
    vercelProject: previous?.vercelProject ?? null,
    vercelDeploymentId: null,
    url: previous?.url ?? null,
    error: null,
  });
  try {
    // GitHub keeps a copy of the code; the site goes live on Vercel even when that step fails.
    let note: string | null = null;
    if (github) {
      try {
        const pushed = await pushToGitHub({
          token: github,
          existing: previous?.repoFullName ?? null,
          name: `${site.name}-site`,
          description: `Website for ${project.name}`,
          files: site.files,
          message: `Site version ${site.version}`,
          onRepo: async (r) => {
            await repo.updateDeployment(d.id, { repoFullName: r.fullName, repoUrl: r.url });
            Object.assign(d, { repoFullName: r.fullName, repoUrl: r.url });
          },
        });
        await repo.updateDeployment(d.id, { repoFullName: pushed.fullName, repoUrl: pushed.url });
        await repo.setProjectLinks(projectId, { repoUrl: pushed.url });
        Object.assign(d, { repoFullName: pushed.fullName, repoUrl: pushed.url });
      } catch (err) {
        if (!(err instanceof DeployError)) console.error('GitHub push failed', err);
        const why = err instanceof DeployError ? err.message : (err as Error).message;
        note = `${GITHUB_NOTE}: ${why} It will be saved on the next deploy.`;
      }
    }
    const vd = await deployToVercel({ token: vercel, existing: previous?.vercelProject ?? null, name: site.name, files: site.files, framework: site.framework, env });
    // Card payments without a key stay hidden on the live site: say which.
    const missing = site.payments.filter((p) => !vd.env?.includes(p === 'paystack' ? 'PAYSTACK_SECRET_KEY' : 'STRIPE_SECRET_KEY'));
    if (missing.length) {
      const names = missing.map((p) => (p === 'paystack' ? 'Paystack' : 'Stripe')).join(' and ');
      const extra = `${PAYMENTS_NOTE} are hidden on the live site until the client’s ${names} secret key is added: deploy again with it, or add it in Vercel and redeploy.`;
      note = note ? `${note} ${extra}` : extra;
    }
    await repo.updateDeployment(d.id, { vercelProject: vd.project, vercelDeploymentId: vd.id, error: note });
    return { ...d, vercelProject: vd.project, vercelDeploymentId: vd.id, error: note };
  } catch (err) {
    const error = err instanceof DeployError ? err.message : `Deploy failed: ${(err as Error).message}`;
    await repo.updateDeployment(d.id, { status: 'error', error: error.slice(0, 1000) });
    return { ...d, status: 'error', error };
  }
}

/** Checks a building deployment on Vercel and records the result. */
export async function refreshDeploy(repo: Repo, projectId: string): Promise<Deployment | null> {
  const d = await repo.getLatestDeployment(projectId);
  if (!d || d.status !== 'building') return d;
  if (!d.vercelDeploymentId || !d.vercelProject) {
    // The deploy request was stopped before Vercel had it (a time limit, a closed connection).
    if (Date.now() - new Date(d.createdAt).getTime() > 10 * 60_000) {
      await repo.updateDeployment(d.id, { status: 'error', error: 'The deploy stopped before reaching Vercel. Deploy again.' });
      return { ...d, status: 'error', error: 'The deploy stopped before reaching Vercel. Deploy again.' };
    }
    return d;
  }
  const { vercel } = await tokens(repo);
  if (!vercel) return d;
  try {
    const s = await deploymentState({ token: vercel, id: d.vercelDeploymentId });
    if (s.state === 'building') {
      // A deploy that never reported back (closed tab, lost token) shouldn't spin forever.
      if (Date.now() - new Date(d.createdAt).getTime() > 30 * 60_000) {
        await repo.updateDeployment(d.id, { status: 'error', error: 'No result from Vercel after 30 minutes. Check the project in Vercel.' });
        return { ...d, status: 'error' };
      }
      return d;
    }
    if (s.state === 'error') {
      await repo.updateDeployment(d.id, { status: 'error', error: s.error?.slice(0, 1000) ?? 'The build failed.' });
      return { ...d, status: 'error', error: s.error ?? null };
    }
    const url = await projectUrl({ token: vercel, project: d.vercelProject });
    const note = isNote(d.error) ? d.error : null;
    await repo.updateDeployment(d.id, { status: 'ready', url, error: note });
    await repo.setProjectLinks(projectId, { liveUrl: url });
    // The live site now shows this version (or a newer one a client has published since).
    if (d.vercelProject && (await repo.getSiteVersion(projectId))) await repo.setPublishedVersion(projectId, d.version);
    const project = await repo.getProject(projectId);
    if (project && project.status !== 'live') await repo.updateProject(projectId, { status: 'live' });
    return { ...d, status: 'ready', url, error: note };
  } catch (err) {
    // Network trouble: try again on the next check.
    console.error('deploy status check failed', err);
    return d;
  }
}
