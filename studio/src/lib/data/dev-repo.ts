import 'server-only';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_SETTINGS, type Project, type StudioSettings } from '../types';
import { devSeed, devSeedVersions } from './dev-seed';
import { byNewest, statusTimestamps, type Repo, type SiteVersion } from './repo';

/**
 * Local development store: one JSON file under .data/. Seeded with the sample
 * businesses from the design so the dashboard has something to show.
 */
interface DevDb {
  projects: Project[];
  settings: StudioSettings;
  /** Site versions per project id, oldest first. */
  versions: Record<string, SiteVersion[]>;
}

const FILE = path.join(process.cwd(), '.data', 'dev-db.json');

let queue: Promise<unknown> = Promise.resolve();

async function load(): Promise<DevDb> {
  try {
    const db = JSON.parse(await readFile(FILE, 'utf8')) as DevDb;
    // Files written before phase 2 have no versions yet.
    db.versions ??= devSeedVersions(db.projects);
    return db;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    const projects = devSeed();
    const db: DevDb = { projects, settings: { ...DEFAULT_SETTINGS }, versions: devSeedVersions(projects) };
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
    });
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

  async getSettings() {
    return (await load()).settings;
  },

  updateSettings(settings) {
    return mutate((db) => {
      db.settings = { ...settings };
    });
  },
};
