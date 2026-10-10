import { z } from 'zod';

export const PROJECT_STATUSES = ['draft', 'pitch_sent', 'client_approved', 'live'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const STATUS_LABELS: Record<ProjectStatus, string> = {
  draft: 'Draft',
  pitch_sent: 'Pitch sent',
  client_approved: 'Client approved',
  live: 'Live',
};

export const SITE_TYPES = ['showcase', 'store', 'booking'] as const;
export type SiteType = (typeof SITE_TYPES)[number];

export const SITE_TYPE_LABELS: Record<SiteType, string> = {
  showcase: 'Showcase',
  store: 'Online store',
  booking: 'Booking',
};

export const PRESET_IDS = [
  'warm-table',
  'luxe-minimal',
  'bold-street',
  'clean-corporate',
  'tech-dark',
  'soft-studio',
] as const;
export type PresetId = (typeof PRESET_IDS)[number];

/** Pitch link lifetime in days; null means it never expires. */
export const PITCH_EXPIRY_OPTIONS = [7, 30, 90, null] as const;
export type PitchExpiryDays = (typeof PITCH_EXPIRY_OPTIONS)[number];

export interface Client {
  ownerName: string;
  whatsapp: string;
  instagram: string;
  address: string;
  notes: string;
}

export interface Project {
  id: string;
  name: string;
  businessType: string;
  siteType: SiteType;
  preset: PresetId;
  headline: string;
  status: ProjectStatus;
  pitchSlug: string;
  pitchPaused: boolean;
  pitchBanner: boolean;
  pitchExpiryDays: PitchExpiryDays;
  currentVersion: number | null;
  thumbnailUrl: string | null;
  liveUrl: string | null;
  repoUrl: string | null;
  pitchSentAt: string | null;
  lastOpenedAt: string | null;
  liveAt: string | null;
  createdAt: string;
  updatedAt: string;
  client: Client;
}

export interface StudioSettings {
  bannerDefault: boolean;
  bannerWhatsapp: string;
  bannerInstagram: string;
}

export const DEFAULT_SETTINGS: StudioSettings = {
  bannerDefault: true,
  bannerWhatsapp: '',
  bannerInstagram: '',
};

const trimmed = (max: number) => z.string().trim().max(max);

export const newProjectSchema = z.object({
  name: trimmed(80).min(1, 'Enter the business name'),
  businessType: trimmed(60).min(1, 'Enter the kind of business'),
  siteType: z.enum(SITE_TYPES),
  preset: z.enum(PRESET_IDS),
  headline: trimmed(120),
  client: z.object({
    ownerName: trimmed(80),
    whatsapp: trimmed(32),
    instagram: trimmed(60),
    address: trimmed(160),
    notes: trimmed(4000),
  }),
});
export type NewProjectInput = z.infer<typeof newProjectSchema>;

export const clientPatchSchema = z
  .object({
    ownerName: trimmed(80),
    whatsapp: trimmed(32),
    instagram: trimmed(60),
    address: trimmed(160),
    notes: trimmed(4000),
  })
  .partial();
export type ClientPatch = z.infer<typeof clientPatchSchema>;

export const projectPatchSchema = z
  .object({
    status: z.enum(PROJECT_STATUSES),
    pitchPaused: z.boolean(),
    pitchBanner: z.boolean(),
    pitchExpiryDays: z.union([z.literal(7), z.literal(30), z.literal(90), z.null()]),
  })
  .partial();
export type ProjectPatch = z.infer<typeof projectPatchSchema>;

export const settingsSchema = z.object({
  bannerDefault: z.boolean(),
  bannerWhatsapp: trimmed(32),
  bannerInstagram: trimmed(60),
});
