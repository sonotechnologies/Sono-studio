import type { ProviderId, StockProviderId, Tier } from '@/ai/types';
import type { Asset, Brief, GenerationJob } from '@/generate/brief';
import type { SiteConfig, SiteTheme } from '@/site/schema';
import type { MirrorMeta } from '@/mirror/copy';
import type {
  ClientPatch,
  DeployProviderId,
  NewProjectInput,
  Project,
  ProjectPatch,
  ProjectStatus,
  StudioSettings,
} from '../types';

export interface Repo {
  listProjects(): Promise<Project[]>;
  getProject(id: string): Promise<Project | null>;
  createProject(input: NewProjectInput, opts: { pitchSlug: string; pitchBanner: boolean }): Promise<Project>;
  updateProject(id: string, patch: ProjectPatch): Promise<void>;
  updateClient(id: string, patch: ClientPatch): Promise<void>;
  deleteProject(id: string): Promise<void>;
  /** The newest saved version of the project's site, or null before version 1 exists. */
  getSiteVersion(projectId: string): Promise<SiteVersion | null>;
  /** Saves a new version (config already validated) and makes it current. Returns its number. */
  saveSiteVersion(projectId: string, config: SiteConfig, summary: string): Promise<number>;
  /** Newest first, without the configs. */
  listSiteVersions(projectId: string, limit?: number): Promise<VersionInfo[]>;
  getSiteVersionNumber(projectId: string, version: number): Promise<SiteVersion | null>;
  listChatMessages(projectId: string): Promise<ChatMessage[]>;
  addChatMessage(projectId: string, message: Omit<ChatMessage, 'id' | 'createdAt'>): Promise<ChatMessage>;
  createJob(projectId: string, brief: Brief): Promise<GenerationJob>;
  getJob(id: string): Promise<GenerationJob | null>;
  /** The most recent generation job for a project, if any. */
  getLatestJob(projectId: string): Promise<GenerationJob | null>;
  /** Saves a job's progress (everything except its ids and timestamps). */
  saveJob(job: GenerationJob): Promise<void>;
  listAssets(projectId: string): Promise<Asset[]>;
  /** Stores an uploaded file, or records an external (stock) image when `file` is absent. */
  addAsset(projectId: string, input: NewAsset, file?: UploadFile): Promise<Asset>;
  deleteAsset(projectId: string, assetId: string): Promise<void>;
  listProviderKeys(): Promise<ProviderKeyRow[]>;
  upsertProviderKey(provider: KeyProvider, patch: ProviderKeyPatch): Promise<void>;
  deleteProviderKey(provider: KeyProvider): Promise<void>;
  /** Counts one request against today's usage for the daily meter. */
  recordUsage(provider: ProviderId): Promise<void>;
  setCooldown(provider: ProviderId, until: string | null): Promise<void>;
  getSettings(): Promise<StudioSettings>;
  /** What the public pitch page shows. Works without a signed-in user. */
  getPitch(slug: string): Promise<PitchView | null>;
  /** Logs one open of a live pitch link. Works without a signed-in user. */
  logPitchOpen(slug: string, open: { device: Device; isBot: boolean; path: string }): Promise<void>;
  /** Newest first. */
  listPitchEvents(projectId: string, limit?: number): Promise<PitchEvent[]>;
  /** The newest deploy of a project, if any. */
  getLatestDeployment(projectId: string): Promise<Deployment | null>;
  createDeployment(projectId: string, init: Omit<Deployment, 'id' | 'projectId' | 'createdAt' | 'updatedAt'>): Promise<Deployment>;
  updateDeployment(id: string, patch: Partial<Omit<Deployment, 'id' | 'projectId' | 'createdAt' | 'updatedAt'>>): Promise<void>;
  /** An exact copy of a client's own site: what it holds, and the zip itself. */
  getSiteCopyMeta(projectId: string): Promise<MirrorMeta | null>;
  getSiteCopy(projectId: string): Promise<{ meta: MirrorMeta; zip: Uint8Array } | null>;
  saveSiteCopy(projectId: string, meta: MirrorMeta, zip: Uint8Array): Promise<void>;
  /** Your own styles, newest first. */
  listStyles(): Promise<CustomStyle[]>;
  getStyle(id: string): Promise<CustomStyle | null>;
  saveStyle(input: { id?: string; name: string; note: string; theme: SiteTheme }): Promise<CustomStyle>;
  deleteStyle(id: string): Promise<void>;
  /** Records where the site lives once a deploy is ready. */
  setProjectLinks(projectId: string, links: { liveUrl?: string; repoUrl?: string }): Promise<void>;
  updateSettings(settings: StudioSettings): Promise<void>;
}

export type KeyProvider = Exclude<ProviderId, 'demo'> | StockProviderId | DeployProviderId;

export interface ProviderKeyRow {
  provider: KeyProvider;
  ciphertext: string;
  hint: string;
  models: Partial<Record<Tier, string>>;
  position: number;
  dailyLimit: number | null;
  usageDay: string | null;
  usageCount: number;
  cooldownUntil: string | null;
}

export type ProviderKeyPatch = Partial<Pick<ProviderKeyRow, 'ciphertext' | 'hint' | 'models' | 'position' | 'dailyLimit'>>;

export interface NewAsset {
  kind: Asset['kind'];
  source: Asset['source'];
  url?: string;
  alt: string;
  credit: string;
  width: number | null;
  height: number | null;
}

export interface UploadFile {
  bytes: Uint8Array;
  contentType: string;
  ext: string;
}

/** Today's usage, treating a count from an earlier day as zero. */
export function usageToday(row: Pick<ProviderKeyRow, 'usageDay' | 'usageCount'>, now: Date = new Date()): number {
  return row.usageDay === now.toISOString().slice(0, 10) ? row.usageCount : 0;
}

export type VersionInfo = Omit<SiteVersion, 'config'>;

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  scope: 'site' | 'page' | 'section' | null;
  /** Short description of what the message changed, shown as a pill. */
  change: string;
  version: number | null;
  createdAt: string;
}

export type Device = 'mobile' | 'tablet' | 'desktop';

export interface PitchView {
  name: string;
  paused: boolean;
  banner: boolean;
  expiresAt: string | null;
  /** Your contact details for the banner, from Settings. */
  whatsapp: string;
  instagram: string;
  /** Set once the site is live: the pitch link forwards here. */
  liveUrl?: string | null;
  /** The current site config; null while the link is paused or expired, or before version 1 exists. */
  config: unknown;
}

export interface PitchEvent {
  id: string;
  openedAt: string;
  device: Device;
  isBot: boolean;
  path: string;
}

/** When a pitch link stops working: the expiry counts from the day the pitch was sent, or the project was created. */
export function pitchExpiresAt(p: Pick<Project, 'pitchExpiryDays' | 'pitchSentAt' | 'createdAt'>): string | null {
  if (p.pitchExpiryDays === null) return null;
  const start = new Date(p.pitchSentAt ?? p.createdAt).getTime();
  return new Date(start + p.pitchExpiryDays * 24 * 60 * 60 * 1000).toISOString();
}

/** A style of your own: a built-in preset (theme.preset) with its colours, fonts and corners replaced. */
export interface CustomStyle {
  id: string;
  name: string;
  note: string;
  theme: SiteTheme;
  createdAt: string;
  updatedAt: string;
}

export interface Deployment {
  id: string;
  projectId: string;
  version: number;
  status: 'building' | 'ready' | 'error';
  repoFullName: string | null;
  repoUrl: string | null;
  vercelProject: string | null;
  vercelDeploymentId: string | null;
  url: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SiteVersion {
  version: number;
  config: SiteConfig;
  summary: string;
  createdAt: string;
}

/** Timestamps that a status change sets the first time it happens. */
export function statusTimestamps(
  current: { pitchSentAt: string | null; liveAt: string | null },
  status: ProjectStatus | undefined,
  now: string,
): { pitchSentAt?: string; liveAt?: string } {
  const out: { pitchSentAt?: string; liveAt?: string } = {};
  if ((status === 'pitch_sent' || status === 'client_approved') && !current.pitchSentAt) out.pitchSentAt = now;
  if (status === 'live' && !current.liveAt) out.liveAt = now;
  return out;
}

export function byNewest(a: Project, b: Project): number {
  return b.createdAt.localeCompare(a.createdAt);
}
