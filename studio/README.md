# Sono Studio

A private, single-user web app that generates Next.js websites for local businesses, refines them by chat and click-to-edit, and ships them as pitch links, one-click deploys or exported code.

The design reference lives in `../project/` (Claude Design export) and the briefs in `../project/uploads/` and the Build Brief.

## Status: Phases 1 to 10 done

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

### Phase 4, Workspace

| Built | Notes |
| --- | --- |
| Workspace (`/workspace/[id]`) | Opened from the project page, the preview's Edit button, and automatically when generation finishes. Section list on the left, the live site in the middle (desktop, tablet and phone widths), Chat, Edit and Theme on the right. Below 1280px the section list becomes a drawer; below 768px the right panel becomes a bottom sheet |
| Click-to-edit | Hover outlines and labels on sections. Click a section to select it; click a short text to type over it in place (Enter saves, Esc cancels); click a photo to open the media library. Longer or combined texts jump to their field in the Edit panel |
| Edit panel | Layout variant picker and a form built from each section's schema, so every field is editable: texts, buttons and links (with a page picker), photos, and lists (add, remove, reorder). Move, duplicate, hide and remove sections; add new ones from the + menu with placeholder copy; drag to reorder. Navbar, footer and WhatsApp button are shared: editing one edits it on every page |
| Theme panel | Change style preset, light or dark mode, each colour (with contrast warnings), heading and body fonts, and corners (Sharp, Soft, Round) |
| Chat | Ask for changes in plain words with a scope of the whole site, the current page or the selected section. The model returns a few validated operations, never a rewritten site; changed sections flash, and each reply has "Undo this change", which leaves later edits alone. Chat history is stored per project |
| Media library | The project's photos, uploads, and Unsplash or Pexels search (when a key is set). Stock photos keep their credit |
| History | Every change autosaves after a moment as a new version. Undo and redo (Ctrl+Z, Ctrl+Shift+Z) in the session; version history lists every save and restores any of them as a new version |

Notes:
- Export and Deploy are shown disabled until phase 6.
- Supabase needs `supabase/migrations/0004_workspace.sql` (the chat history table).

### Phase 5, Pitch links and tracking

| Built | Notes |
| --- | --- |
| Public pitch page (`/p/[slug]`) | The current version of the site, every page, no sign-in. Shared links show the business name, description and hero photo as the preview in WhatsApp and Instagram. Pitch pages are never indexed by search engines |
| Banner | "Concept by Sono Technologies" with your WhatsApp and Instagram from Settings → Pitch defaults; visitors can hide it. Switch it off per project |
| Pause and expiry | Paused links show "This concept is paused"; expired ones say when they ended, with a button to ask you for a new link. Expiry counts from the date the pitch was marked sent (or the project was created). A longer time or Never reopens an expired link |
| Open tracking | One open per visit with time, device type and page. Link previews and crawlers (WhatsApp, Instagram/Facebook, Telegram, Slack, Google and others) are logged as bots and not counted. Your own visits while signed in aren't counted |
| Project page | Link status (live until, paused, expired), open count and last open, an Open button, each open in Activity with device, and "Mark as sent" offered after copying a draft's link |
| Security | Visitors never touch the tables: two narrow database functions return what a pitch page shows and log an open. Nothing private (client notes, keys, other projects) reaches the page |

Notes:
- Supabase needs `supabase/migrations/0005_pitch.sql`.
- Pitch links use `NEXT_PUBLIC_SITE_URL` when set, otherwise the Vercel production address.

### Phase 6, Export and deploy

| Built | Notes |
| --- | --- |
| Code generator (`src/export/`) | Turns a site config into a standalone Next.js + Tailwind project: the same section components the studio renders with (only the ones the site uses), the config as `src/site/config.json`, one route per page, every page prerendered as static HTML. The client's own photos are copied into `public/images`; Unsplash and Pexels photos stay linked, as their terms ask. No dependency on Sono Studio, no environment variables |
| Export | Export in the workspace or "Export zip" on the project page downloads the current version |
| Deploy | Commits the exported site to a private GitHub repository (when a GitHub token is set), then uploads it to Vercel, which builds and hosts it. Redeploy commits and publishes the newest version to the same repo and project. It never writes to a repo or Vercel project it didn't create: a taken name gets a suffix |
| Going live | When the build is ready the live address is recorded, the project becomes Live and its pitch link forwards to the live site. The project page shows the address, the repo, the deployed version and whether newer edits are waiting |
| Handover checklist | Built from the site: placeholder photos, sample reviews, missing contact details, stock photo credits, then domain and hosting-account steps. Shown before deploying, on the project page and in the exported README |
| Settings → Connections | GitHub (classic token with the `repo` scope) and Vercel (personal token) are checked with each service and stored encrypted like the other keys |

How the export stays in sync with the studio: `scripts/export-template.mjs` collects the renderer's files and the site CSS (between `export:` markers in `globals.css`) into `src/export/template.generated.json` before every dev, build, lint and test run.

Notes:
- Supabase needs `supabase/migrations/0006_deploy.sql`.
- Vercel's free Hobby plan is for non-commercial use: fine for your own demos; a paying client's live site belongs on their own Vercel account or a paid plan (the checklist says so).

### Phase 7, Presets and reference

| Built | Notes |
| --- | --- |
| Your styles | Saved styles (`style_presets`): a built-in preset as the base (layouts, type scale, heading style) with its colours, fonts and corners replaced. Created on the Presets page (New style, or Customise on a built-in preset), edited with a live preview, or saved from a site with "Save as a style to reuse" in the workspace Theme panel |
| References, no AI | A screenshot (colours by area, read in the browser), a link (the page's CSS, theme colour and Google Fonts, read by the server) or a logo (brand colours). One function (`src/style/reference.ts`) gives the colours roles, keeps text and buttons readable, matches fonts to ones sites can load, and suggests the closest preset with its reasons |
| Wizard | The style step offers your styles and "Start from a reference" next to the presets. The chosen style is copied into the brief, so editing it later doesn't change a site being generated; logo colours can still go on top |
| Workspace | Your styles appear in the Theme panel's style list |
| Look and feel from a reference | A link also gives motion (animation libraries such as GSAP, AOS or Framer Motion, keyframes, transitions), corners (button and card radii), spacing (section padding) and layouts (video or photo behind the hero → full-bleed, centred hero or menu, card grids). A screenshot gives spacing from how much of it is empty background |
| Motion and spacing | Themes have Motion (none, subtle, lively) and Spacing (compact, balanced, airy). Motion is pure CSS: sections fade up as they scroll into view, lively adds staggered cards, a rising headline and hover lifts. Browsers without scroll-driven animations show the page as is, and visitors who ask for reduced motion see nothing move. Exported sites keep it |
| Style layouts | A style can carry preferred layouts per section type. Plans, new sections and the plan review use them; the workspace Theme panel can apply them to a site's existing sections |
| Safety | Links are fetched only from public web addresses (private and local network addresses are refused, redirects re-checked), with time and size limits |

Notes:
- Supabase needs `supabase/migrations/0007_styles.sql`.
- Fonts a reference uses are matched to the ten fonts sites load (a site in Lato gets Inter, Montserrat gets Sora, and so on).

### Rebuild a client's current site

| Built | Notes |
| --- | --- |
| Import | The wizard's content step takes the address of the client's current site (with a tick-box confirming it's theirs). The home page and up to five pages from its menu are read: text in reading order, prices and lists, phone, WhatsApp, email, Instagram and address, the logo and the larger photos. No AI is used to read |
| Into the brief | The text goes into the content box as one "## Page" block per page; contact fields and pages are filled in; photos and the logo are copied into the project (logo colours offered as usual). The pipeline's parsing step turns the text into facts, menu items and hours, and each page's copy is written from its own block first |
| Their look | The current site's colours, fonts, motion, corners and layouts are read too; "Keep their current look" makes them the style, or the site is rebuilt in the style you picked |
| Limits | Public addresses only, about 25 seconds of reading, up to 10 photos (5 MB each). Sites that build their pages with JavaScript give little text: paste it instead |

### Exact copy of a client's own site

| Built | Notes |
| --- | --- |
| Copy as it is (`/projects/copy`) | For moving a client's existing site unchanged. With a tick-box confirming it's the client's own site, the studio follows its pages (same site, up to 40) and downloads their stylesheets, scripts, fonts, images and video, rewriting every link to point at the copy. Shared CDNs and third-party services (Google Fonts, analytics, maps, video embeds) stay linked; a site builder's own CDN is copied, since it may go with the old account |
| Storage | One zip per project in a private bucket (`site-copies`), up to 45 MB |
| Project page | An "Exact copy" card: the source, pages, size, "Open the copy" and "Copy again". The usual Export zip and Deploy buttons work on it; Vercel serves it as static files with clean URLs |
| Preview | The copy opens inside the studio with its scripts switched off, so its code can't act as your signed-in session. Styles, images, fonts and CSS animations show exactly; JavaScript effects show once deployed or opened from the export |
| Checklist | Generated from what was found: forms that still post to the old server, the old site's analytics codes, pages that are built by JavaScript, site-builder features that don't come across, files that couldn't be copied |
| Limits | Only what browsers receive can be copied: forms, bookings, shops, logins and CMS editing stay with the old host. A copy isn't edited in the workspace, but in its own editor (below) |

Notes:
- Supabase needs `supabase/migrations/0008_site_copies.sql`.

### Editing a copy, and exporting it as Next.js

| Built | Notes |
| --- | --- |
| Edit the copy (`/copy-editor/[id]`) | The copy with its scripts off and every text, picture and link marked. Click one to change it in the side panel; the page updates as you type and saves a moment later. Text can be changed on every page at once (a phone number in the footer); pictures are replaced by upload, with their description; links take a page of the site, a web address, mailto:, tel: or a WhatsApp link. Each change can be undone from the list. Phone and desktop sizes |
| How edits work (`src/mirror/edit.ts`) | A spot is found by its place in the page (the 5th text, the 2nd picture) and an edit replaces just those characters in the original HTML, so the layout can't change. Each edit remembers what it replaced: after "Copy again", edits whose spot changed are left out and listed in the editor to clear. Edits are kept in the copy's meta (no migration). Replaced pictures also drop the old srcset, `<source>` sizes and lazy-load attributes so the new one shows |
| Preview | The copy's preview and "Open the copy" show the edits. Pages are checked for changes on every view; files stay cached for an hour |
| Export and Deploy (`src/mirror/to-next.ts`) | A copy now exports and deploys as a Next.js project in TypeScript with Tailwind, looking exactly like the original. Each page is a route with its markup as JSX, its title and description as metadata and its stylesheets in their original order; the CSS, scripts, fonts and images go in `public/` unchanged. The original scripts run in order once the page loads, then the page's load events fire again for code waiting on them; inline handlers (`onclick`) are put back. Links between pages are full page loads, as before. Pages with different `<html>`/`<body>` attributes get their own root layout. `about.html` and the original paths redirect to the new routes. Pictures from edits are downloaded into `public/edits/`. The project's README explains the layout |
| Tailwind | Set up without its reset (preflight) and with a `tw:` prefix, so it can't restyle anything the original CSS styles or clash with the site's own class names (`.container`, `.hidden`). New work: `className="tw:flex tw:gap-4"` |
| Plain HTML | "Plain HTML zip" on the project page still downloads the copy as static files (with the edits in) |
| Checked | A sample site (jQuery, DOMContentLoaded and load handlers, onclick, inline styles, SVG, tables, forms, `<pre>`, old tags like `<center>` and `<font>`, per-page body classes, no viewport tag on some pages) builds with `next build` and its pages are pixel-identical to the original at desktop and phone widths, with every script running |
| Limits | Scripts that use `document.write`, or expect to run before the page has finished loading, may behave differently. Pictures set in CSS (backgrounds) can't be swapped in the editor |
| Ask AI (`src/mirror/ai.ts`) | A tab in the copy editor. The model sees the open page as numbered texts, links and picture descriptions (with changes already made, selected text first) and answers with changes to those numbers: text (on this page or every page with the same text), link addresses and picture descriptions. They become ordinary editor edits, saved at once, shown in the page and the change list, and undone together from the chat. It's told not to invent facts and to keep the length and style of each piece. Uses the studio's AI providers (light tier); the demo provider follows "change X to Y" |
| Cached files (`src/mirror/files.ts`) | The preview, editor and AI read a copy's files from the hosting's shared cache (in pieces under its 2 MB limit, keyed by the copy's date) instead of each cold server downloading the whole zip from Supabase Storage |

### Sono AI chats

| Built | Notes |
| --- | --- |
| Chats (`/sono-ai/chat`) | Separate chats: New chat, a list to switch between (beside the chat on wide screens, behind the chat's name on phones), rename and delete (with its messages). A chat is made with its first message and named after it; each chat only remembers its own messages. The page opens the most recent chat (`?t=` a given one, `?new=1` a new one); the workspace's Sono AI tab carries on the most recent chat |
| Messages | Tap your message (or use the icons under a reply) to copy or delete it; deleting takes a second tap |
| Storage | `chat_threads`, and `conversations.thread_id`; a message can only go into one of your own chats. Studio messages from before become one chat, "Earlier chat". Telegram stays one running conversation |

Notes:
- Supabase needs `supabase/migrations/0016_sono_ai_chats.sql`.

### Live thumbnails

| Built | Notes |
| --- | --- |
| Project cards and project page | Each card shows the site's real home page, scaled down in a frame with scripts off, loaded when the card comes into view; the preset placeholder shows until then and for projects without a site yet |
| Built sites (`/thumb/[id]?v=`) | The home page of a version, rendered from its content. A version never changes, so its content is read once and kept in the hosting's cache, not on every dashboard view |
| Copies | The copy's home page with its edits (`/copy/[id]/…?thumb=1&v=`); the address names the copy's version, so browsers keep it until it's copied again or edited |

### Phase 8.1, Online stores with WhatsApp ordering

| Built | Notes |
| --- | --- |
| Catalogue | A site can have a store (`config.store`): currency, the WhatsApp number orders go to, and up to 300 products with price, old price, category, description, photos (up to 7), up to two option groups (size, colour…) and sold out |
| Sections | Product grid (cards, minimal, list; category filter; limit), Product spotlight (split, centered) and Product page (gallery, compact). Every product gets its own page at `/product/<id>`, built from the list, never laid out by hand |
| Cart | Kept in the visitor's browser, one per site. A floating "Cart" button opens a drawer with quantities, total, name and delivery note; "Order on WhatsApp" opens a pre-filled message listing each item, option, quantity and the total |
| Wizard | "Shop" is a page option (preselected for streetwear, fashion and gadget stores), with a currency choice or "read from their prices". Products come only from the price list or imported site; with none, the shop starts with three samples marked to replace. The plan always puts a grid on the Shop page and a few products on home |
| Workspace | A Products tab: shop settings, the product list, an editor per product (photos from the media library, options, sold out, reorder, duplicate, remove) and Preview. Clicking a product in the preview opens it. "Add a shop" turns an existing site into a store with a Shop page and menu link |
| Pitch, preview, export | The cart and product pages work on pitch links and in the preview; exports prerender every product page |
| Checklist | Sample products, products without a price or photo, and a missing WhatsApp number for orders |

Notes:
- No migration needed: the store lives in the site config.

### Phase 8.2, Card payments and orders

| Built | Notes |
| --- | --- |
| Ways to pay | Per shop, in the Products tab: WhatsApp ordering, Paystack (card, bank transfer, mobile money in NGN, GHS, ZAR, KES, USD) and Stripe (international cards, Apple Pay, Google Pay). Money goes into the business's own account |
| Checkout | The cart asks for name, email, phone and a delivery note, then opens the provider's own payment page. Prices always come from the product list on the server, never from the browser. Back on the site, the order page checks the payment with the provider before saying it's paid. Webhooks (signature-checked) catch customers who close the tab |
| Test mode in the studio | Settings → Test payments takes your own Paystack and Stripe test keys (test keys only). Pitch links and the preview then take test payments, with the test card numbers shown in the cart, so a client can try the whole checkout |
| Orders | Recorded per project and shown on the project page: test orders from the pitch link and preview, live orders from the deployed site. Mark fulfilled or cancelled |
| Live sites | The export gets a checkout route, the order page and webhook routes, reading the business's keys from environment variables. The Deploy dialog asks for the client's keys and sends them straight to Vercel (encrypted there, not kept in the studio). Paid orders are reported back to the studio with a per-project key that changes on every deploy |
| Checklist | Keys to add, webhook addresses to set in the client's dashboards, and a small real payment to test before launch |

Notes:
- Supabase needs `supabase/migrations/0009_orders.sql`.
- Security: the orders table is owner-only. Pitch visitors and live sites reach it only through narrow functions; marking an order paid needs a token only the studio's server can work out, and only after the provider confirmed the payment.

### Phase 9.1, Bookings with deposits

| Built | Notes |
| --- | --- |
| Bookings | A site can take bookings (`config.bookings`): services (length, price, category), weekly opening hours with up to two spans a day, start times every N minutes, how many bookings at once, notice needed, how far ahead, closed days, and the time zone the hours are in |
| Booking section | Choose a service, a day and a free time, then either pay a deposit by card (Paystack or Stripe, confirmed once paid) or send the request on WhatsApp. Times are worked out in the business's time zone, so visitors abroad see the right ones. Booked times are left out |
| Holding times | A booking holds its time for 30 minutes while the deposit is paid. Overlaps and capacity are checked in the database under a lock, so two people can't take the last place |
| Confirmation | The booking page checks the deposit with the provider, shows the service, time, deposit paid and what's left to pay, with Add to calendar and a WhatsApp link |
| Workspace | A Bookings tab: services, opening hours, booking rules, closed days, deposit and payment options. "Add bookings" adds a Book page and menu link to any site |
| Wizard | "Book" is a page option (ticked for salons and wellness studios), with the time zone. Services come from the price list, with lengths read from the text ("90 min", "1 hr") |
| Project page | A Bookings card: coming up and recent, mark done or no-show, cancel to free the time |
| Live sites | Deposits work on deployed sites too: the studio keeps the booking calendar, and the site holds and confirms bookings with its project key (set at deploy). Without deposits, booking is by WhatsApp and needs nothing else |

Notes:
- Supabase needs `supabase/migrations/0010_bookings.sql`.

### Phase 9.2, Client admin panel

| Built | Notes |
| --- | --- |
| Client logins | On the project page, the Client login card creates a login for the client (email plus a generated password shown once, with a message to send them), sets a new password or removes it. Passwords are hashed in the database; five wrong attempts lock a login for 15 minutes |
| Admin panel (`/admin`) | The client signs in on the studio's address and edits their site on the page itself, as in the workspace: click any text or photo. Products and prices, services and opening hours, and their orders and bookings have their own tabs. Works on a phone |
| What stays yours | Theme, pages, which sections there are, their layouts and order, payment and deposit settings, currency and time zone. A save that touches any of these is refused on the server |
| Publishing | Nothing changes until the client presses Publish changes. It saves a new version and publishes it; a save on top of a newer version is refused, so nobody's edits are lost. Their changes appear in your workspace too |
| Live sites | Deployed sites read their published content from the studio at most once a minute (with their built-in copy as a fallback), so client edits go live without a redeploy. Deploying publishes the deployed version. Product pages added later render on first visit |
| Photos | Clients upload photos into the site's library through one-time upload tickets; nothing else can be written to storage |

Notes:
- Supabase needs `supabase/migrations/0011_site_admin.sql`.
- Sites deployed before this phase pick up client edits after one more deploy (it adds the `SONO_SITE_API` setting).

### Phase 10, Custom sections written by AI

| Built | Notes |
| --- | --- |
| Adding one | In the workspace, the + menu ends with "Custom section · written by AI": describe it (a timeline, a price comparison, a team grid) and the AI writes a component plus the fields to edit its content. The wizard's planner may also use up to two, when no library section fits |
| The check | Before a section is accepted, its code is compiled and scanned: one component with plain JSX and Tailwind classes, content only from its fields; no imports, scripts, network, storage, timers, state, event handlers or raw HTML. Code that fails is sent back to the AI with the reasons |
| Preview | In the studio it renders in a sandboxed frame with no access to the studio, cookies or the network, in the site's fonts and colours |
| Editing | Its words and photos are edited like any section (and by the client in the admin panel). "Change with AI" rewrites it; "Code" shows what was written; "I've read the code" records your review. The code itself stays yours: clients can't change it |
| Export | Each becomes an ordinary component file in `src/site/sections/custom/`; Vercel's build is the final check. The handover checklist flags any you haven't reviewed |

Notes:
- No migration needed: custom sections live in the site's config.

## Sono AI (experimental)

An assistant that grows beside the studio, built one stage at a time from the Sono AI brief. It's off unless `SONO_AI_ENABLED=true`; off, the studio works exactly as before. Its code lives in `src/sono-ai/` and its data in its own tables; it only reads studio data.

### Stage 1, Record

| Built | Notes |
| --- | --- |
| Recording | Every AI request (generation, chat edits, custom sections) and its answer is copied to the knowledge bank after the response is sent: task, provider, model, time, tokens, errors and limits, project and site type. The request itself goes to the provider unchanged, and if recording fails the request still goes through |
| Redaction | Before anything is stored, the business name, owner's name, phone numbers, emails, @handles and address are swapped for placeholders ("Client A", "Person 1", "Phone 1"). The placeholder table is kept per project and only you can read it |
| History | `/sono-ai` → Import past history brings in earlier generations and chat edits (redacted) and links results to what came of them: kept, edited (with the version holding your edit), undone, regenerated, pitch opened, approved, live. Running it again adds only what's new, and also links outcomes for requests recorded since |
| Deleting | Deleting a project deletes its requests, outcomes and placeholders |

Notes:
- Supabase needs `supabase/migrations/0012_sono_ai.sql`.
- Requests are stored redacted but still sent to the AI providers as they are, since the site's copy needs the real business name. Redacting what is sent is for the assistant's own requests in stage 3.
- Generation jobs keep only the latest run per project, so the import covers each project's latest generation plus all chat edits.

### Stage 2, Notify

| Built | Notes |
| --- | --- |
| Telegram bot | Your own bot (from BotFather). `/sono-ai` → Connect Telegram registers its webhook and gives a one-time link; pressing Start links your chat. The bot answers only that chat and ignores everyone else; webhook calls without the secret set at registration are refused |
| Alerts | Sent the moment the event is saved, each once: a pitch link's first real open (bots filtered), a failed generation or deploy, a provider hitting its limit, and every AI provider resting at once |
| Morning summary | Around 8:00 Lagos time (Vercel Cron, `vercel.json`), only when something needs you: at most five items, one line each with a link, ordered approvals, follow-ups, failures, then the rest. Routine numbers are left out, nothing is sent on a quiet day, and a thumbs-down on an item leaves that kind out (bring it back on `/sono-ai`). Facts come straight from the database; the wording is fixed text, so nothing can be invented |
| Knowledge search index | Project summaries, client notes and pitch outcomes, redacted, cut into chunks and embedded with Gemini's free embedding model into pgvector. It catches up in the background at most every ten minutes while you work (or Update the index now), rewrites only what changed, and a deleted project's chunks go with it. Answers from it come in stage 3 |

Notes:
- Supabase needs `supabase/migrations/0013_sono_ai_notify.sql` (it turns on the `vector` extension).
- Vercel needs `TELEGRAM_BOT_TOKEN` (from BotFather) and `CRON_SECRET` (any long random string; Vercel Cron sends it to the summary route). Both stay on the server.
- The summary time is in `vercel.json` (`0 7 * * *` is 07:00 UTC, 8:00 in Lagos). On Vercel's free plan a daily job can run any time within that hour.
- The follow-up threshold is set on `/sono-ai` (3 days to start). The summary shows on `/sono-ai` rather than the studio dashboard, so the dashboard stays untouched.
- Embeddings use your Gemini key from Settings → AI providers; without one, chunks wait and are embedded once a key is added.

### Stage 3, Assist

| Built | Notes |
| --- | --- |
| Sono AI chat | **Sono AI** in the sidebar (a full-page chat) and a **Sono AI** tab in the workspace, where it knows which project you're looking at. Also on Telegram: just message the bot |
| Three kinds of answer | Picked per message (or choose Auto, My studio, Web or Chat): everyday conversation; questions about your work, answered from studio data, model scorecards and the knowledge search index, with links to what it used, and a plain "the bank has nothing on that" instead of guessing; and live web answers through Gemini's Google Search grounding, with the pages it used |
| Privacy | Before any assistant request leaves the studio, every client's names, numbers, emails, handles and addresses are swapped for placeholders, and swapped back in the reply. Web searches are redacted the same way |
| Quota | The assistant uses the light model and stops using a provider once 70% of its daily limit is used, so builds always have the rest |
| Drafts | "Draft follow-ups" (chat, Telegram or the Drafts page) writes a WhatsApp or Instagram message for each pitch with no reply, in your voice: the drafts you edited before approving are its examples. Quotes are priced from the site's pages and modules and your past approved quotes; handover checklists list what a site needs before going live. Each has Approve, Edit and Skip, in the studio and on Telegram. Approve opens WhatsApp with the message filled in (Instagram: copied, then the chat opens); Sono AI never sends anything itself |
| Rules | Say "always…", "never…", "from now on…" or "remember that…": Sono AI repeats the rule back and saves it when you confirm. The Rulebook lists every rule with an on/off switch and delete; rules apply to every answer and draft |
| Feedback | 👍/👎 on every answer and draft, in the studio and on Telegram |
| Scorecards | Per task, provider and model: requests, failures, kept, edited after, undone, regenerated and the keep rate, from the knowledge bank, recalculated daily or on request |

Notes:
- Supabase needs `supabase/migrations/0014_sono_ai_assist.sql`.
- Web search and knowledge search need a Gemini key in Settings → AI providers (Gemini's free tier). Without one, studio answers still use studio data and scorecards.
- Conversations are stored as you wrote them (they're yours, behind your login); what goes to AI providers, and the request log, is redacted.

### Stage 4, Build

| Built | Notes |
| --- | --- |
| Asking | In the Sono AI chat or on Telegram: "build a pitch site for Mama's Kitchen, a restaurant in Lekki, owner Ada, WhatsApp 0803…". Sono AI reads the brief from the request (business, type, pages, details, client contacts) without inventing anything, and files it under **Sono AI → Builds** |
| Plan it | Nothing is created until you open the request and press **Plan it**. That makes an ordinary project and generation job, exactly as the New site wizard does, and opens the wizard, which plans the pages and stops at its own plan review. Nothing is built until you approve the plan there (you can edit the plan or go back to the brief first). There is no separate builder |
| Choices from the knowledge bank | The style is the preset your approved or live sites of that kind used most (else the usual one for that kind); a rule naming a preset wins. Your rules go into the brief's notes, which the planner and writer follow |
| Labels | Projects it started say **Started by Sono AI** on the dashboard and the project page. They're normal projects you can edit; the pitch link is never sent for you |
| Trust | The Builds page shows how many drafts you've approved without edits, the brief's measure for relying on Sono AI |

Notes:
- Supabase needs `supabase/migrations/0015_sono_ai_build.sql`.
- On Telegram the bot files the request and gives you a button that opens it in the studio to plan.

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
  generate/                brief, plan, copy, photos, products, assembly, pipeline
  workspace/               pure edit functions for the workspace (sections, products, shop)
  sono-ai/                 Sono AI (experimental): recorder, redaction, knowledge bank, history import, Telegram, alerts, summary, search index
  lib/
    auth.ts                session + picks the data store
    data/                  Repo interface, Supabase and dev-store implementations
    types.ts               domain types and Zod schemas
    format.ts              dates, follow-up rule, slugs, pitch URLs
    presets.ts             preset definitions and thumbnail styles
  proxy.ts                 session refresh and sign-in redirect
supabase/migrations/       SQL schema
```
