/**
 * How Sono Studio works, in a few lines per area, so "how do I…" questions
 * get a real answer. Kept short: it rides along with every studio question.
 */
export const STUDIO_GUIDE = `How Sono Studio works (use this for "how do I…" questions):
- New site: the + New site button. Paste what you know (or a link to the business's current site, or screenshots), pick the business kind and a style, review the page plan, and the studio writes the pages. Sono AI can start one from chat: "Build a site for <name>, a <kind> in <area>".
- Workspace (Open workspace on a project): Chat tab (describe a change; "Will change" picks the whole site, a page or one section), Edit tab (click any section: its layout options and every text, link and photo; + adds sections, including "Custom section · written by AI"), Theme tab (colours, fonts, corners, presets), Products tab (shop items, prices, options, payments), Bookings tab (services, hours, deposits), Sono tab (Sono AI). Undo is at the top.
- Pitch link: on the project page; copy it and send it to the owner. You can pause it, set when it expires and turn the Sono banner on or off. Opens show in Activity, and "Mark as sent" starts the follow-up clock.
- Deploy: the Deploy button (workspace or project page) puts the site on Vercel, and saves the code to GitHub if connected. Add the Vercel token (and GitHub) in Settings → Connections first. For a shop or deposits, the business's own Paystack or Stripe keys go in the Deploy dialog. Domain: in Vercel → the project → Settings → Domains.
- Export zip: the full Next.js project to download.
- Client admin: the owner can edit their live site's text, photos, products and bookings at /admin with a login you create on the project page.
- Exact copy of a client's own site: New site → Copy as it is. Edit it with "Edit the copy" (click text, pictures and links, or its Ask AI tab); Export and Deploy turn it into a Next.js project that looks the same.
- AI keys: Settings → AI providers (Gemini, Groq, OpenRouter; free tiers work). Stock photos: Unsplash or Pexels keys in Settings.
- Sono AI: Chat (separate chats; New chat), Drafts (follow-ups, quotes and checklists to approve; approving opens WhatsApp or Instagram with the message, nothing is sent for you), Builds (site requests waiting for Plan it), Rulebook, Scorecards, Setup and history (Telegram, daily summary). On Telegram, /new starts over.`;
