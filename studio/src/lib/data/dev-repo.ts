import 'server-only';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_SETTINGS, type Project, type StudioSettings } from '../types';
import { devSeed } from './dev-seed';
import { byNewest, statusTimestamps, type Repo } from './repo';

/**
 * Local development store: one JSON file under .data/. Seeded with the sample
 * businesses from the design so the dashboard has something to show.
 */
interface DevDb {
  projects: Project[];
  settings: StudioSettings;
}

const FILE = path.join(process.cwd(), '.data', 'dev-db.json');

let queue: Promise<unknown> = Promise.resolve();

async function load(): Promise<DevDb> {
  try {
    return JSON.parse(await readFile(FILE, 'utf8')) as DevDb;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    const db: DevDb = { projects: devSeed(), settings: { ...DEFAULT_SETTINGS } };
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
