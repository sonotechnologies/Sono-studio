import type { PresetId, Project } from '@/lib/types';
import type { Section, SectionType, SiteConfig, VariantOf } from './schema';
import { themeFromPreset } from './theme';

/** Which variant each preset prefers, so two sites with the same sections still look different. */
type Preferred = { [T in SectionType]?: VariantOf<T> };

export const PREFERRED_VARIANTS: Record<PresetId, Preferred> = {
  'warm-table': { navbar: 'inline', hero: 'split-photo', about: 'split', features: 'cards', gallery: 'portrait-grid', testimonials: 'quotes', cta: 'banner', contact: 'map-and-hours', footer: 'columns', faq: 'accordion', stats: 'row' },
  'luxe-minimal': { navbar: 'centered', hero: 'full-bleed', about: 'statement', features: 'numbered', gallery: 'strip', testimonials: 'rating-strip', cta: 'split', contact: 'map-and-hours', footer: 'simple', faq: 'two-column', stats: 'row' },
  'bold-street': { navbar: 'inline', hero: 'oversized-type', about: 'split', features: 'cards', gallery: 'portrait-grid', testimonials: 'cards', cta: 'boxed', contact: 'card', footer: 'simple', faq: 'accordion', stats: 'cards' },
  'clean-corporate': { navbar: 'inline', hero: 'split-photo', about: 'split', features: 'numbered', gallery: 'masonry', testimonials: 'cards', cta: 'boxed', contact: 'map-and-hours', footer: 'columns', faq: 'two-column', stats: 'cards' },
  'tech-dark': { navbar: 'inline', hero: 'centered', about: 'statement', features: 'cards', gallery: 'masonry', testimonials: 'cards', cta: 'banner', contact: 'card', footer: 'columns', faq: 'accordion', stats: 'cards' },
  'soft-studio': { navbar: 'centered', hero: 'split-photo', about: 'split', features: 'price-list', gallery: 'masonry', testimonials: 'rating-strip', cta: 'split', contact: 'card', footer: 'simple', faq: 'accordion', stats: 'row' },
};

function variant<T extends SectionType>(preset: PresetId, type: T, fallback: VariantOf<T>): VariantOf<T> {
  return (PREFERRED_VARIANTS[preset][type] as VariantOf<T> | undefined) ?? fallback;
}

const photo = (alt: string) => ({ src: '', alt });

/**
 * A complete, valid version 1 built from the project record alone. Copy is
 * deliberately plain placeholder text for the AI fill step (phase 3) or for
 * editing by hand to replace.
 */
export function starterConfig(project: Pick<Project, 'name' | 'businessType' | 'headline' | 'preset' | 'client'>): SiteConfig {
  const { name, businessType, preset, client } = project;
  const kind = businessType.toLowerCase() || 'business';
  const wa = client.whatsapp;
  const v = <T extends SectionType>(t: T, f: VariantOf<T>) => variant(preset, t, f);

  const nav = (id: string): Section => ({
    id,
    type: 'navbar',
    variant: v('navbar', 'inline'),
    content: {
      brand: name,
      links: [
        { label: 'About', href: '/#about' },
        { label: 'What we offer', href: '/#offer' },
        { label: 'Contact', href: '/contact' },
      ],
      cta: { label: 'Get in touch', href: '/contact' },
    },
  });
  const footer = (id: string): Section => ({
    id,
    type: 'footer',
    variant: v('footer', 'simple'),
    content: {
      brand: name,
      tagline: project.headline || `${businessType || 'Local business'}${client.address ? ` · ${client.address}` : ''}`,
      links: [
        { label: 'Home', href: '/' },
        { label: 'Contact', href: '/contact' },
      ],
      instagram: client.instagram,
      whatsapp: wa,
      note: `© ${new Date().getFullYear()} ${name}`,
    },
  });
  const float = (id: string): Section[] =>
    wa
      ? [
          {
            id,
            type: 'whatsapp-float',
            variant: v('whatsapp-float', 'bubble'),
            content: { number: wa, message: `Hi ${name}, I found you online.`, label: 'Chat with us' },
          },
        ]
      : [];

  return {
    schemaVersion: 1,
    meta: { businessName: name, description: `${name}, ${kind}${client.address ? ` at ${client.address}` : ''}.`, language: 'en' },
    theme: themeFromPreset(preset),
    modules: { 'contact-form': true },
    pages: [
      {
        id: 'home',
        path: '/',
        title: 'Home',
        sections: [
          nav('home-nav'),
          {
            id: 'home-hero',
            type: 'hero',
            variant: v('hero', 'split-photo'),
            content: {
              eyebrow: businessType,
              heading: project.headline || name,
              subheading: `A short line on what makes ${name} worth a visit.`,
              primaryCta: { label: 'Get in touch', href: '/contact' },
              secondaryCta: { label: 'What we offer', href: '/#offer' },
              image: photo(`main photo of ${name}`),
            },
          },
          {
            id: 'about',
            type: 'about',
            variant: v('about', 'split'),
            content: {
              eyebrow: 'About us',
              heading: `The story of ${name}`,
              body: ['Two or three sentences on how the business started and who runs it.', 'What customers can expect when they visit.'],
              image: photo('the owner or the team'),
              signature: client.ownerName,
            },
          },
          {
            id: 'offer',
            type: 'features',
            variant: v('features', 'cards'),
            content: {
              eyebrow: 'What we offer',
              heading: 'Our most popular',
              intro: 'A line introducing the menu, rooms, treatments or services.',
              items: [1, 2, 3].map((n) => ({ title: `Offer ${n}`, text: 'One sentence describing it.', price: '', image: photo(`offer ${n}`) })),
            },
          },
          {
            id: 'home-reviews',
            type: 'testimonials',
            variant: v('testimonials', 'quotes'),
            content: {
              heading: 'What customers say',
              items: [
                { quote: 'A real review from a happy customer goes here.', name: 'Customer name', detail: 'Google review' },
                { quote: 'A second review, ideally about something different.', name: 'Customer name', detail: 'Instagram' },
                { quote: 'A third short review.', name: 'Customer name', detail: 'Regular' },
              ],
              rating: 5,
              ratingCount: 'from Google reviews',
            },
          },
          {
            id: 'home-gallery',
            type: 'gallery',
            variant: v('gallery', 'portrait-grid'),
            content: { heading: 'Take a look', intro: '', images: [1, 2, 3, 4].map((n) => photo(`gallery photo ${n}`)) },
          },
          {
            id: 'home-cta',
            type: 'cta',
            variant: v('cta', 'banner'),
            content: {
              heading: `Visit ${name}`,
              text: 'One sentence asking people to book, order or come by.',
              button: { label: 'Get in touch', href: '/contact' },
              image: photo('inviting photo of the place'),
            },
          },
          footer('home-footer'),
          ...float('home-whatsapp'),
        ],
      },
      {
        id: 'contact',
        path: '/contact',
        title: 'Contact',
        sections: [
          nav('contact-nav'),
          {
            id: 'contact-details',
            type: 'contact',
            variant: v('contact', 'map-and-hours'),
            content: {
              heading: 'Find us',
              intro: 'How and when to reach us.',
              address: client.address,
              phone: wa,
              whatsapp: wa,
              email: '',
              hours: [
                { days: 'Mon to Fri', time: '9:00 to 18:00' },
                { days: 'Saturday', time: '10:00 to 16:00' },
              ],
              mapQuery: client.address,
            },
          },
          {
            id: 'contact-faq',
            type: 'faq',
            variant: v('faq', 'accordion'),
            content: {
              heading: 'Questions',
              intro: '',
              items: [
                { question: 'A question customers often ask?', answer: 'The answer.' },
                { question: 'Another common question?', answer: 'The answer.' },
              ],
            },
          },
          footer('contact-footer'),
          ...float('contact-whatsapp'),
        ],
      },
    ],
  };
}
