import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import type { Asset, GenerationJob } from '@/generate/brief';
import { DEFAULT_SETTINGS, type Client, type Project, type StudioSettings } from '../types';
import { byNewest, statusTimestamps, type ChatMessage, type PitchEvent, type PitchView, type ProviderKeyRow, type Repo, type SiteVersion } from './repo';

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

const SELECT = '*, clients(owner_name, whatsapp, instagram, address, notes)';

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

/** Row-level security scopes every query to the signed-in owner. */
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
