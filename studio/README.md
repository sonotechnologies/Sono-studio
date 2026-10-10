# Sono Studio

A private, single-user web app that generates Next.js websites for local businesses, refines them by chat and click-to-edit, and ships them as pitch links, one-click deploys or exported code.

The design reference lives in `../project/` (Claude Design export) and the briefs in `../project/uploads/` and the Build Brief.

## Status: Phases 1 and 2 done

### Phase 1, Foundation

| Built | Notes |
| --- | --- |
| Next.js 16 (App Router) + TypeScript + Tailwind 4 | Sono tokens from `project/tokens` as CSS variables in `src/app/globals.css` |
| Single login | Supabase email and password; no sign-up screen |
| Light and dark theme | Follows the device until toggled, then remembered; set before first paint |
| App shell | Collapsible sidebar (remembered), top bar with search, theme toggle and New site, bottom tabs on phones |
| Dashboard | Status counts as filters, type chips, search (top bar or in-page on phones), "Needs follow-up", empty state |
| Manual project creation | Business, site type, preset (choice cards) and client record. The AI wizard replaces it in phase 3 |
| Project details | Status menu, pitch link with copy, pause, banner and expiry controls, client record with editable fields and auto-saving notes, activity, delete with confirmation |
| Presets page | The six presets from `presets.json` |
| Settings | Pitch defaults (banner on by default, WhatsApp, Instagram) and sign out. AI providers and Connections are placeholders until phases 3 and 6 |

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

Not yet built (later phases): the wizard and AI pipeline, the workspace, public pitch pages and open tracking, export and deploy.

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

Every table has row-level security limited to the signed-in owner.

## Deploy to Vercel

Import the repository, set the **Root Directory** to `studio`, and add the environment variables from `.env.example`. `NEXT_PUBLIC_SITE_URL` is the base for pitch links. Until a domain is chosen, leave it on the `*.vercel.app` address; switching later is a single change.

## Layout

```
src/
  app/
    login/                 sign-in page and actions
    (app)/                 signed-in area: layout (shell), dashboard
      projects/new/        manual project creation
      projects/[id]/       project details
      presets/ library/ settings/
    preview/[id]/          full-page site preview
  components/              shell, theme, logo, UI primitives, site thumbnail
  site/                    site config schema, theme, renderer, section library, samples, starter
  lib/
    auth.ts                session + picks the data store
    data/                  Repo interface, Supabase and dev-store implementations
    types.ts               domain types and Zod schemas
    format.ts              dates, follow-up rule, slugs, pitch URLs
    presets.ts             preset definitions and thumbnail styles
  proxy.ts                 session refresh and sign-in redirect
supabase/migrations/       SQL schema
```
