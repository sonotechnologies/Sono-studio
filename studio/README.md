# Sono Studio

A private, single-user web app that generates Next.js websites for local businesses, refines them by chat and click-to-edit, and ships them as pitch links, one-click deploys or exported code.

The design reference lives in `../project/` (Claude Design export) and the briefs in `../project/uploads/` and the Build Brief.

## Status: Phases 1 to 3 done

### Phase 1, Foundation

| Built | Notes |
| --- | --- |
| Next.js 16 (App Router) + TypeScript + Tailwind 4 | Sono tokens from `project/tokens` as CSS variables in `src/app/globals.css` |
| Single login | Supabase email and password; no sign-up screen |
| Light and dark theme | Follows the device until toggled, then remembered; set before first paint |
| App shell | Collapsible sidebar (remembered), top bar with search, theme toggle and New site, bottom tabs on phones |
| Dashboard | Status counts as filters, type chips, search (top bar or in-page on phones), "Needs follow-up", empty state |
| Project details | Status menu, pitch link with copy, pause, banner and expiry controls, client record with editable fields and auto-saving notes, activity, delete with confirmation |
| Presets page | The six presets from `presets.json` |
| Settings | Pitch defaults (banner on by default, WhatsApp, Instagram) and sign out |

"Needs follow-up" means a pitch was sent and nothing has happened for 3 days since it was sent or last opened (`FOLLOW_UP_AFTER_DAYS` in `src/lib/format.ts`).

### Phase 2, Config and renderer

| Built | Notes |
| --- | --- |
| Site config schema | `src/site/schema.ts`: one JSON document per site (pages, ordered sections, content, theme, modules). Zod validates every section's content, links and ids, so bad AI output never reaches the preview |
| Theme tokens | `src/site/theme.ts` turns a preset (plus optional brand colours) into tokens and CSS variables. Button text colour is picked for contrast |
| Shared section library | 12 sections, 30 variants in `src/site/sections/`: navbar, hero, about, features or services, gallery, testimonials, stats, FAQ, call to action, contact with map, footer, WhatsApp button. Styled only through theme tokens; text and images carry `data-edit` markers for click-to-edit |
| Renderer | `SitePageView` renders any page of a config. Sections respond to the site frame's width (container queries), so the same markup works full-page, in a phone-width preview and in thumbnails |
| Proof site | `src/site/samples/kora-kitchen.ts`: a hand-written four-page showcase site. In the dev store it is Kora Kitchen's version 1 |
| Versions | Every save is a full snapshot (`site_versions`, migration `0002`) |
| Preview | `/preview/<project>` with page switcher and desktop, tablet and phone widths |
| Starter sites | "Create starter site" on a project builds version 1 from its details, using the section variants its preset prefers |
| Library page | Every section and variant rendered live, switchable across the six presets |

Notes:
- Sections only use the preset accent for decoration (borders, stars, icons); text uses the primary colour, which stays readable on every preset.
- Photos stay as labelled striped placeholders until client uploads or stock search (phase 3).
- Navbar and footer are repeated on each page in the config. Shared site-wide sections are worth adding when the workspace edits them (phase 4).

### Phase 3, Showcase generation

| Built | Notes |
| --- | --- |
| Wizard (`/new`) | Business and pages, style preset, content (photo and logo uploads, logo colours extracted in the browser, paste box, client details), review with edit links. "Save and close" keeps a draft; the project page offers "Continue setup" |
| AI router (`src/ai/`) | Thin adapters over Gemini, Groq and OpenRouter. Each task picks a tier (strong for plans, light for copy and parsing), replies are checked against a schema, one repair attempt, then the next provider. Rate limits put a provider on cooldown; requests per day are counted |
| Generation (`src/generate/`) | Read inputs → plan → **you review the plan** (drag, remove, add) → write copy page by page → photos → assemble and validate → version 1. Each step is one short request, saved as it finishes, so a closed tab or a rate limit resumes where it stopped |
| Guard rails | No invented facts or reviews: testimonials are always labelled "Sample review", model image URLs are discarded, contact details and hours come from the brief, stats only from given facts |
| Photos | Client photos go on the most visible slots first; the rest come from Unsplash or Pexels (with credit) when a key is set, otherwise placeholders |
| Settings → AI providers | Add keys (checked with the provider, stored AES-256-GCM encrypted, only the last 4 characters shown), order by drag, choose models per tier (list loaded from the provider), daily limit with usage bar, cooldown status |
| Settings → Connections | Unsplash and Pexels keys |
| Demo mode | Without any AI key, development uses a labelled template provider so the flow can be tried. It never runs in production |

Notes:
- PDF menus aren't read yet: paste their text into the wizard.
- The wizard builds showcase sites; online stores and bookings come in phases 8 and 9.

Not yet built (later phases): the workspace, public pitch pages and open tracking, export and deploy.

## Run it locally

```bash
npm install
npm run dev        # http://localhost:3000
```

Without Supabase keys the app uses a **dev store**: a JSON file at `.data/dev-db.json`, seeded with the sample businesses from the design. Sign in with `dev@sono.studio` / `studio` (change via `SONO_DEV_EMAIL` / `SONO_DEV_PASSWORD`). Delete the file to reset. The dev store refuses to run in production.

```bash
npm test           # unit tests (vitest)
npm run lint       # type check
npm run build
```

## Connect Supabase

1. Create a project on the free tier.
2. Run the files in `supabase/migrations/` in order in the SQL editor (or `supabase db push` with the CLI).
3. Authentication → Providers → Email: keep email and password on, and **turn off "Allow new users to sign up"**.
4. Authentication → Users → Add user: create your one login.
5. Copy `.env.example` to `.env.local` and fill in `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Project settings → API).
6. Set `SONO_ENCRYPTION_KEY` to the output of `openssl rand -base64 32` (it encrypts your AI keys; keep it safe, changing it makes saved keys unreadable).

Every table has row-level security limited to the signed-in owner.

## Deploy to Vercel

Import the repository, set the **Root Directory** to `studio`, and add the environment variables from `.env.example`. `NEXT_PUBLIC_SITE_URL` is the base for pitch links. Until a domain is chosen, leave it on the `*.vercel.app` address; switching later is a single change.

## Layout

```
src/
  app/
    login/                 sign-in page and actions
    (app)/                 signed-in area: layout (shell), dashboard
      projects/[id]/       project details
      presets/ library/ settings/
    new/                   wizard and generation screen
    api/                   generation steps, uploads
    preview/[id]/          full-page site preview
  components/              shell, theme, logo, UI primitives, site thumbnail
  site/                    site config schema, theme, renderer, section library, samples, starter
  ai/                      provider adapters, router, demo provider
  generate/                brief, plan, copy, photos, assembly, pipeline
  lib/
    auth.ts                session + picks the data store
    data/                  Repo interface, Supabase and dev-store implementations
    types.ts               domain types and Zod schemas
    format.ts              dates, follow-up rule, slugs, pitch URLs
    presets.ts             preset definitions and thumbnail styles
  proxy.ts                 session refresh and sign-in redirect
supabase/migrations/       SQL schema
```
