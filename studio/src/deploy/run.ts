import 'server-only';
import { decryptSecret } from '@/lib/crypto';
import type { Deployment, Repo } from '@/lib/data/repo';
import { exportSite, packageName, type ExportResult, type ImageLoader } from '@/export/generate';
import { siteConfigSchema } from '@/site/schema';
import { DeployError, pushToGitHub } from './github';
import { deployToVercel, deploymentState, projectUrl } from './vercel';

/*
 * One deploy: export the current version, commit it to GitHub (when a token
 * is set), upload it to Vercel. The build then runs on Vercel; refreshDeploy()
 * checks on it and, once it's ready, records the live address.
 */

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

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

export async function exportProject(repo: Repo, projectId: string, origin: string): Promise<ExportResult & { name: string; version: number }> {
  const project = await repo.getProject(projectId);
  const version = await repo.getSiteVersion(projectId);
  if (!project || !version) throw new DeployError('This project has no site yet.');
  const config = siteConfigSchema.parse(version.config);
  const result = await exportSite({ config, projectName: project.name, version: version.version, loadImage: imageLoader(origin) });
  return { ...result, name: packageName(project.name), version: version.version };
}

export async function startDeploy(repo: Repo, projectId: string, origin: string): Promise<Deployment> {
  const { github, vercel } = await tokens(repo);
  if (!vercel) throw new DeployError('Add a Vercel token in Settings → Connections first.');
  const project = (await repo.getProject(projectId))!;
  const previous = await repo.getLatestDeployment(projectId);
  const site = await exportProject(repo, projectId, origin);

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
    if (github) {
      const pushed = await pushToGitHub({
        token: github,
        existing: previous?.repoFullName ?? null,
        name: `${site.name}-site`,
        description: `Website for ${project.name}`,
        files: site.files,
        message: `Site version ${site.version}`,
      });
      await repo.updateDeployment(d.id, { repoFullName: pushed.fullName, repoUrl: pushed.url });
      await repo.setProjectLinks(projectId, { repoUrl: pushed.url });
      Object.assign(d, { repoFullName: pushed.fullName, repoUrl: pushed.url });
    }
    const vd = await deployToVercel({ token: vercel, existing: previous?.vercelProject ?? null, name: site.name, files: site.files });
    await repo.updateDeployment(d.id, { vercelProject: vd.project, vercelDeploymentId: vd.id });
    return { ...d, vercelProject: vd.project, vercelDeploymentId: vd.id };
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
    await repo.updateDeployment(d.id, { status: 'ready', url, error: null });
    await repo.setProjectLinks(projectId, { liveUrl: url });
    const project = await repo.getProject(projectId);
    if (project && project.status !== 'live') await repo.updateProject(projectId, { status: 'live' });
    return { ...d, status: 'ready', url, error: null };
  } catch (err) {
    // Network trouble: try again on the next check.
    console.error('deploy status check failed', err);
    return d;
  }
}
