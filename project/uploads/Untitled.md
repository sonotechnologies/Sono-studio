# Sono Studio: Design Brief

Oct 10, 2026 · @Sono Technologies

Sono Studio wears the Sono Technologies brand: warm paper and ink with one terracotta accent, set in Space Grotesk, with a light and dark theme. The interface stays quiet so the site being built is always the loudest thing on screen. What it does and how it is built is in the separate Build Brief.

## Brand foundations

These values come straight from your logo files.

| Element | Value | Use |
| --- | --- | --- |
| Ink | `#16140F` | Text on light theme, background on dark theme |
| Paper | `#F7F5F1` | Background on light theme, text on dark theme |
| Terracotta | `#B4502E` | The single accent: primary buttons, active states, links, progress |
| Typeface | Space Grotesk | All interface text; medium weight (500) for labels, as in the logo |
| Code typeface | A monospace such as JetBrains Mono or Space Mono | Code view and config values only |

**Logo use**

- Top-left of the app: the horizontal lockup on wide screens, the two-ring mark alone when the sidebar is collapsed and on phones.
- Use the inverse files on the dark theme. Do not recolour the rings: one stays ink (or paper), one stays terracotta.
- Browser tab: the supplied favicon.
- The product name "Studio" sits beside the lockup in Space Grotesk 500, uppercase and letter-spaced, echoing the TECHNOLOGIES line in the stacked logo.

**Shape language**

The logo is built from heavy circles and straight strokes. Carry that through with fully round pills for status chips and toggles, generous radii on cards (12 to 16px), and thick, simple line icons.

## Themes

Both themes are warm, never pure black or pure white. The neutral steps below are proposed tints of ink and paper; adjust them by eye once on screen.

| Token | Light | Dark |
| --- | --- | --- |
| Background | `#F7F5F1` | `#16140F` |
| Surface (cards, panels) | `#FFFFFF` | `#1F1C16` |
| Surface raised (menus, dialogs) | `#FFFFFF` | `#29251D` |
| Border | `#E4E0D8` | `#353027` |
| Text | `#16140F` | `#F7F5F1` |
| Text muted | `#6B665C` | `#A39D90` |
| Accent (fills) | `#B4502E` | `#B4502E` |
| Accent text and links | `#B4502E` | `#DB7C58` |
| Text on accent | `#FFFFFF` | `#FFFFFF` |
| Success | `#3F7D58` | `#6FB58C` |
| Warning | `#B7791F` | `#E0A94A` |
| Danger | `#B3261E` | `#EF7A72` |

- Terracotta as a fill is the same in both themes. As small text on the dark background it is too dim, so links and accent text use the lighter tint there.
- The theme follows the device setting by default, with a toggle in the top bar that remembers your choice.
- The area around the site preview is a neutral mid-tone in both themes, so the generated site is never judged against the app's own colours.

## Design principles

- **The site is the hero.** Panels are flat and quiet; the preview gets the most space and the only strong imagery.
- **One accent.** Terracotta marks the single most important action on each screen. If two things are terracotta, one of them is wrong.
- **Dense where you work, airy where you choose.** The workspace is compact like a pro tool. The dashboard and wizard are spacious.
- **Always show what the AI is doing.** Generation is a visible list of steps, not a spinner.
- **Looks good on camera.** Large clear type, strong contrast and tidy states, so screen recordings for Instagram read well at phone size.

## Screens

### App shell

- Slim left sidebar: logo, Projects, Library, Presets, Settings. It collapses to icons, with the two-ring mark at the top.
- Top bar: page title, search, theme toggle, and one terracotta "New site" button.

### Login

- Centred stacked logo on paper, one email and password form, nothing else.

### Dashboard

- A row of four counts across the top: Draft, Pitch sent, Client approved, Live. Each is clickable as a filter.
- Project cards in a grid: site thumbnail filling the top, business name, site type, status pill, and a small line such as "Opened 2 hours ago" or "Not opened yet".
- Search, filters for status and type, and a "Needs follow-up" filter.
- Empty state: the ring mark, one line of text and the "New site" button.

### New site wizard

- Full-screen, one question group per step, with a step indicator made of small rings that fill terracotta as you go.
- Site type and style preset are chosen from large visual cards, not dropdowns.
- The content step is a big drop area for photos, logo and price lists, plus a paste box.
- The final step summarises every choice with an edit link beside each, and one "Generate" button.

### Generation and plan review

- A vertical list of pipeline steps, each ticking off with its status and the model used, shown small and muted.
- The plan appears as a page-by-page outline of section cards that you can drag to reorder, remove or add to before content is written.

### Workspace

- Three areas: section list on the left, preview in the centre, a right panel that switches between Chat, Edit and Theme.
- Preview toolbar: page switcher, desktop, tablet and phone widths, undo and redo, version history, and Share, Export and Deploy on the right. Deploy is the terracotta button.
- Hovering a section in the preview outlines it in terracotta with a small label; clicking selects it and opens its options in the Edit panel.
- Text edits happen in place in the preview. Image clicks open the media library.
- Chat shows which scope it will change (site, page or selected section) as a pill above the input.

### Project details

- Client record, notes, pitch link with copy button, pause and expiry controls.
- An activity list of pitch opens with time and device, and deployments with their links.

### Library and Presets

- Library: a visual catalogue of every section and its variants, grouped by type.
- Presets: one card per style preset showing its colours, font pairing and a small sample layout.

### Settings

- AI providers: one row per provider with key status, tier order by drag, and a usage bar for today.
- Connections: GitHub, Vercel, Supabase, stock photo keys.
- Pitch defaults: banner on by default with a per-project switch, contact details shown.

### Pitch page (what the business sees)

- The generated site at full size with no Sono Studio interface.
- An optional slim banner at the bottom: "Concept by Sono Technologies" with WhatsApp and Instagram buttons. It uses ink, paper and terracotta so it reads as yours without fighting the site's own style.

## Components

| Component | Notes |
| --- | --- |
| Buttons | Primary (terracotta fill, white text), secondary (border only), ghost (text only), danger. One primary per screen |
| Inputs | Paper or surface fill, 1px border, terracotta focus ring, label above in 500 weight |
| Status pills | Fully round. Draft: muted neutral. Pitch sent: warning tone. Client approved: terracotta. Live: success tone |
| Project card | Thumbnail, name, type, status pill, last-opened line; lifts slightly on hover |
| Choice cards | Large selectable cards for site type and preset; selected state has a terracotta border and a ring tick |
| Step indicator | Small rings that fill as steps complete |
| Chat bubbles | Your messages on surface raised; AI replies plain with a small ring mark; each AI change shows an "Undo this change" link |
| Section outline | Terracotta outline and label on hover and select in the preview |
| Panels and tabs | Underline tabs, with the active one in terracotta |
| Toasts | Bottom-right, short, with an action such as "Copy link" or "View site" |
| Usage bar | Thin bar per provider; turns warning tone near its limit |
| Dialogs | Used only for destructive or irreversible actions such as delete and deploy |

**Type scale:** 12, 14 (body in the workspace), 16 (body elsewhere), 20, 28, 40 for dashboard counts and wizard questions. Headings use weight 500 to 700 with slightly tight letter spacing.

**Spacing:** a 4px base, with 8, 12, 16, 24, 32 and 48 as the working steps.

**Icons:** one line-icon set such as Lucide, at a 2px stroke to match the weight of the logo.

## Motion

- **Generation.** The two rings of the logo rotate slowly around each other as the loading mark. Pipeline steps tick off one by one, and sections fade into the preview in order as they are filled. This is the moment to make memorable, because it is what you will record.
- **Edits.** A changed section flashes a brief terracotta outline so you can see what the AI touched.
- **Navigation.** Panels slide 150 to 200ms with an ease-out curve. Nothing bounces.
- **Feedback.** Buttons press down slightly; copied links show a tick for a second.
- **Reduced motion.** With the device's reduced-motion setting on, all of the above become simple fades.

## Site style presets

Presets are what stop generated sites looking alike. Each one is a complete direction: colour roles, a font pairing, corner radius, spacing rhythm, image treatment, and which section variants it prefers. Brand colours you enter replace the preset's colours; everything else stays.

A proposed starting set of six. The fonts are all free on Google Fonts.

| Preset | Feel | Fonts (heading / body) | Shape and imagery | Suits |
| --- | --- | --- | --- | --- |
| Luxe Minimal | Quiet, expensive, lots of space | Cormorant Garamond / Inter | Sharp corners, thin lines, large full-bleed photos | Hotels, salons, fashion boutiques |
| Bold Street | Loud, high contrast, oversized type | Anton / Space Grotesk | Square corners, heavy borders, cut-out product shots | Streetwear, sneakers, youth brands |
| Warm Table | Friendly, appetising, earthy colours | Fraunces / DM Sans | Soft rounded corners, close-up food photos | Restaurants, food delivery, bakeries |
| Clean Corporate | Trustworthy, ordered, calm blues and greys | Manrope / Manrope | Medium radius, icons and diagrams over photos | Travel agencies, co-operatives, services |
| Tech Dark | Sleek, dark background, glowing accents | Sora / Inter | Large radius, product renders on dark, subtle gradients | Gadget stores, apps, electronics |
| Soft Studio | Light, airy, pastel tones | Playfair Display / Nunito Sans | Pill shapes, rounded image masks | Beauty, wellness, events |

**Build order:** Warm Table, Luxe Minimal and Bold Street first, since they cover food, hotels, salons and fashion. Clean Corporate, Tech Dark and Soft Studio follow.

**Each preset needs**

- A light and, where it suits, a dark colour set with roles: background, surface, text, muted text, primary, accent.
- Heading and body sizes for phone and desktop.
- Button, card and input styles.
- A preferred variant for hero, product or service cards, and gallery.
- One sample home page to use as its card in the preset picker.

**Reference input**

When a logo, screenshot or link is given, show the extracted colours as swatches beside the chosen preset with a before and after preview, so applying them is a deliberate choice.

## Responsive and accessibility

- **Desktop (1280px and up):** the full three-area workspace. This is the main working size.
- **Tablet (768 to 1279px):** the section list collapses to a drawer; preview and right panel stay.
- **Phone (under 768px):** dashboard, project details, pitch link sharing, text and image edits and chat all work. Preview is full width with Chat, Edit and Theme as a bottom sheet. Building a new site from a phone is supported but not the priority.
- **Contrast:** body text meets WCAG AA (4.5:1) in both themes. Terracotta on paper is close to that limit, so use it for buttons, links and larger text, not for small muted labels. On the dark theme use the lighter accent tint for text.
- **Focus:** every interactive element has a visible terracotta focus ring.
- **Touch targets:** at least 44px on phone.
- **Status is never colour alone:** pills carry a text label, and usage bars carry a number.

## Deliverables

What the design phase should produce before or alongside the build:

- [ ] Colour and type tokens for both themes as CSS variables and a Tailwind config
- [ ] Component sheet covering every item in Components, with hover, focus, disabled and loading states
- [ ] High-fidelity screens in light and dark: Dashboard, Wizard (3 key steps), Generation and plan review, Workspace, Project details, Settings
- [ ] Phone layouts for Dashboard, Project details and Workspace
- [ ] The ring loading animation
- [ ] Six style presets, each with tokens and one sample home page
- [ ] Pitch page banner in light and dark
