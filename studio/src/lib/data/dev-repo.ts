import 'server-only';
import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Asset, GenerationJob } from '@/generate/brief';
import type { MirrorMeta } from '@/mirror/copy';
import { DEFAULT_SETTINGS, type Project, type StudioSettings } from '../types';
import { devSeed, devSeedVersions } from './dev-seed';
import { byNewest, pitchExpiresAt, statusTimestamps, type ChatMessage, type CustomStyle, type Deployment, type AdminView, type BookingHold, type BookingRecord, type SiteAdmin, type Busy, type OrderRecord, type PitchEvent, type ProviderKeyRow, type Repo, type SiteVersion } from './repo';
import type { Order } from '@/site/store/payments';

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
  copies: Record<string, MirrorMeta>;
  orders: (OrderRecord & { projectId: string; tokenHash: string | null })[];
  /** Hash of each project's order key, for live sites reporting orders. */
  ordersKeys: Record<string, string>;
  bookings: (BookingRecord & { projectId: string; tokenHash: string | null })[];
  admins: (SiteAdmin & { projectId: string; passwordHash: string; failed: number; lockedUntil: string | null })[];
  adminSessions: { tokenHash: string; adminId: string; projectId: string; expiresAt: string }[];
  /** The version each deployed project shows. */
  published: Record<string, number>;
}

/** Uploaded files are kept under .data/uploads and served by /api/uploads. */
export const UPLOAD_DIR = path.join(process.cwd(), '.data', 'uploads');

const FILE = path.join(process.cwd(), '.data', 'dev-db.json');
const COPY_DIR = path.join(process.cwd(), '.data', 'copies');

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
    db.copies ??= {};
    db.orders ??= [];
    db.ordersKeys ??= {};
    db.bookings ??= [];
    db.admins ??= [];
    db.adminSessions ??= [];
    db.published ??= {};
    return db;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    const projects = devSeed();
    const db: DevDb = { projects, settings: { ...DEFAULT_SETTINGS }, versions: devSeedVersions(projects), jobs: [], assets: [], keys: [], chat: [], pitchEvents: [], deployments: [], styles: [], copies: {}, orders: [], ordersKeys: {}, bookings: [], admins: [], adminSessions: [], published: {} };
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
      delete db.copies[id];
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

  async getSiteCopyMeta(projectId) {
    return (await load()).copies[projectId] ?? null;
  },

  async getSiteCopy(projectId) {
    const meta = (await load()).copies[projectId];
    if (!meta) return null;
    try {
      return { meta, zip: new Uint8Array(await readFile(path.join(COPY_DIR, `${projectId}.zip`))) };
    } catch {
      return null;
    }
  },

  async saveSiteCopy(projectId, meta, zip) {
    await mkdir(COPY_DIR, { recursive: true });
    await writeFile(path.join(COPY_DIR, `${projectId}.zip`), zip);
    await mutate((db) => {
      find(db, projectId);
      db.copies[projectId] = meta;
    });
  },

  async listSiteCopyThumbs() {
    const copies = (await load()).copies;
    return Object.fromEntries(Object.entries(copies).map(([id, m]) => [id, { home: m.pages[0]?.path ?? 'index.html', version: `${m.copiedAt}|${m.editedAt ?? ''}` }]));
  },

  async saveSiteCopyEdits(projectId, edits) {
    let out: MirrorMeta | null = null;
    await mutate((db) => {
      const meta = db.copies[projectId];
      if (meta) out = db.copies[projectId] = { ...meta, edits, editedAt: new Date().toISOString() };
    });
    return out;
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

  async getPitchPaymentKey(slug, provider) {
    const db = await load();
    const p = livePitch(db, slug);
    return p ? (db.keys.find((k) => k.provider === provider)?.ciphertext ?? null) : null;
  },

  createPitchOrder(slug, order, tokenHash) {
    return mutate((db) => {
      const p = livePitch(db, slug);
      if (!p) throw new Error('pitch not available');
      db.orders.push(newOrder(p.id, order, tokenHash));
    });
  },

  createOrder(projectId, order, tokenHash) {
    return mutate((db) => {
      db.orders.push(newOrder(projectId, order, tokenHash));
    });
  },

  async settleOrder(reference, token, status) {
    let ok = false;
    await mutate((db) => {
      const o = db.orders.find((x) => x.reference === reference);
      if (!o || o.tokenHash !== sha256(token) || (o.status !== 'pending' && o.status !== 'failed')) return;
      o.status = status;
      if (status === 'paid') o.paidAt ??= new Date().toISOString();
      ok = true;
    });
    return ok;
  },

  async orderPitchSlug(reference) {
    const db = await load();
    const o = db.orders.find((x) => x.reference === reference);
    return o ? (db.projects.find((p) => p.id === o.projectId)?.pitchSlug ?? null) : null;
  },

  async reportSiteOrder(projectId, key, order, mode) {
    let ok = false;
    await mutate((db) => {
      if (!db.ordersKeys[projectId] || db.ordersKeys[projectId] !== sha256(key)) return;
      ok = true;
      if (db.orders.some((o) => o.reference === order.reference)) return;
      db.orders.push({ ...newOrder(projectId, order, null), mode, status: 'paid', paidAt: new Date().toISOString() });
    });
    return ok;
  },

  setOrdersKeyHash(projectId, hash) {
    return mutate((db) => {
      db.ordersKeys[projectId] = hash;
    });
  },

  async listOrders(projectId, limit = 100) {
    return (await load()).orders
      .filter((o) => o.projectId === projectId)
      .reverse()
      .slice(0, limit)
      .map(({ projectId: _p, tokenHash: _t, ...o }) => o);
  },

  setOrderStatus(projectId, orderId, status) {
    return mutate((db) => {
      const o = db.orders.find((x) => x.id === orderId && x.projectId === projectId);
      if (o) o.status = status;
    });
  },

  async pitchBusy(slug, from, to) {
    const db = await load();
    const p = livePitch(db, slug);
    return p ? busyIn(db, p.id, from, to) : [];
  },

  async siteBusy(projectId, from, to) {
    const db = await load();
    return db.ordersKeys[projectId] ? busyIn(db, projectId, from, to) : [];
  },

  async projectBusy(projectId, from, to) {
    return busyIn(await load(), projectId, from, to);
  },

  createPitchBooking(slug, hold, tokenHash) {
    return mutate((db) => {
      const p = livePitch(db, slug);
      if (!p) throw new Error('pitch not available');
      holdIn(db, p.id, hold, 'test', tokenHash);
    });
  },

  createPreviewBooking(projectId, hold, tokenHash) {
    return mutate((db) => holdIn(db, projectId, hold, 'test', tokenHash));
  },

  async holdSiteBooking(projectId, key, hold, mode) {
    let ok = false;
    await mutate((db) => {
      if (!db.ordersKeys[projectId] || db.ordersKeys[projectId] !== sha256(key)) return;
      holdIn(db, projectId, hold, mode, null);
      ok = true;
    });
    return ok;
  },

  async settleBooking(reference, token) {
    let ok = false;
    await mutate((db) => {
      const b = db.bookings.find((x) => x.reference === reference);
      if (!b || b.status !== 'held' || b.tokenHash !== sha256(token)) return;
      b.status = 'confirmed';
      ok = true;
    });
    return ok;
  },

  async confirmSiteBooking(projectId, key, reference) {
    let ok = false;
    await mutate((db) => {
      if (db.ordersKeys[projectId] !== sha256(key)) return;
      ok = true;
      const b = db.bookings.find((x) => x.projectId === projectId && x.reference === reference);
      if (b?.status === 'held') b.status = 'confirmed';
    });
    return ok;
  },

  async bookingPitchSlug(reference) {
    const db = await load();
    const b = db.bookings.find((x) => x.reference === reference);
    return b ? (db.projects.find((p) => p.id === b.projectId)?.pitchSlug ?? null) : null;
  },

  async listBookings(projectId, since, limit = 200) {
    return (await load()).bookings
      .filter((b) => b.projectId === projectId && b.end >= since)
      .sort((a, b) => a.start.localeCompare(b.start))
      .slice(0, limit)
      .map(({ projectId: _p, tokenHash: _t, ...b }) => b);
  },

  setBookingStatus(projectId, bookingId, status) {
    return mutate((db) => {
      const b = db.bookings.find((x) => x.id === bookingId && x.projectId === projectId);
      if (b) b.status = status;
    });
  },

  async listSiteAdmins(projectId) {
    return (await load()).admins.filter((a) => a.projectId === projectId).map(({ id, email, name, lastSignInAt, createdAt }) => ({ id, email, name, lastSignInAt, createdAt }));
  },

  setSiteAdmin(projectId, input) {
    return mutate((db) => {
      const email = input.email.trim().toLowerCase();
      if (input.password.length < 10) throw new Error('password too short');
      const existing = db.admins.find((a) => a.email === email);
      if (existing && existing.projectId !== projectId) throw new Error('email in use');
      if (existing) {
        Object.assign(existing, { name: input.name.slice(0, 80), passwordHash: hashPassword(input.password), failed: 0, lockedUntil: null });
        db.adminSessions = db.adminSessions.filter((s) => s.adminId !== existing.id);
        return;
      }
      db.admins.push({ id: randomUUID(), projectId, email, name: input.name.slice(0, 80), passwordHash: hashPassword(input.password), failed: 0, lockedUntil: null, lastSignInAt: null, createdAt: new Date().toISOString() });
    });
  },

  removeSiteAdmin(projectId, adminId) {
    return mutate((db) => {
      db.admins = db.admins.filter((a) => !(a.id === adminId && a.projectId === projectId));
      db.adminSessions = db.adminSessions.filter((s) => s.adminId !== adminId);
    });
  },

  async adminSignIn(email, password) {
    let token: string | null = null;
    await mutate((db) => {
      const a = db.admins.find((x) => x.email === email.trim().toLowerCase());
      if (!a) return;
      if (a.lockedUntil && a.lockedUntil > new Date().toISOString()) {
        token = 'locked';
        return;
      }
      if (!passwordOk(password, a.passwordHash)) {
        a.failed += 1;
        if (a.failed >= 5) {
          a.failed = 0;
          a.lockedUntil = new Date(Date.now() + 15 * 60_000).toISOString();
        }
        return;
      }
      a.failed = 0;
      a.lockedUntil = null;
      a.lastSignInAt = new Date().toISOString();
      token = randomBytes(32).toString('hex');
      db.adminSessions.push({ tokenHash: sha256(token), adminId: a.id, projectId: a.projectId, expiresAt: new Date(Date.now() + 30 * 86_400_000).toISOString() });
    });
    return token;
  },

  adminSignOut(token) {
    return mutate((db) => {
      db.adminSessions = db.adminSessions.filter((s) => s.tokenHash !== sha256(token));
    });
  },

  async adminMe(token) {
    const db = await load();
    const a = adminOf(db, token);
    if (!a) return null;
    const p = db.projects.find((x) => x.id === a.projectId)!;
    const v = db.versions[p.id]?.at(-1);
    return { name: a.name, email: a.email, projectId: p.id, projectName: p.name, liveUrl: p.liveUrl, pitchSlug: p.pitchSlug, version: v?.version ?? 0, config: v?.config ?? null } satisfies AdminView;
  },

  async adminSave(token, baseVersion, config, summary) {
    let version = 0;
    await mutate((db) => {
      const a = adminOf(db, token);
      if (!a) throw new Error('not signed in');
      const list = (db.versions[a.projectId] ??= []);
      if ((list.at(-1)?.version ?? 0) !== baseVersion) throw new Error('changed meanwhile');
      version = baseVersion + 1;
      list.push({ version, config, summary: summary.slice(0, 300) || 'Edited by the client', createdAt: new Date().toISOString() });
      const p = db.projects.find((x) => x.id === a.projectId)!;
      p.currentVersion = version;
      db.published[a.projectId] = version;
    });
    return version;
  },

  async adminOrders(token) {
    const db = await load();
    const a = adminOf(db, token);
    if (!a) return [];
    return db.orders
      .filter((o) => o.projectId === a.projectId && o.status !== 'pending' && o.status !== 'failed')
      .reverse()
      .map(({ projectId: _p, tokenHash: _t, ...o }) => o);
  },

  async adminSetOrderStatus(token, orderId, status) {
    let ok = false;
    await mutate((db) => {
      const a = adminOf(db, token);
      const o = a && db.orders.find((x) => x.id === orderId && x.projectId === a.projectId);
      if (!o || !['paid', 'fulfilled', 'cancelled'].includes(status) || !['paid', 'fulfilled', 'cancelled'].includes(o.status)) return;
      o.status = status;
      ok = true;
    });
    return ok;
  },

  async adminBookings(token, since) {
    const db = await load();
    const a = adminOf(db, token);
    if (!a) return [];
    return db.bookings
      .filter((b) => b.projectId === a.projectId && b.end >= since && b.status !== 'held')
      .sort((x, y) => x.start.localeCompare(y.start))
      .map(({ projectId: _p, tokenHash: _t, ...b }) => b);
  },

  async adminSetBookingStatus(token, bookingId, status) {
    let ok = false;
    await mutate((db) => {
      const a = adminOf(db, token);
      const b = a && db.bookings.find((x) => x.id === bookingId && x.projectId === a.projectId);
      if (!b || b.status === 'held' || !['confirmed', 'done', 'no_show', 'cancelled'].includes(status)) return;
      b.status = status;
      ok = true;
    });
    return ok;
  },

  async adminAssets(token) {
    const db = await load();
    const a = adminOf(db, token);
    return a ? db.assets.filter((x) => x.projectId === a.projectId && x.kind === 'photo').reverse() : [];
  },

  async adminUpload(token, file, alt) {
    const a = adminOf(await load(), token);
    if (!a) return null;
    return devRepo.addAsset(a.projectId, { kind: 'photo', source: 'upload', alt, credit: '', width: null, height: null }, file);
  },

  async publishedConfig(projectId) {
    const db = await load();
    const v = db.published[projectId];
    return v ? (db.versions[projectId]?.find((x) => x.version === v)?.config ?? null) : null;
  },

  setPublishedVersion(projectId, version) {
    return mutate((db) => {
      db.published[projectId] = Math.max(db.published[projectId] ?? 0, version);
    });
  },
};

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

/** scrypt for the dev store's client passwords (Supabase uses bcrypt in the database). */
function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 32).toString('hex')}`;
}

function passwordOk(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  const got = scryptSync(password, salt, 32);
  return got.length === Buffer.from(hash, 'hex').length && timingSafeEqual(got, Buffer.from(hash, 'hex'));
}

function adminOf(db: DevDb, token: string) {
  const s = db.adminSessions.find((x) => x.tokenHash === sha256(token) && x.expiresAt > new Date().toISOString());
  return s ? (db.admins.find((a) => a.id === s.adminId) ?? null) : null;
}

const activeBooking = (b: BookingRecord) => b.status === 'confirmed' || (b.status === 'held' && !!b.holdUntil && Date.parse(b.holdUntil) > Date.now());

function busyIn(db: DevDb, projectId: string, from: string, to: string): Busy[] {
  if (Date.parse(to) <= Date.parse(from) || Date.parse(to) - Date.parse(from) > 15 * 86_400_000) return [];
  return db.bookings
    .filter((b) => b.projectId === projectId && activeBooking(b) && Date.parse(b.start) < Date.parse(to) && Date.parse(b.end) > Date.parse(from))
    .map((b) => ({ start: b.start, end: b.end }));
}

function holdIn(db: DevDb, projectId: string, h: BookingHold, mode: 'test' | 'live', tokenHash: string | null) {
  const overlapping = db.bookings.filter((b) => b.projectId === projectId && activeBooking(b) && Date.parse(b.start) < Date.parse(h.end) && Date.parse(b.end) > Date.parse(h.start)).length;
  if (overlapping >= Math.max(1, Math.min(h.capacity, 20))) throw new Error('time taken');
  db.bookings.push({
    id: randomUUID(), projectId, tokenHash, reference: h.reference, serviceId: h.serviceId, serviceName: h.serviceName, start: h.start, end: h.end,
    status: 'held', holdUntil: new Date(Date.now() + 30 * 60_000).toISOString(), provider: h.provider, mode, currency: h.currency, deposit: h.deposit,
    price: h.price, customer: h.customer, createdAt: new Date().toISOString(),
  });
}

function livePitch(db: DevDb, slug: string): Project | null {
  const p = db.projects.find((x) => x.pitchSlug === slug);
  if (!p || p.pitchPaused) return null;
  const expiresAt = pitchExpiresAt(p);
  return expiresAt && expiresAt <= new Date().toISOString() ? null : p;
}

function newOrder(projectId: string, order: Order, tokenHash: string | null): DevDb['orders'][number] {
  return {
    id: randomUUID(), projectId, tokenHash, reference: order.reference, provider: order.provider, mode: 'test', status: 'pending',
    currency: order.currency, total: order.total, lines: order.lines, customer: order.customer, createdAt: new Date().toISOString(), paidAt: null,
  };
}
