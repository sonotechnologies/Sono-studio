# Sono Studio

A private, single-user web app that generates Next.js websites for local businesses, refines them by chat and click-to-edit, and ships them as pitch links, one-click deploys or exported code.

The design reference lives in `../project/` (Claude Design export) and the briefs in `../project/uploads/` and the Build Brief.

## Status: Phase 1, Foundation

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

Not yet built (later phases): site config and renderer, the section library, the wizard and AI pipeline, the workspace, public pitch pages and open tracking, export and deploy.

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
2. Run `supabase/migrations/0001_foundation.sql` in the SQL editor (or `supabase db push` with the CLI).
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
  components/              shell, theme, logo, UI primitives, site thumbnail
  lib/
    auth.ts                session + picks the data store
    data/                  Repo interface, Supabase and dev-store implementations
    types.ts               domain types and Zod schemas
    format.ts              dates, follow-up rule, slugs, pitch URLs
    presets.ts             preset definitions and thumbnail styles
  proxy.ts                 session refresh and sign-in redirect
supabase/migrations/       SQL schema
```
