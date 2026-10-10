import type { ProviderId, StockProviderId, Tier } from '@/ai/types';
import type { Asset, Brief, GenerationJob } from '@/generate/brief';
import type { SiteConfig } from '@/site/schema';
import type {
  ClientPatch,
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
  updateSettings(settings: StudioSettings): Promise<void>;
}

export type KeyProvider = Exclude<ProviderId, 'demo'> | StockProviderId;

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
