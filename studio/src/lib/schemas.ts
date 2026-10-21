import { z } from 'zod';
import { PRESET_IDS, PROJECT_STATUSES, SITE_TYPES } from './types';

/*
 * The checks for project forms and settings. Kept apart from types.ts, which
 * client components import: zod would otherwise go into every page's bundle.
 */

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
    name: trimmed(80).min(1),
    businessType: trimmed(60).min(1),
    preset: z.enum(PRESET_IDS),
    siteType: z.enum(SITE_TYPES),
    headline: trimmed(120),
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
