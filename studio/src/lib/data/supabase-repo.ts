import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { DEFAULT_SETTINGS, type Client, type Project, type StudioSettings } from '../types';
import { byNewest, statusTimestamps, type Repo } from './repo';

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
      check(await db.from('projects').delete().eq('id', id));
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
