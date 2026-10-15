import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import type { Asset, GenerationJob } from '@/generate/brief';
import type { MirrorMeta } from '@/mirror/copy';
import { DEFAULT_SETTINGS, type Client, type Project, type StudioSettings } from '../types';
import { byNewest, statusTimestamps, type ChatMessage, type CustomStyle, type Deployment, type PitchEvent, type AdminView, type BookingHold, type BookingRecord, type SiteAdmin, type Busy, type OrderRecord, type PitchView, type ProviderKeyRow, type Repo, type SiteVersion } from './repo';
import type { Order } from '@/site/store/payments';

interface ClientRow {
  owner_name: string;
  whatsapp: string;
  instagram: string;
  address: string;
  notes: string;
}

interface ProjectRow {
  id: string;
  name: string;
  business_type: string;
  site_type: Project['siteType'];
  preset: Project['preset'];
  headline: string;
  status: Project['status'];
  pitch_slug: string;
  pitch_paused: boolean;
  pitch_banner: boolean;
  pitch_expiry_days: Project['pitchExpiryDays'];
  current_version: number | null;
  thumbnail_url: string | null;
  live_url: string | null;
  repo_url: string | null;
  pitch_sent_at: string | null;
  last_opened_at: string | null;
  live_at: string | null;
  created_at: string;
  updated_at: string;
  clients: ClientRow | ClientRow[] | null;
}

const EMPTY_CLIENT: Client = { ownerName: '', whatsapp: '', instagram: '', address: '', notes: '' };

function toClient(row: ProjectRow['clients']): Client {
  const c = Array.isArray(row) ? row[0] : row;
  if (!c) return { ...EMPTY_CLIENT };
  return {
    ownerName: c.owner_name ?? '',
    whatsapp: c.whatsapp ?? '',
    instagram: c.instagram ?? '',
    address: c.address ?? '',
    notes: c.notes ?? '',
  };
}

function toProject(r: ProjectRow): Project {
  return {
    id: r.id,
    name: r.name,
    businessType: r.business_type,
    siteType: r.site_type,
    preset: r.preset,
    headline: r.headline,
    status: r.status,
    pitchSlug: r.pitch_slug,
    pitchPaused: r.pitch_paused,
    pitchBanner: r.pitch_banner,
    pitchExpiryDays: r.pitch_expiry_days,
    currentVersion: r.current_version,
    thumbnailUrl: r.thumbnail_url,
    liveUrl: r.live_url,
    repoUrl: r.repo_url,
    pitchSentAt: r.pitch_sent_at,
    lastOpenedAt: r.last_opened_at,
    liveAt: r.live_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    client: toClient(r.clients),
  };
}


interface JobRow {
  id: string;
  project_id: string;
  status: GenerationJob['status'];
  brief: GenerationJob['brief'];
  extracted: GenerationJob['extracted'];
  plan: GenerationJob['plan'];
  filled: GenerationJob['filled'];
  images_done: boolean;
  steps: GenerationJob['steps'];
  error: string | null;
  created_at: string;
  updated_at: string;
}

function toJob(r: JobRow): GenerationJob {
  return {
    id: r.id, projectId: r.project_id, status: r.status, brief: r.brief, extracted: r.extracted, plan: r.plan, filled: r.filled ?? {},
    imagesDone: r.images_done, steps: r.steps ?? [], error: r.error, createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

interface AssetRow {
  id: string; project_id: string; kind: Asset['kind']; source: Asset['source']; url: string; storage_path: string | null;
  alt: string; credit: string; width: number | null; height: number | null; created_at: string;
}

function toAsset(r: AssetRow): Asset {
  return { id: r.id, projectId: r.project_id, kind: r.kind, source: r.source, url: r.url, alt: r.alt, credit: r.credit, width: r.width, height: r.height, createdAt: r.created_at };
}

interface KeyRow {
  provider: ProviderKeyRow['provider']; key_ciphertext: string; key_hint: string; models: ProviderKeyRow['models']; position: number;
  daily_limit: number | null; usage_day: string | null; usage_count: number; cooldown_until: string | null;
}

const BUCKET = 'site-assets';
const COPY_BUCKET = 'site-copies';

const SELECT = '*, clients(owner_name, whatsapp, instagram, address, notes)';

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

/** Row-level security scopes every query to the signed-in owner. */
interface StyleRow {
  id: string;
  name: string;
  note: string;
  theme: CustomStyle['theme'];
  created_at: string;
  updated_at: string;
}

function toStyle(r: StyleRow): CustomStyle {
  return { id: r.id, name: r.name, note: r.note, theme: r.theme, createdAt: r.created_at, updatedAt: r.updated_at };
}

interface DeploymentRow {
  id: string;
  project_id: string;
  version: number;
  status: Deployment['status'];
  repo_full_name: string | null;
  repo_url: string | null;
  vercel_project: string | null;
  vercel_deployment_id: string | null;
  url: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

function toDeployment(r: DeploymentRow): Deployment {
  return {
    id: r.id,
    projectId: r.project_id,
    version: r.version,
    status: r.status,
    repoFullName: r.repo_full_name,
    repoUrl: r.repo_url,
    vercelProject: r.vercel_project,
    vercelDeploymentId: r.vercel_deployment_id,
    url: r.url,
    error: r.error,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function deploymentRow(d: Partial<Omit<Deployment, 'id' | 'projectId' | 'createdAt' | 'updatedAt'>>): Record<string, unknown> {
  const map: Record<string, string> = {
    version: 'version',
    status: 'status',
    repoFullName: 'repo_full_name',
    repoUrl: 'repo_url',
    vercelProject: 'vercel_project',
    vercelDeploymentId: 'vercel_deployment_id',
    url: 'url',
    error: 'error',
  };
  return Object.fromEntries(Object.entries(d).filter(([k, v]) => map[k] && v !== undefined).map(([k, v]) => [map[k], v]));
}

type OrderRow = {
  id: string; reference: string; provider: OrderRecord['provider']; mode: OrderRecord['mode']; status: OrderRecord['status'];
  currency: string; total: number | string; lines: Order['lines']; customer: Order['customer']; created_at: string; paid_at: string | null;
};

const toOrder = (r: OrderRow): OrderRecord => ({
  id: r.id, reference: r.reference, provider: r.provider, mode: r.mode, status: r.status, currency: r.currency, total: Number(r.total),
  lines: r.lines ?? [], customer: r.customer ?? { name: '', email: '', phone: '', note: '' }, createdAt: r.created_at, paidAt: r.paid_at,
});

type BookingRow = {
  id: string; reference: string; service_id: string; service_name: string; start_at: string; end_at: string; status: BookingRecord['status'];
  hold_until: string | null; provider: BookingRecord['provider']; mode: BookingRecord['mode']; currency: string; deposit: number | string;
  price: number | string; customer: BookingRecord['customer']; created_at: string;
};

const toBooking = (r: BookingRow): BookingRecord => ({
  id: r.id, reference: r.reference, serviceId: r.service_id, serviceName: r.service_name, start: r.start_at, end: r.end_at, status: r.status,
  holdUntil: r.hold_until, provider: r.provider, mode: r.mode, currency: r.currency, deposit: Number(r.deposit), price: Number(r.price),
  customer: r.customer ?? { name: '', email: '', phone: '', note: '' }, createdAt: r.created_at,
});

const toBusy = (rows: { start_at: string; end_at: string }[] | null): Busy[] => (rows ?? []).map((r) => ({ start: new Date(r.start_at).toISOString(), end: new Date(r.end_at).toISOString() }));

const holdArgs = (h: BookingHold) => ({
  p_reference: h.reference, p_service_id: h.serviceId, p_service_name: h.serviceName, p_start: h.start, p_end: h.end, p_capacity: h.capacity,
  p_provider: h.provider, p_currency: h.currency, p_deposit: h.deposit, p_price: h.price, p_customer: h.customer,
});

/** "time taken" from the database becomes a plain error the caller can show. */
function holdError(err: unknown): never {
  const msg = (err as Error).message ?? '';
  throw new Error(/time taken/.test(msg) ? 'time taken' : msg);
}

export function supabaseRepo(db: SupabaseClient): Repo {
  return {
    async listProjects() {
      const rows = check(await db.from('projects').select(SELECT)) as ProjectRow[];
      return rows.map(toProject).sort(byNewest);
    },

    async getProject(id) {
      const row = check(await db.from('projects').select(SELECT).eq('id', id).maybeSingle()) as ProjectRow | null;
      return row ? toProject(row) : null;
    },

    async createProject(input, opts) {
      const project = check(
        await db
          .from('projects')
          .insert({
            name: input.name,
            business_type: input.businessType,
            site_type: input.siteType,
            preset: input.preset,
            headline: input.headline,
            pitch_slug: opts.pitchSlug,
            pitch_banner: opts.pitchBanner,
          })
          .select('id')
          .single(),
      ) as { id: string };
      const client = await db.from('clients').insert({
        project_id: project.id,
        business_name: input.name,
        owner_name: input.client.ownerName,
        whatsapp: input.client.whatsapp,
        instagram: input.client.instagram,
        address: input.client.address,
        notes: input.client.notes,
      });
      if (client.error) {
        await db.from('projects').delete().eq('id', project.id);
        throw new Error(client.error.message);
      }
      const created = await this.getProject(project.id);
      if (!created) throw new Error('Project was created but could not be read back');
      return created;
    },

    async updateProject(id, patch) {
      const row: Record<string, unknown> = {};
      if (patch.status !== undefined) {
        const current = check(
          await db.from('projects').select('pitch_sent_at, live_at').eq('id', id).single(),
        ) as { pitch_sent_at: string | null; live_at: string | null };
        const ts = statusTimestamps(
          { pitchSentAt: current.pitch_sent_at, liveAt: current.live_at },
          patch.status,
          new Date().toISOString(),
        );
        row.status = patch.status;
        if (ts.pitchSentAt) row.pitch_sent_at = ts.pitchSentAt;
        if (ts.liveAt) row.live_at = ts.liveAt;
      }
      if (patch.name !== undefined) row.name = patch.name;
      if (patch.businessType !== undefined) row.business_type = patch.businessType;
      if (patch.preset !== undefined) row.preset = patch.preset;
      if (patch.siteType !== undefined) row.site_type = patch.siteType;
      if (patch.headline !== undefined) row.headline = patch.headline;
      if (patch.pitchPaused !== undefined) row.pitch_paused = patch.pitchPaused;
      if (patch.pitchBanner !== undefined) row.pitch_banner = patch.pitchBanner;
      if (patch.pitchExpiryDays !== undefined) row.pitch_expiry_days = patch.pitchExpiryDays;
      if (Object.keys(row).length) check(await db.from('projects').update(row).eq('id', id));
    },

    async updateClient(id, patch) {
      const row: Record<string, unknown> = {};
      if (patch.ownerName !== undefined) row.owner_name = patch.ownerName;
      if (patch.whatsapp !== undefined) row.whatsapp = patch.whatsapp;
      if (patch.instagram !== undefined) row.instagram = patch.instagram;
      if (patch.address !== undefined) row.address = patch.address;
      if (patch.notes !== undefined) row.notes = patch.notes;
      if (Object.keys(row).length) check(await db.from('clients').update(row).eq('project_id', id));
    },

    async deleteProject(id) {
      // Asset rows go with the project (cascade); their files in storage have to be removed explicitly.
      const files = check(await db.from('assets').select('storage_path').eq('project_id', id).not('storage_path', 'is', null)) as { storage_path: string }[];
      check(await db.from('projects').delete().eq('id', id));
      if (files.length) await db.storage.from(BUCKET).remove(files.map((f) => f.storage_path));
      const { data } = await db.auth.getUser();
      if (data.user) await db.storage.from(COPY_BUCKET).remove([`${data.user.id}/${id}/site.zip`]);
    },

    async getSiteVersion(projectId) {
      const row = check(
        await db
          .from('site_versions')
          .select('version, config, summary, created_at')
          .eq('project_id', projectId)
          .order('version', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ) as { version: number; config: SiteVersion['config']; summary: string; created_at: string } | null;
      return row ? { version: row.version, config: row.config, summary: row.summary, createdAt: row.created_at } : null;
    },

    async saveSiteVersion(projectId, config, summary) {
      return check(
        await db.rpc('save_site_version', { p_project_id: projectId, p_config: config, p_summary: summary }),
      ) as number;
    },

    async listSiteVersions(projectId, limit = 50) {
      const rows = check(
        await db.from('site_versions').select('version, summary, created_at').eq('project_id', projectId).order('version', { ascending: false }).limit(limit),
      ) as { version: number; summary: string; created_at: string }[];
      return rows.map((r) => ({ version: r.version, summary: r.summary, createdAt: r.created_at }));
    },

    async getSiteVersionNumber(projectId, version) {
      const row = check(
        await db.from('site_versions').select('version, config, summary, created_at').eq('project_id', projectId).eq('version', version).maybeSingle(),
      ) as { version: number; config: SiteVersion['config']; summary: string; created_at: string } | null;
      return row ? { version: row.version, config: row.config, summary: row.summary, createdAt: row.created_at } : null;
    },

    async listChatMessages(projectId) {
      const rows = check(
        await db.from('chat_messages').select('id, role, text, scope, change, version, created_at').eq('project_id', projectId).order('created_at').limit(200),
      ) as { id: string; role: ChatMessage['role']; text: string; scope: ChatMessage['scope']; change: string; version: number | null; created_at: string }[];
      return rows.map((r) => ({ id: r.id, role: r.role, text: r.text, scope: r.scope, change: r.change, version: r.version, createdAt: r.created_at }));
    },

    async getPitch(slug) {
      return check(await db.rpc('get_pitch', { p_slug: slug })) as PitchView | null;
    },

    async logPitchOpen(slug, open) {
      check(await db.rpc('log_pitch_open', { p_slug: slug, p_device: open.device, p_bot: open.isBot, p_path: open.path.slice(0, 100) }));
    },

    async listPitchEvents(projectId, limit = 50) {
      const rows = check(
        await db.from('pitch_events').select('id, opened_at, device, is_bot, path').eq('project_id', projectId).order('opened_at', { ascending: false }).limit(limit),
      ) as { id: string; opened_at: string; device: PitchEvent['device']; is_bot: boolean; path: string }[];
      return rows.map((r) => ({ id: r.id, openedAt: r.opened_at, device: r.device, isBot: r.is_bot, path: r.path }));
    },

    async getLatestDeployment(projectId) {
      const row = check(
        await db.from('deployments').select('*').eq('project_id', projectId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      ) as DeploymentRow | null;
      return row ? toDeployment(row) : null;
    },

    async createDeployment(projectId, init) {
      const row = check(await db.from('deployments').insert({ project_id: projectId, ...deploymentRow(init) }).select('*').single()) as DeploymentRow;
      return toDeployment(row);
    },

    async updateDeployment(id, patch) {
      check(await db.from('deployments').update(deploymentRow(patch)).eq('id', id));
    },

    async getSiteCopyMeta(projectId) {
      const row = check(await db.from('site_copies').select('meta').eq('project_id', projectId).maybeSingle()) as { meta: MirrorMeta } | null;
      return row?.meta ?? null;
    },

    async getSiteCopy(projectId) {
      const row = check(await db.from('site_copies').select('meta, storage_path').eq('project_id', projectId).maybeSingle()) as { meta: MirrorMeta; storage_path: string } | null;
      if (!row) return null;
      const { data, error } = await db.storage.from(COPY_BUCKET).download(row.storage_path);
      if (error || !data) throw new Error(`The site copy couldn’t be loaded: ${error?.message ?? 'missing file'}`);
      return { meta: row.meta, zip: new Uint8Array(await data.arrayBuffer()) };
    },

    async saveSiteCopy(projectId, meta, zip) {
      const { data } = await db.auth.getUser();
      if (!data.user) throw new Error('Not signed in');
      const storagePath = `${data.user.id}/${projectId}/site.zip`;
      const up = await db.storage.from(COPY_BUCKET).upload(storagePath, zip, { contentType: 'application/zip', upsert: true });
      if (up.error) throw new Error(up.error.message);
      check(await db.from('site_copies').upsert({ project_id: projectId, meta, storage_path: storagePath }));
    },

    async listSiteCopyThumbs() {
      // Just these fields from the meta, not the whole of it.
      const rows = check(await db.from('site_copies').select('project_id, home:meta->pages->0->>path, copied:meta->>copiedAt, edited:meta->>editedAt')) as {
        project_id: string;
        home: string | null;
        copied: string | null;
        edited: string | null;
      }[];
      return Object.fromEntries(rows.map((r) => [r.project_id, { home: r.home || 'index.html', version: `${r.copied ?? ''}|${r.edited ?? ''}` }]));
    },

    async saveSiteCopyEdits(projectId, edits) {
      const row = check(await db.from('site_copies').select('meta').eq('project_id', projectId).maybeSingle()) as { meta: MirrorMeta } | null;
      if (!row) return null;
      const meta = { ...row.meta, edits, editedAt: new Date().toISOString() };
      check(await db.from('site_copies').update({ meta }).eq('project_id', projectId));
      return meta;
    },

    async listStyles() {
      const rows = check(await db.from('style_presets').select('*').order('created_at', { ascending: false })) as StyleRow[];
      return rows.map(toStyle);
    },

    async getStyle(id) {
      const row = check(await db.from('style_presets').select('*').eq('id', id).maybeSingle()) as StyleRow | null;
      return row ? toStyle(row) : null;
    },

    async saveStyle(input) {
      const fields = { name: input.name, note: input.note, theme: input.theme };
      const row = (
        input.id
          ? check(await db.from('style_presets').update(fields).eq('id', input.id).select('*').single())
          : check(await db.from('style_presets').insert(fields).select('*').single())
      ) as StyleRow;
      return toStyle(row);
    },

    async deleteStyle(id) {
      check(await db.from('style_presets').delete().eq('id', id));
    },

    async setProjectLinks(projectId, links) {
      const row: Record<string, unknown> = {};
      if (links.liveUrl !== undefined) row.live_url = links.liveUrl;
      if (links.repoUrl !== undefined) row.repo_url = links.repoUrl;
      if (Object.keys(row).length) check(await db.from('projects').update(row).eq('id', projectId));
    },

    async addChatMessage(projectId, m) {
      const r = check(
        await db
          .from('chat_messages')
          .insert({ project_id: projectId, role: m.role, text: m.text, scope: m.scope, change: m.change, version: m.version })
          .select('id, created_at')
          .single(),
      ) as { id: string; created_at: string };
      return { ...m, id: r.id, createdAt: r.created_at };
    },

    async createJob(projectId, brief) {
      const row = check(await db.from('generation_jobs').insert({ project_id: projectId, brief }).select('*').single()) as JobRow;
      return toJob(row);
    },

    async getJob(id) {
      const row = check(await db.from('generation_jobs').select('*').eq('id', id).maybeSingle()) as JobRow | null;
      return row ? toJob(row) : null;
    },

    async getLatestJob(projectId) {
      const row = check(
        await db.from('generation_jobs').select('*').eq('project_id', projectId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      ) as JobRow | null;
      return row ? toJob(row) : null;
    },

    async saveJob(job) {
      check(
        await db
          .from('generation_jobs')
          .update({ status: job.status, brief: job.brief, extracted: job.extracted, plan: job.plan, filled: job.filled, images_done: job.imagesDone, steps: job.steps, error: job.error })
          .eq('id', job.id),
      );
    },

    async listAssets(projectId) {
      const rows = check(await db.from('assets').select('*').eq('project_id', projectId).order('created_at')) as AssetRow[];
      return rows.map(toAsset);
    },

    async addAsset(projectId, input, file) {
      let url = input.url ?? '';
      let storagePath: string | null = null;
      if (file) {
        const { data } = await db.auth.getUser();
        if (!data.user) throw new Error('Not signed in');
        storagePath = `${data.user.id}/${projectId}/${randomUUID()}.${file.ext}`;
        const up = await db.storage.from(BUCKET).upload(storagePath, file.bytes, { contentType: file.contentType, upsert: false });
        if (up.error) throw new Error(up.error.message);
        url = db.storage.from(BUCKET).getPublicUrl(storagePath).data.publicUrl;
      }
      if (!url) throw new Error('An asset needs a file or a URL');
      const row = check(
        await db
          .from('assets')
          .insert({ project_id: projectId, kind: input.kind, source: input.source, url, storage_path: storagePath, alt: input.alt, credit: input.credit, width: input.width, height: input.height })
          .select('*')
          .single(),
      ) as AssetRow;
      return toAsset(row);
    },

    async deleteAsset(projectId, assetId) {
      const row = check(await db.from('assets').delete().eq('id', assetId).eq('project_id', projectId).select('storage_path').maybeSingle()) as { storage_path: string | null } | null;
      if (row?.storage_path) await db.storage.from(BUCKET).remove([row.storage_path]);
    },

    async listProviderKeys() {
      const rows = check(await db.from('provider_keys').select('*').order('position')) as KeyRow[];
      return rows.map((r) => ({
        provider: r.provider, ciphertext: r.key_ciphertext, hint: r.key_hint, models: r.models ?? {}, position: r.position,
        dailyLimit: r.daily_limit, usageDay: r.usage_day, usageCount: r.usage_count, cooldownUntil: r.cooldown_until,
      }));
    },

    async upsertProviderKey(provider, patch) {
      const row: Record<string, unknown> = {};
      if (patch.ciphertext !== undefined) row.key_ciphertext = patch.ciphertext;
      if (patch.hint !== undefined) row.key_hint = patch.hint;
      if (patch.models !== undefined) row.models = patch.models;
      if (patch.position !== undefined) row.position = patch.position;
      if (patch.dailyLimit !== undefined) row.daily_limit = patch.dailyLimit;
      const existing = check(await db.from('provider_keys').select('provider').eq('provider', provider).maybeSingle());
      if (existing) {
        check(await db.from('provider_keys').update(row).eq('provider', provider));
      } else {
        if (!patch.ciphertext) throw new Error('A new provider needs a key');
        const count = check(await db.from('provider_keys').select('provider')) as unknown[];
        check(await db.from('provider_keys').insert({ provider, position: count.length, ...row }));
      }
    },

    async deleteProviderKey(provider) {
      check(await db.from('provider_keys').delete().eq('provider', provider));
    },

    async recordUsage(provider) {
      if (provider === 'demo') return;
      check(await db.rpc('record_provider_usage', { p_provider: provider }));
    },

    async setCooldown(provider, until) {
      if (provider === 'demo') return;
      check(await db.from('provider_keys').update({ cooldown_until: until }).eq('provider', provider));
    },

    async getSettings() {
      const row = check(
        await db.from('studio_settings').select('banner_default, banner_whatsapp, banner_instagram').maybeSingle(),
      ) as { banner_default: boolean; banner_whatsapp: string; banner_instagram: string } | null;
      if (!row) return { ...DEFAULT_SETTINGS };
      return {
        bannerDefault: row.banner_default,
        bannerWhatsapp: row.banner_whatsapp,
        bannerInstagram: row.banner_instagram,
      } satisfies StudioSettings;
    },

    async getPitchPaymentKey(slug, provider) {
      return (check(await db.rpc('pitch_payment_key', { p_slug: slug, p_provider: provider })) as string | null) ?? null;
    },

    async createPitchOrder(slug, order, tokenHash) {
      check(
        await db.rpc('create_pitch_order', {
          p_slug: slug, p_reference: order.reference, p_provider: order.provider, p_currency: order.currency, p_total: order.total,
          p_lines: order.lines, p_customer: order.customer, p_token_hash: tokenHash,
        }),
      );
    },

    async createOrder(projectId, order, tokenHash) {
      const { data } = await db.auth.getUser();
      if (!data.user) throw new Error('Not signed in');
      check(
        await db.from('orders').insert({
          owner_id: data.user.id, project_id: projectId, reference: order.reference, provider: order.provider, mode: 'test',
          currency: order.currency, total: order.total, lines: order.lines, customer: order.customer, token_hash: tokenHash,
        }),
      );
    },

    async settleOrder(reference, token, status) {
      return check(await db.rpc('settle_order', { p_reference: reference, p_token: token, p_status: status })) === true;
    },

    async orderPitchSlug(reference) {
      return (check(await db.rpc('order_pitch_slug', { p_reference: reference })) as string | null) ?? null;
    },

    async reportSiteOrder(projectId, key, order, mode) {
      const ok = check(
        await db.rpc('report_site_order', {
          p_project: projectId, p_key: key, p_reference: order.reference, p_provider: order.provider, p_mode: mode,
          p_currency: order.currency, p_total: order.total, p_lines: order.lines, p_customer: order.customer,
        }),
      );
      return ok === true;
    },

    async setOrdersKeyHash(projectId, hash) {
      check(await db.from('projects').update({ orders_key_hash: hash }).eq('id', projectId));
    },

    async listOrders(projectId, limit = 100) {
      const rows = check(await db.from('orders').select('id, reference, provider, mode, status, currency, total, lines, customer, created_at, paid_at').eq('project_id', projectId).order('created_at', { ascending: false }).limit(limit)) as OrderRow[];
      return rows.map(toOrder);
    },

    async setOrderStatus(projectId, orderId, status) {
      check(await db.from('orders').update({ status }).eq('id', orderId).eq('project_id', projectId));
    },

    async pitchBusy(slug, from, to) {
      return toBusy(check(await db.rpc('pitch_busy', { p_slug: slug, p_from: from, p_to: to })) as { start_at: string; end_at: string }[]);
    },

    async siteBusy(projectId, from, to) {
      return toBusy(check(await db.rpc('site_busy', { p_project: projectId, p_from: from, p_to: to })) as { start_at: string; end_at: string }[]);
    },

    async projectBusy(projectId, from, to) {
      const rows = check(
        await db.from('bookings').select('start_at, end_at, status, hold_until').eq('project_id', projectId).lt('start_at', to).gt('end_at', from).in('status', ['held', 'confirmed']),
      ) as { start_at: string; end_at: string; status: string; hold_until: string | null }[];
      return toBusy(rows.filter((r) => r.status === 'confirmed' || (r.hold_until && Date.parse(r.hold_until) > Date.now())));
    },

    async createPitchBooking(slug, hold, tokenHash) {
      try {
        check(await db.rpc('create_pitch_booking', { p_slug: slug, ...holdArgs(hold), p_token_hash: tokenHash }));
      } catch (err) {
        holdError(err);
      }
    },

    async createPreviewBooking(projectId, hold, tokenHash) {
      try {
        check(await db.rpc('create_preview_booking', { p_project: projectId, ...holdArgs(hold), p_token_hash: tokenHash }));
      } catch (err) {
        holdError(err);
      }
    },

    async holdSiteBooking(projectId, key, hold, mode) {
      try {
        return check(await db.rpc('hold_site_booking', { p_project: projectId, p_key: key, p_mode: mode, ...holdArgs(hold) })) === true;
      } catch (err) {
        holdError(err);
      }
    },

    async settleBooking(reference, token) {
      return check(await db.rpc('settle_booking', { p_reference: reference, p_token: token })) === true;
    },

    async confirmSiteBooking(projectId, key, reference) {
      return check(await db.rpc('confirm_site_booking', { p_project: projectId, p_key: key, p_reference: reference })) === true;
    },

    async bookingPitchSlug(reference) {
      return (check(await db.rpc('booking_pitch_slug', { p_reference: reference })) as string | null) ?? null;
    },

    async listBookings(projectId, since, limit = 200) {
      const rows = check(await db.from('bookings').select('*').eq('project_id', projectId).gte('end_at', since).order('start_at', { ascending: true }).limit(limit)) as BookingRow[];
      return rows.map(toBooking);
    },

    async setBookingStatus(projectId, bookingId, status) {
      check(await db.from('bookings').update({ status }).eq('id', bookingId).eq('project_id', projectId));
    },

    async listSiteAdmins(projectId) {
      const rows = check(await db.from('site_admins').select('id, email, name, last_sign_in_at, created_at').eq('project_id', projectId).order('created_at')) as {
        id: string; email: string; name: string; last_sign_in_at: string | null; created_at: string;
      }[];
      return rows.map((r): SiteAdmin => ({ id: r.id, email: r.email, name: r.name, lastSignInAt: r.last_sign_in_at, createdAt: r.created_at }));
    },

    async setSiteAdmin(projectId, input) {
      check(await db.rpc('set_site_admin', { p_project: projectId, p_email: input.email, p_name: input.name, p_password: input.password }));
    },

    async removeSiteAdmin(projectId, adminId) {
      check(await db.from('site_admins').delete().eq('id', adminId).eq('project_id', projectId));
    },

    async adminSignIn(email, password) {
      return (check(await db.rpc('admin_sign_in', { p_email: email, p_password: password })) as string | null) ?? null;
    },

    async adminSignOut(token) {
      check(await db.rpc('admin_sign_out', { p_token: token }));
    },

    async adminMe(token) {
      return (check(await db.rpc('admin_me', { p_token: token })) as AdminView | null) ?? null;
    },

    async adminSave(token, baseVersion, config, summary) {
      return check(await db.rpc('admin_save', { p_token: token, p_base_version: baseVersion, p_config: config, p_summary: summary })) as number;
    },

    async adminOrders(token) {
      return (check(await db.rpc('admin_orders', { p_token: token })) as OrderRow[]).map(toOrder);
    },

    async adminSetOrderStatus(token, orderId, status) {
      return check(await db.rpc('admin_set_order_status', { p_token: token, p_id: orderId, p_status: status })) === true;
    },

    async adminBookings(token, since) {
      return (check(await db.rpc('admin_bookings', { p_token: token, p_since: since })) as BookingRow[]).map(toBooking);
    },

    async adminSetBookingStatus(token, bookingId, status) {
      return check(await db.rpc('admin_set_booking_status', { p_token: token, p_id: bookingId, p_status: status })) === true;
    },

    async adminAssets(token) {
      return (check(await db.rpc('admin_assets', { p_token: token })) as AssetRow[]).map(toAsset);
    },

    async adminUpload(token, file, alt) {
      // A one-time ticket lets this upload through the storage rules; nothing else can be written.
      const path = check(await db.rpc('admin_upload_ticket', { p_token: token, p_ext: file.ext })) as string | null;
      if (!path) return null;
      const up = await db.storage.from(BUCKET).upload(path, file.bytes, { contentType: file.contentType, upsert: false });
      if (up.error) throw new Error(up.error.message);
      const url = db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
      const id = check(await db.rpc('admin_record_upload', { p_token: token, p_path: path, p_url: url, p_alt: alt, p_width: null, p_height: null })) as string | null;
      if (!id) return null;
      return { id, projectId: '', kind: 'photo', source: 'upload', url, alt, credit: '', width: null, height: null, createdAt: new Date().toISOString() };
    },

    async publishedConfig(projectId) {
      return (check(await db.rpc('published_config', { p_project: projectId })) as unknown) ?? null;
    },

    async setPublishedVersion(projectId, version) {
      // Never back: a client may have published a newer version while this deploy was being prepared.
      check(await db.from('projects').update({ published_version: version }).eq('id', projectId).or(`published_version.is.null,published_version.lt.${Math.floor(version)}`));
    },

    async updateSettings(s) {
      const { data } = await db.auth.getUser();
      if (!data.user) throw new Error('Not signed in');
      check(
        await db.from('studio_settings').upsert({
          owner_id: data.user.id,
          banner_default: s.bannerDefault,
          banner_whatsapp: s.bannerWhatsapp,
          banner_instagram: s.bannerInstagram,
        }),
      );
    },
  };
}
