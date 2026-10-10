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
  getSettings(): Promise<StudioSettings>;
  updateSettings(settings: StudioSettings): Promise<void>;
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
