import type { ContentOf, Section, SectionOf, SectionType, VariantOf } from './schema';
import type { RenderCtx } from './primitives';
import { About } from './sections/about';
import { Contact } from './sections/contact';
import { Cta } from './sections/cta';
import { Faq } from './sections/faq';
import { Features } from './sections/features';
import { Footer } from './sections/footer';
import { Gallery } from './sections/gallery';
import { Hero } from './sections/hero';
import { Navbar } from './sections/navbar';
import { Stats } from './sections/stats';
import { Testimonials } from './sections/testimonials';
import { WhatsappFloat } from './sections/whatsapp-float';
import { ProductDetail } from './sections/product-detail';
import { ProductFeature } from './sections/product-feature';
import { ProductGrid } from './sections/product-grid';
import { Booking } from './sections/booking';

export interface VariantInfo<T extends SectionType> {
  id: VariantOf<T>;
  label: string;
  note: string;
}

export interface SectionDef<T extends SectionType> {
  type: T;
  label: string;
  /** One line for the library and for the AI planner. */
  purpose: string;
  variants: VariantInfo<T>[];
  Component: (props: { section: SectionOf<T>; ctx: RenderCtx }) => React.ReactNode;
}

type Registry = { [T in SectionType]: SectionDef<T> };

/** The shared section library (version 1). Store, booking and showcase-only sections join in later phases. */
export const SECTIONS: Registry = {
  navbar: {
    type: 'navbar',
    label: 'Navbar',
    purpose: 'Business name or logo, page links and one call to action',
    variants: [
      { id: 'inline', label: 'Inline', note: 'Logo left, links and button right' },
      { id: 'centered', label: 'Centered', note: 'Large name centred, links below' },
    ],
    Component: Navbar,
  },
  hero: {
    type: 'hero',
    label: 'Hero',
    purpose: 'The first screen: headline, short pitch, main action and a strong photo',
    variants: [
      { id: 'split-photo', label: 'Split photo', note: 'Headline left, photo right' },
      { id: 'full-bleed', label: 'Full-bleed', note: 'Photo behind, text over' },
      { id: 'centered', label: 'Centered', note: 'Text centred, wide photo below' },
      { id: 'oversized-type', label: 'Oversized type', note: 'Headline fills the width' },
    ],
    Component: Hero,
  },
  about: {
    type: 'about',
    label: 'About',
    purpose: 'The story behind the business',
    variants: [
      { id: 'split', label: 'Photo and story', note: 'Photo beside a few paragraphs' },
      { id: 'statement', label: 'Statement', note: 'Centred text, no photo' },
    ],
    Component: About,
  },
  features: {
    type: 'features',
    label: 'Features or services',
    purpose: 'What the business offers: dishes, rooms, treatments or services, with prices if known',
    variants: [
      { id: 'cards', label: 'Cards', note: 'Image, name, price and a line each' },
      { id: 'numbered', label: 'Numbered list', note: 'Steps or services in order' },
      { id: 'price-list', label: 'Price list', note: 'Rows with dotted leaders' },
    ],
    Component: Features,
  },
  gallery: {
    type: 'gallery',
    label: 'Gallery',
    purpose: 'Photos of the place, the work or the products',
    variants: [
      { id: 'portrait-grid', label: 'Portrait grid', note: 'Four tall photos per row' },
      { id: 'masonry', label: 'Masonry', note: 'Mixed heights' },
      { id: 'strip', label: 'Wide strip', note: 'One row, edge to edge, swipeable' },
    ],
    Component: Gallery,
  },
  testimonials: {
    type: 'testimonials',
    label: 'Testimonials',
    purpose: 'What customers say',
    variants: [
      { id: 'quotes', label: 'Two quotes', note: 'Large quotes side by side' },
      { id: 'cards', label: 'Cards', note: 'Three short reviews' },
      { id: 'rating-strip', label: 'Rating strip', note: 'Stars, a count and one quote' },
    ],
    Component: Testimonials,
  },
  stats: {
    type: 'stats',
    label: 'Stats',
    purpose: 'Two to four numbers worth bragging about',
    variants: [
      { id: 'row', label: 'Row', note: 'Numbers over thin rules' },
      { id: 'cards', label: 'Cards', note: 'Each number in a card' },
    ],
    Component: Stats,
  },
  faq: {
    type: 'faq',
    label: 'FAQ',
    purpose: 'Answers to the questions customers ask on WhatsApp',
    variants: [
      { id: 'accordion', label: 'Accordion', note: 'Questions open one at a time' },
      { id: 'two-column', label: 'Two columns', note: 'All answers visible' },
    ],
    Component: Faq,
  },
  cta: {
    type: 'cta',
    label: 'Call to action',
    purpose: 'One clear next step: book, order, visit or message',
    variants: [
      { id: 'banner', label: 'Banner', note: 'Full-width band in the primary colour' },
      { id: 'split', label: 'Split', note: 'Text beside a photo' },
      { id: 'boxed', label: 'Boxed', note: 'Accent box with a button' },
    ],
    Component: Cta,
  },
  contact: {
    type: 'contact',
    label: 'Contact with map',
    purpose: 'Address, phone, WhatsApp, opening hours and a map',
    variants: [
      { id: 'map-and-hours', label: 'Map and hours', note: 'Details beside a map' },
      { id: 'card', label: 'Card', note: 'Details in a card with a WhatsApp button' },
    ],
    Component: Contact,
  },
  footer: {
    type: 'footer',
    label: 'Footer',
    purpose: 'Name, links and social accounts',
    variants: [
      { id: 'simple', label: 'Simple', note: 'One row' },
      { id: 'columns', label: 'Columns', note: 'Name and tagline, links, social' },
    ],
    Component: Footer,
  },
  'product-grid': {
    type: 'product-grid',
    label: 'Product grid',
    purpose: 'Products with photos, prices and add to cart; optionally one category, with category buttons',
    variants: [
      { id: 'cards', label: 'Cards', note: 'Framed cards with an add-to-cart button' },
      { id: 'minimal', label: 'Minimal', note: 'Photos with name and price, no frames' },
      { id: 'list', label: 'List', note: 'One product per row, for longer lists' },
    ],
    Component: ProductGrid,
  },
  'product-feature': {
    type: 'product-feature',
    label: 'Product spotlight',
    purpose: 'One product shown large: a launch, a bestseller or the dish of the week',
    variants: [
      { id: 'split', label: 'Split', note: 'Photo beside the details' },
      { id: 'centered', label: 'Centered', note: 'Photo above, details centred' },
    ],
    Component: ProductFeature,
  },
  'product-detail': {
    type: 'product-detail',
    label: 'Product page',
    purpose: 'A product’s own page; made automatically for every product',
    variants: [
      { id: 'gallery', label: 'Gallery', note: 'Large first photo, the rest in a grid' },
      { id: 'compact', label: 'Compact', note: 'Photos stacked in one column' },
    ],
    Component: ProductDetail,
  },
  booking: {
    type: 'booking',
    label: 'Booking',
    purpose: 'Online booking: services, free times, and a deposit or WhatsApp request',
    variants: [
      { id: 'steps', label: 'Steps', note: 'Heading above, booking steps below' },
      { id: 'split', label: 'Split', note: 'Heading beside the booking steps' },
    ],
    Component: Booking,
  },
  'whatsapp-float': {
    type: 'whatsapp-float',
    label: 'WhatsApp button',
    purpose: 'A floating button that opens a pre-filled WhatsApp chat',
    variants: [
      { id: 'bubble', label: 'Bubble', note: 'Round icon button' },
      { id: 'pill', label: 'Pill', note: 'Icon and label' },
    ],
    Component: WhatsappFloat,
  },
};

export const SECTION_TYPES = Object.keys(SECTIONS) as SectionType[];

export function renderSection(section: Section, ctx: RenderCtx): React.ReactNode {
  const def = SECTIONS[section.type] as SectionDef<SectionType>;
  return <def.Component section={section as never} ctx={ctx} />;
}

export type { ContentOf };
