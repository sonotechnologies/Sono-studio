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
  getSettings(): Promise<StudioSettings>;
  updateSettings(settings: StudioSettings): Promise<void>;
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
