import 'server-only';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Asset, GenerationJob } from '@/generate/brief';
import { DEFAULT_SETTINGS, type Project, type StudioSettings } from '../types';
import { devSeed, devSeedVersions } from './dev-seed';
import { byNewest, pitchExpiresAt, statusTimestamps, type ChatMessage, type CustomStyle, type Deployment, type PitchEvent, type ProviderKeyRow, type Repo, type SiteVersion } from './repo';

/**
 * Local development store: one JSON file under .data/. Seeded with the sample
 * businesses from the design so the dashboard has something to show.
 */
interface DevDb {
  projects: Project[];
  settings: StudioSettings;
  /** Site versions per project id, oldest first. */
  versions: Record<string, SiteVersion[]>;
  jobs: GenerationJob[];
  assets: Asset[];
  keys: ProviderKeyRow[];
  chat: (ChatMessage & { projectId: string })[];
  pitchEvents: (PitchEvent & { projectId: string })[];
  deployments: Deployment[];
  styles: CustomStyle[];
}

/** Uploaded files are kept under .data/uploads and served by /api/uploads. */
export const UPLOAD_DIR = path.join(process.cwd(), '.data', 'uploads');

const FILE = path.join(process.cwd(), '.data', 'dev-db.json');

let queue: Promise<unknown> = Promise.resolve();

async function load(): Promise<DevDb> {
  try {
    const db = JSON.parse(await readFile(FILE, 'utf8')) as DevDb;
    // Files written before phase 2 have no versions yet.
    db.versions ??= devSeedVersions(db.projects);
    // Files written before phase 3.
    db.jobs ??= [];
    db.assets ??= [];
    db.keys ??= [];
    db.chat ??= [];
    db.pitchEvents ??= [];
    db.deployments ??= [];
    db.styles ??= [];
    return db;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    const projects = devSeed();
    const db: DevDb = { projects, settings: { ...DEFAULT_SETTINGS }, versions: devSeedVersions(projects), jobs: [], assets: [], keys: [], chat: [], pitchEvents: [], deployments: [], styles: [] };
    await save(db);
    return db;
  }
}

async function save(db: DevDb): Promise<void> {
  await mkdir(path.dirname(FILE), { recursive: true });
  const tmp = `${FILE}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(db, null, 2));
  await rename(tmp, FILE);
}

/** Serialise read-modify-write cycles so concurrent actions don't clobber each other. */
function mutate<T>(fn: (db: DevDb) => T): Promise<T> {
  const run = queue.then(async () => {
    const db = await load();
    const out = fn(db);
    await save(db);
    return out;
  });
  queue = run.catch(() => undefined);
  return run;
}

function find(db: DevDb, id: string): Project {
  const p = db.projects.find((x) => x.id === id);
  if (!p) throw new Error('Project not found');
  return p;
}

export const devRepo: Repo = {
  async listProjects() {
    return (await load()).projects.slice().sort(byNewest);
  },

  async getProject(id) {
    return (await load()).projects.find((p) => p.id === id) ?? null;
  },

  createProject(input, opts) {
    return mutate((db) => {
      const now = new Date().toISOString();
      const project: Project = {
        id: randomUUID(),
        name: input.name,
        businessType: input.businessType,
        siteType: input.siteType,
        preset: input.preset,
        headline: input.headline,
        status: 'draft',
        pitchSlug: opts.pitchSlug,
        pitchPaused: false,
        pitchBanner: opts.pitchBanner,
        pitchExpiryDays: 30,
        currentVersion: null,
        thumbnailUrl: null,
        liveUrl: null,
        repoUrl: null,
        pitchSentAt: null,
        lastOpenedAt: null,
        liveAt: null,
        createdAt: now,
        updatedAt: now,
        client: { ...input.client },
      };
      db.projects.push(project);
      return project;
    });
  },

  updateProject(id, patch) {
    return mutate((db) => {
      const p = find(db, id);
      const now = new Date().toISOString();
      Object.assign(p, patch, statusTimestamps(p, patch.status, now), { updatedAt: now });
    });
  },

  updateClient(id, patch) {
    return mutate((db) => {
      const p = find(db, id);
      Object.assign(p.client, patch);
      p.updatedAt = new Date().toISOString();
    });
  },

  deleteProject(id) {
    return mutate((db) => {
      db.projects = db.projects.filter((p) => p.id !== id);
      delete db.versions[id];
      db.jobs = db.jobs.filter((j) => j.projectId !== id);
      db.assets = db.assets.filter((a) => a.projectId !== id);
      db.chat = db.chat.filter((m) => m.projectId !== id);
      db.pitchEvents = db.pitchEvents.filter((e) => e.projectId !== id);
      db.deployments = db.deployments.filter((d) => d.projectId !== id);
    }).then(() => rm(path.join(UPLOAD_DIR, id), { recursive: true, force: true }));
  },

  async getSiteVersion(projectId) {
    return (await load()).versions[projectId]?.at(-1) ?? null;
  },

  saveSiteVersion(projectId, config, summary) {
    return mutate((db) => {
      const p = find(db, projectId);
      const list = (db.versions[projectId] ??= []);
      const version = (list.at(-1)?.version ?? 0) + 1;
      const now = new Date().toISOString();
      list.push({ version, config, summary, createdAt: now });
      p.currentVersion = version;
      p.updatedAt = now;
      return version;
    });
  },

  async listSiteVersions(projectId, limit = 50) {
    return ((await load()).versions[projectId] ?? [])
      .slice()
      .reverse()
      .slice(0, limit)
      .map(({ config: _config, ...info }) => info);
  },

  async getSiteVersionNumber(projectId, version) {
    return (await load()).versions[projectId]?.find((v) => v.version === version) ?? null;
  },

  async listChatMessages(projectId) {
    return (await load()).chat.filter((m) => m.projectId === projectId).map(({ projectId: _p, ...m }) => m);
  },

  async getPitch(slug) {
    const db = await load();
    const p = db.projects.find((x) => x.pitchSlug === slug);
    if (!p) return null;
    const expiresAt = pitchExpiresAt(p);
    const live = !p.pitchPaused && (!expiresAt || expiresAt > new Date().toISOString());
    return {
      name: p.name,
      paused: p.pitchPaused,
      banner: p.pitchBanner,
      expiresAt,
      whatsapp: db.settings.bannerWhatsapp,
      instagram: db.settings.bannerInstagram,
      liveUrl: p.status === 'live' ? p.liveUrl : null,
      config: live ? (db.versions[p.id]?.at(-1)?.config ?? null) : null,
    };
  },

  logPitchOpen(slug, open) {
    return mutate((db) => {
      const p = db.projects.find((x) => x.pitchSlug === slug);
      if (!p || p.pitchPaused) return;
      const expiresAt = pitchExpiresAt(p);
      const now = new Date().toISOString();
      if (expiresAt && expiresAt <= now) return;
      db.pitchEvents.push({ id: randomUUID(), projectId: p.id, openedAt: now, device: open.device, isBot: open.isBot, path: open.path.slice(0, 100) });
      if (!open.isBot) p.lastOpenedAt = now;
    });
  },

  async listPitchEvents(projectId, limit = 50) {
    return (await load()).pitchEvents
      .filter((e) => e.projectId === projectId)
      .reverse()
      .slice(0, limit)
      .map(({ projectId: _p, ...e }) => e);
  },

  async getLatestDeployment(projectId) {
    return (await load()).deployments.filter((d) => d.projectId === projectId).at(-1) ?? null;
  },

  createDeployment(projectId, init) {
    return mutate((db) => {
      find(db, projectId);
      const now = new Date().toISOString();
      const d: Deployment = { ...init, id: randomUUID(), projectId, createdAt: now, updatedAt: now };
      db.deployments.push(d);
      return d;
    });
  },

  updateDeployment(id, patch) {
    return mutate((db) => {
      const d = db.deployments.find((x) => x.id === id);
      if (d) Object.assign(d, patch, { updatedAt: new Date().toISOString() });
    });
  },

  async listStyles() {
    return [...(await load()).styles].reverse();
  },

  async getStyle(id) {
    return (await load()).styles.find((x) => x.id === id) ?? null;
  },

  saveStyle(input) {
    return mutate((db) => {
      const now = new Date().toISOString();
      const existing = input.id ? db.styles.find((x) => x.id === input.id) : undefined;
      if (input.id && !existing) throw new Error('Style not found');
      if (existing) {
        Object.assign(existing, { name: input.name, note: input.note, theme: input.theme, updatedAt: now });
        return existing;
      }
      const style: CustomStyle = { id: randomUUID(), name: input.name, note: input.note, theme: input.theme, createdAt: now, updatedAt: now };
      db.styles.push(style);
      return style;
    });
  },

  deleteStyle(id) {
    return mutate((db) => {
      db.styles = db.styles.filter((x) => x.id !== id);
    });
  },

  setProjectLinks(projectId, links) {
    return mutate((db) => {
      const p = find(db, projectId);
      if (links.liveUrl !== undefined) p.liveUrl = links.liveUrl;
      if (links.repoUrl !== undefined) p.repoUrl = links.repoUrl;
      p.updatedAt = new Date().toISOString();
    });
  },

  addChatMessage(projectId, message) {
    return mutate((db) => {
      find(db, projectId);
      const m: ChatMessage = { ...message, id: randomUUID(), createdAt: new Date().toISOString() };
      db.chat.push({ ...m, projectId });
      return m;
    });
  },

  createJob(projectId, brief) {
    return mutate((db) => {
      find(db, projectId);
      const now = new Date().toISOString();
      const job: GenerationJob = {
        id: randomUUID(), projectId, status: 'draft', brief, extracted: null, plan: null, filled: {}, imagesDone: false, steps: [], error: null, createdAt: now, updatedAt: now,
      };
      db.jobs.push(job);
      return job;
    });
  },

  async getJob(id) {
    return (await load()).jobs.find((j) => j.id === id) ?? null;
  },

  async getLatestJob(projectId) {
    return (await load()).jobs.filter((j) => j.projectId === projectId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
  },

  saveJob(job) {
    return mutate((db) => {
      const i = db.jobs.findIndex((j) => j.id === job.id);
      if (i < 0) throw new Error('Job not found');
      db.jobs[i] = { ...job, id: db.jobs[i].id, projectId: db.jobs[i].projectId, createdAt: db.jobs[i].createdAt, updatedAt: new Date().toISOString() };
    });
  },

  async listAssets(projectId) {
    return (await load()).assets.filter((a) => a.projectId === projectId);
  },

  async addAsset(projectId, input, file) {
    const id = randomUUID();
    let url = input.url ?? '';
    if (file) {
      const name = `${id}.${file.ext}`;
      await mkdir(path.join(UPLOAD_DIR, projectId), { recursive: true });
      await writeFile(path.join(UPLOAD_DIR, projectId, name), file.bytes);
      url = `/api/uploads/${projectId}/${name}`;
    }
    if (!url) throw new Error('An asset needs a file or a URL');
    return mutate((db) => {
      find(db, projectId);
      const asset: Asset = { id, projectId, kind: input.kind, source: input.source, url, alt: input.alt, credit: input.credit, width: input.width, height: input.height, createdAt: new Date().toISOString() };
      db.assets.push(asset);
      return asset;
    });
  },

  async deleteAsset(projectId, assetId) {
    const removed = await mutate((db) => {
      const a = db.assets.find((x) => x.id === assetId && x.projectId === projectId);
      db.assets = db.assets.filter((x) => x !== a);
      return a;
    });
    if (removed?.url.startsWith(`/api/uploads/${projectId}/`)) {
      await rm(path.join(UPLOAD_DIR, projectId, path.basename(removed.url)), { force: true });
    }
  },

  async listProviderKeys() {
    return (await load()).keys.slice().sort((a, b) => a.position - b.position);
  },

  upsertProviderKey(provider, patch) {
    return mutate((db) => {
      let row = db.keys.find((k) => k.provider === provider);
      if (!row) {
        if (!patch.ciphertext) throw new Error('A new provider needs a key');
        row = { provider, ciphertext: '', hint: '', models: {}, position: db.keys.length, dailyLimit: null, usageDay: null, usageCount: 0, cooldownUntil: null };
        db.keys.push(row);
      }
      Object.assign(row, patch);
    });
  },

  deleteProviderKey(provider) {
    return mutate((db) => {
      db.keys = db.keys.filter((k) => k.provider !== provider);
    });
  },

  recordUsage(provider) {
    return mutate((db) => {
      const row = db.keys.find((k) => k.provider === provider);
      if (!row) return;
      const today = new Date().toISOString().slice(0, 10);
      row.usageCount = row.usageDay === today ? row.usageCount + 1 : 1;
      row.usageDay = today;
    });
  },

  setCooldown(provider, until) {
    return mutate((db) => {
      const row = db.keys.find((k) => k.provider === provider);
      if (row) row.cooldownUntil = until;
    });
  },

  async getSettings() {
    return (await load()).settings;
  },

  updateSettings(settings) {
    return mutate((db) => {
      db.settings = { ...settings };
    });
  },
};
