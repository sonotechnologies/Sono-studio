import type { PresetId, Project, ProjectStatus, SiteType } from '../types';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

interface Sample {
  slug: string;
  name: string;
  businessType: string;
  siteType: SiteType;
  preset: PresetId;
  status: ProjectStatus;
  headline: string;
  ownerName: string;
  whatsapp: string;
  instagram: string;
  address: string;
  notes?: string;
  createdAgo: number;
  sentAgo?: number;
  openedAgo?: number;
  liveAgo?: number;
}

/** The sample businesses from the Studio App design, with times relative to now. */
const SAMPLES: Sample[] = [
  { slug: 'kora-kitchen-7k2q', name: 'Kora Kitchen', businessType: 'Restaurant', siteType: 'booking', preset: 'warm-table', status: 'pitch_sent', headline: 'Slow-cooked family recipes', ownerName: 'Amara Osei', whatsapp: '+1 555 214 0090', instagram: '@korakitchen', address: '14 Mill Lane, Old Town', notes: 'Met Amara at the Saturday market. Wants online bookings before December. Prefers WhatsApp.', createdAgo: 4 * DAY, sentAgo: 2 * DAY, openedAgo: 2 * HOUR },
  { slug: 'maison-lune-p4tx', name: 'Maison Lune', businessType: 'Hotel', siteType: 'booking', preset: 'luxe-minimal', status: 'client_approved', headline: 'Twelve rooms by the harbour', ownerName: 'Claire Duval', whatsapp: '+1 555 870 4412', instagram: '@maisonlune', address: '2 Quai des Pêcheurs', createdAgo: 12 * DAY, sentAgo: 6 * DAY, openedAgo: 1.2 * DAY },
  { slug: 'studio-nala-m8wd', name: 'Studio Nala', businessType: 'Salon', siteType: 'booking', preset: 'luxe-minimal', status: 'draft', headline: 'Hair, colour and quiet', ownerName: 'Nala Mensah', whatsapp: '+1 555 330 9021', instagram: '@studionala', address: '88 Rose Street', createdAgo: 1 * DAY },
  { slug: 'kick-lab-r2hc', name: 'Kick Lab', businessType: 'Streetwear', siteType: 'store', preset: 'bold-street', status: 'live', headline: 'Drop 07 is live', ownerName: 'Dev Patel', whatsapp: '+1 555 640 7781', instagram: '@kicklab', address: 'Unit 4, Canal Yard', createdAgo: 21 * DAY, sentAgo: 15 * DAY, openedAgo: 10 * DAY, liveAgo: 7 * DAY },
  { slug: 'crumb-and-co-b6ne', name: 'Crumb & Co', businessType: 'Bakery', siteType: 'showcase', preset: 'warm-table', status: 'pitch_sent', headline: 'Bread out by 7am', ownerName: 'Hannah Reyes', whatsapp: '+1 555 112 5530', instagram: '@crumbandco', address: '5 Baker Row', createdAgo: 6 * DAY, sentAgo: 5 * DAY },
  { slug: 'wanderly-travel-q9fa', name: 'Wanderly Travel', businessType: 'Travel agency', siteType: 'showcase', preset: 'clean-corporate', status: 'pitch_sent', headline: 'Trips planned end to end', ownerName: 'Marcus Bell', whatsapp: '+1 555 909 2214', instagram: '@wanderlytravel', address: '201 King Street', createdAgo: 9 * DAY, sentAgo: 8 * DAY, openedAgo: 6 * DAY },
  { slug: 'volt-supply-h3vk', name: 'Volt Supply', businessType: 'Gadget store', siteType: 'store', preset: 'tech-dark', status: 'draft', headline: 'The new X2 is here', ownerName: 'Ken Ito', whatsapp: '+1 555 458 3301', instagram: '@voltsupply', address: 'Level 2, Metro Mall', createdAgo: 2 * DAY },
  { slug: 'bloom-rituals-x7pe', name: 'Bloom Rituals', businessType: 'Wellness studio', siteType: 'booking', preset: 'soft-studio', status: 'client_approved', headline: 'Slow down, glow up', ownerName: 'Priya Shah', whatsapp: '+1 555 276 6650', instagram: '@bloomrituals', address: '17 Garden Walk', createdAgo: 10 * DAY, sentAgo: 4 * DAY, openedAgo: 3 * HOUR },
  { slug: 'threadline-k5mu', name: 'Threadline', businessType: 'Fashion boutique', siteType: 'store', preset: 'luxe-minimal', status: 'live', headline: 'Autumn, made slowly', ownerName: 'Ines Moreau', whatsapp: '+1 555 781 0043', instagram: '@threadline', address: '40 Arcade Lane', createdAgo: 28 * DAY, sentAgo: 24 * DAY, openedAgo: 20 * DAY, liveAgo: 14 * DAY },
];

export function devSeed(now: number = Date.now()): Project[] {
  const at = (ago?: number) => (ago === undefined ? null : new Date(now - ago).toISOString());
  return SAMPLES.map((s, i) => {
    const created = at(s.createdAgo)!;
    return {
      id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
      name: s.name,
      businessType: s.businessType,
      siteType: s.siteType,
      preset: s.preset,
      headline: s.headline,
      status: s.status,
      pitchSlug: s.slug,
      pitchPaused: false,
      pitchBanner: true,
      pitchExpiryDays: 30,
      currentVersion: null,
      thumbnailUrl: null,
      liveUrl: s.status === 'live' ? `https://${s.slug.replace(/-[a-z0-9]{4}$/, '')}.vercel.app` : null,
      repoUrl: null,
      pitchSentAt: at(s.sentAgo),
      lastOpenedAt: at(s.openedAgo),
      liveAt: at(s.liveAgo),
      createdAt: created,
      updatedAt: created,
      client: {
        ownerName: s.ownerName,
        whatsapp: s.whatsapp,
        instagram: s.instagram,
        address: s.address,
        notes: s.notes ?? '',
      },
    };
  });
}
