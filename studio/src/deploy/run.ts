import 'server-only';
import { randomBytes } from 'node:crypto';
import { decryptSecret } from '@/lib/crypto';
import type { Deployment, Repo } from '@/lib/data/repo';
import { exportSite, packageName, type ExportResult, type ImageLoader } from '@/export/generate';
import { siteConfigSchema, type PaymentProvider } from '@/site/schema';
import { cardProviders, depositProviders } from '@/site/store/payments-info';
import { sha256 } from '@/site/store/payments';
import { unzipSync } from 'fflate';
import { copyChecklist } from '@/mirror/checklist';
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
    return row ? decryptSecret(row.ciphertext) : null;
  };
  return { github: get('github'), vercel: get('vercel') };
}

export interface ProjectExport extends ExportResult {
  name: string;
  version: number;
  /** "nextjs" for generated sites; null for an exact copy, which Vercel serves as plain files. */
  framework: 'nextjs' | null;
  /** Card payments the shop takes, which need keys on the hosting. */
  payments: PaymentProvider[];
}

export async function exportProject(repo: Repo, projectId: string, origin: string): Promise<ProjectExport> {
  const project = await repo.getProject(projectId);
  if (!project) throw new DeployError('This project no longer exists.');
  const version = await repo.getSiteVersion(projectId);
  if (!version) {
    // A project made by copying a client's site as it is.
    const copy = await repo.getSiteCopy(projectId);
    if (!copy) throw new DeployError('This project has no site yet.');
    const checklist = copyChecklist(copy.meta);
    const files = Object.entries(unzipSync(copy.zip)).map(([path, data]) => ({ path, data }));
    files.push({ path: 'vercel.json', data: new TextEncoder().encode(`${JSON.stringify({ cleanUrls: true, trailingSlash: false }, null, 2)}\n`) });
    files.push({
      path: 'HANDOVER.md',
      data: new TextEncoder().encode(
        `# ${project.name}\n\nAn exact copy of ${copy.meta.sourceUrl}, made ${copy.meta.copiedAt.slice(0, 10)}: ${copy.meta.pages.length} pages, ${copy.meta.files} files. Static files: open index.html, or deploy the folder to any static host.\n\n## Before it replaces the original\n\n${checklist.map((c) => `- [ ] **${c.title}.** ${c.detail}`).join('\n')}\n`,
      ),
    });
    return { files, checklist, name: packageName(project.name), version: 1, framework: null, payments: [] };
  }
  const config = siteConfigSchema.parse(version.config);
  const result = await exportSite({ config, projectName: project.name, version: version.version, loadImage: imageLoader(origin) });
  return { ...result, name: packageName(project.name), version: version.version, framework: 'nextjs', payments: [...new Set([...cardProviders(config.store), ...depositProviders(config.bookings)])] };
}

export async function startDeploy(repo: Repo, projectId: string, origin: string, opts: { paymentKeys?: PaymentKeys } = {}): Promise<Deployment> {
  const { github, vercel } = await tokens(repo);
  if (!vercel) throw new DeployError('Add a Vercel token in Settings → Connections first.');
  const project = (await repo.getProject(projectId))!;
  const previous = await repo.getLatestDeployment(projectId);
  const site = await exportProject(repo, projectId, origin);
  // A shop taking cards needs the business's keys, and reports paid orders back here with a fresh key.
  // Generated sites read their published content from the studio, so client edits go live without a rebuild.
  let env: Record<string, string> | undefined = site.framework === 'nextjs' ? { SONO_SITE_API: `${origin}/api/sites/${projectId}` } : undefined;
  if (site.payments.length) {
    const ordersKey = randomBytes(32).toString('hex');
    await repo.setOrdersKeyHash(projectId, sha256(ordersKey));
    env = {
      ...env,
      ...paymentEnv(opts.paymentKeys),
      SONO_ORDERS_URL: `${origin}/api/sites/${projectId}/orders`,
      SONO_ORDERS_KEY: ordersKey,
      // The studio keeps the booking calendar for sites taking deposits.
      SONO_SITE_API: `${origin}/api/sites/${projectId}`,
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
  if (!d || d.status !== 'building' || !d.vercelDeploymentId || !d.vercelProject) return d;
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
