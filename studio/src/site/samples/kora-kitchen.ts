import type { Section, SiteConfig } from '../schema';
import { themeFromPreset } from '../theme';

/*
 * Hand-written proof that a full showcase site renders from one config.
 * Photos are left empty on purpose: the striped placeholders say what
 * should go there until client photos or stock images are added.
 */

const nav = (id: string): Section => ({
    id,
    type: 'navbar',
    variant: 'inline',
    content: {
      brand: 'Kora Kitchen',
      links: [
        { label: 'Menu', href: '/menu' },
        { label: 'Our story', href: '/about' },
        { label: 'Visit', href: '/contact' },
      ],
      cta: { label: 'Book a table', href: '/contact' },
    },
});

const footer = (id: string): Section => ({
    id,
    type: 'footer',
    variant: 'columns',
    content: {
      brand: 'Kora Kitchen',
      tagline: 'Slow-cooked family recipes from Amara’s kitchen in Old Town.',
      links: [
        { label: 'Menu', href: '/menu' },
        { label: 'Our story', href: '/about' },
        { label: 'Visit and book', href: '/contact' },
      ],
      instagram: '@korakitchen',
      whatsapp: '+1 555 214 0090',
      note: '© 2026 Kora Kitchen · 14 Mill Lane, Old Town',
    },
});

const whatsapp = (id: string): Section => ({
    id,
    type: 'whatsapp-float',
    variant: 'pill',
    content: { number: '+1 555 214 0090', message: 'Hi Kora Kitchen, I’d like to book a table.', label: 'Book on WhatsApp' },
});

const photo = (alt: string) => ({ src: '', alt });

export const KORA_KITCHEN: SiteConfig = {
  schemaVersion: 1,
  meta: {
    businessName: 'Kora Kitchen',
    description: 'Family-run restaurant in Old Town serving slow-cooked West African recipes, lunch and dinner, six days a week.',
    language: 'en',
  },
  theme: themeFromPreset('warm-table'),
  modules: { 'contact-form': true, 'whatsapp-ordering': true },
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
          variant: 'split-photo',
          content: {
            eyebrow: 'Old Town · since 2014',
            heading: 'Slow-cooked family recipes, served warm',
            subheading:
              'Jollof that’s had all afternoon, suya off the grill and stews from Amara’s grandmother’s notebook. Lunch and dinner, Tuesday to Sunday.',
            primaryCta: { label: 'Book a table', href: '/contact' },
            secondaryCta: { label: 'See the menu', href: '/menu' },
            image: photo('close-up of smoky jollof rice in a clay bowl'),
          },
        },
        {
          id: 'home-about',
          type: 'about',
          variant: 'split',
          content: {
            eyebrow: 'Our kitchen',
            heading: 'Twelve tables, one long stove',
            body: [
              'Kora Kitchen started as Sunday lunches for neighbours. Ten years on it’s still Amara at the stove and her brother Kofi at the door.',
              'Everything is cooked from scratch each morning, so when a pot runs out, it’s gone for the day.',
            ],
            image: photo('Amara plating in the open kitchen'),
            signature: 'Amara & Kofi',
          },
        },
        {
          id: 'home-dishes',
          type: 'features',
          variant: 'cards',
          content: {
            eyebrow: 'Most ordered',
            heading: 'Start with these',
            intro: 'Three dishes regulars come back for. The full menu changes a little with the market.',
            items: [
              { title: 'Party jollof', text: 'Smoky tomato rice, fried plantain and slaw.', price: '$16', image: photo('jollof rice with plantain') },
              { title: 'Beef suya', text: 'Grilled skewers, yaji spice, red onion and tomato.', price: '$18', image: photo('suya skewers on a board') },
              { title: 'Egusi stew', text: 'Melon seed and spinach stew with pounded yam.', price: '$19', image: photo('egusi stew with pounded yam') },
            ],
          },
        },
        {
          id: 'home-reviews',
          type: 'testimonials',
          variant: 'quotes',
          content: {
            heading: 'What our regulars say',
            items: [
              { quote: 'The jollof is the real thing. We drive across town for Sunday lunch.', name: 'Tobi A.', detail: 'Google review' },
              { quote: 'Warm room, generous plates and Kofi remembers everyone’s order.', name: 'Grace M.', detail: 'Regular since 2019' },
              { quote: 'Booked the party trays for my mum’s 60th. Forty guests, not a grain left.', name: 'Femi O.', detail: 'Catering customer' },
            ],
            rating: 4.8,
            ratingCount: '212 Google reviews',
          },
        },
        {
          id: 'home-gallery',
          type: 'gallery',
          variant: 'portrait-grid',
          content: {
            heading: 'Inside Kora',
            intro: '',
            images: [photo('the dining room at dusk'), photo('pepper soup being ladled'), photo('fresh puff-puff'), photo('a table of friends sharing')],
          },
        },
        {
          id: 'home-cta',
          type: 'cta',
          variant: 'banner',
          content: {
            heading: 'Saturday nights fill up fast',
            text: 'Message us on WhatsApp to hold a table, or walk in for lunch.',
            button: { label: 'Book a table', href: '/contact' },
            secondary: { label: 'See the menu', href: '/menu' },
          },
        },
        footer('home-footer'),
        whatsapp('home-whatsapp'),
      ],
    },
    {
      id: 'menu',
      path: '/menu',
      title: 'Menu',
      sections: [
        nav('menu-nav'),
        {
          id: 'menu-hero',
          type: 'hero',
          variant: 'centered',
          content: {
            eyebrow: 'Menu',
            heading: 'Cooked this morning',
            subheading: 'Prices include service. Ask us about spice levels; we’re happy to tone it down or turn it up.',
            image: photo('the pass with plates ready to go out'),
          },
        },
        {
          id: 'menu-starters',
          type: 'features',
          variant: 'price-list',
          content: {
            eyebrow: 'To start',
            heading: 'Small plates',
            intro: '',
            items: [
              { title: 'Puff-puff', text: 'Sweet fried dough, cinnamon sugar.', price: '$6' },
              { title: 'Pepper soup', text: 'Goat, uziza and scent leaf broth.', price: '$9' },
              { title: 'Kelewele', text: 'Spiced fried plantain, roasted peanuts.', price: '$7' },
              { title: 'Moi moi', text: 'Steamed bean pudding with egg and peppers.', price: '$8' },
            ],
          },
        },
        {
          id: 'menu-mains',
          type: 'features',
          variant: 'price-list',
          content: {
            eyebrow: 'Mains',
            heading: 'From the stove and grill',
            intro: '',
            items: [
              { title: 'Party jollof', text: 'Smoky tomato rice, plantain, slaw. Add chicken $5.', price: '$16' },
              { title: 'Beef suya', text: 'Grilled skewers, yaji spice, onion and tomato.', price: '$18' },
              { title: 'Egusi stew', text: 'Melon seed and spinach, pounded yam or rice.', price: '$19' },
              { title: 'Grilled tilapia', text: 'Whole fish, pepper sauce, banku.', price: '$24' },
              { title: 'Red red', text: 'Black-eyed bean stew, fried plantain. Vegan.', price: '$14' },
            ],
          },
        },
        {
          id: 'menu-cta',
          type: 'cta',
          variant: 'boxed',
          content: {
            heading: 'Feeding a group?',
            text: 'Party trays for 10 to 40 people with two days’ notice.',
            button: { label: 'Ask on WhatsApp', href: 'https://wa.me/15552140090' },
          },
        },
        footer('menu-footer'),
        whatsapp('menu-whatsapp'),
      ],
    },
    {
      id: 'about',
      path: '/about',
      title: 'Our story',
      sections: [
        nav('about-nav'),
        {
          id: 'about-story',
          type: 'about',
          variant: 'statement',
          content: {
            eyebrow: 'Our story',
            heading: 'A notebook of recipes and a very big pot',
            body: [
              'Amara learned to cook from her grandmother’s handwritten notebook, the one still on the shelf above the stove.',
              'Kora Kitchen opened in 2014 with six tables and a menu of four dishes. We’ve grown a little, but the cooking hasn’t changed: slow, generous and made from scratch every day.',
            ],
            image: photo('the recipe notebook'),
            signature: 'Amara Osei, chef and owner',
          },
        },
        {
          id: 'about-stats',
          type: 'stats',
          variant: 'row',
          content: {
            heading: '',
            items: [
              { value: '10', label: 'years on Mill Lane' },
              { value: '4.8', label: 'average on Google' },
              { value: '6 hrs', label: 'for a pot of jollof' },
            ],
          },
        },
        {
          id: 'about-gallery',
          type: 'gallery',
          variant: 'masonry',
          content: {
            heading: 'The people and the place',
            intro: '',
            images: [
              photo('Amara at the stove'),
              photo('Kofi greeting guests'),
              photo('spice jars on open shelves'),
              photo('the front window on Mill Lane'),
              photo('Sunday lunch service'),
              photo('hands rolling puff-puff'),
            ],
          },
        },
        footer('about-footer'),
        whatsapp('about-whatsapp'),
      ],
    },
    {
      id: 'contact',
      path: '/contact',
      title: 'Visit',
      sections: [
        nav('contact-nav'),
        {
          id: 'contact-details',
          type: 'contact',
          variant: 'map-and-hours',
          content: {
            heading: 'Come and eat',
            intro: 'Walk-ins welcome at lunch. For dinner, message us on WhatsApp and we’ll hold a table.',
            address: '14 Mill Lane, Old Town',
            phone: '+1 555 214 0090',
            whatsapp: '+1 555 214 0090',
            email: 'hello@korakitchen.com',
            hours: [
              { days: 'Tue to Thu', time: '12:00 to 22:00' },
              { days: 'Fri and Sat', time: '12:00 to 23:00' },
              { days: 'Sunday', time: '12:00 to 18:00' },
              { days: 'Monday', time: 'Closed' },
            ],
            mapQuery: '',
          },
        },
        {
          id: 'contact-faq',
          type: 'faq',
          variant: 'accordion',
          content: {
            heading: 'Good to know',
            intro: 'Anything else, just ask on WhatsApp.',
            items: [
              { question: 'Do you take bookings?', answer: 'Yes, for dinner. Send us a WhatsApp with the day, time and number of people.' },
              { question: 'Is there vegetarian food?', answer: 'Red red, kelewele and the jollof (without chicken) are all vegetarian, and red red is vegan.' },
              { question: 'Can you cater an event?', answer: 'We do party trays for 10 to 40 people with two days’ notice.' },
              { question: 'Is there parking?', answer: 'There’s a public car park two minutes away on Station Road.' },
            ],
          },
        },
        footer('contact-footer'),
        whatsapp('contact-whatsapp'),
      ],
    },
  ],
};
