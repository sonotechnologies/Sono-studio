import type { Brief } from './brief';

export function parsePrompt(brief: Brief) {
  return {
    system: 'You turn notes from small-business owners into structured data. You reply with a single JSON object and nothing else. Never invent anything that is not in the notes.',
    prompt: `These notes came from the owner of ${brief.businessName} (${brief.businessType}). They may contain opening hours, a menu or price list, an Instagram bio or a WhatsApp message.

"""${brief.paste.trim().slice(0, 6000)}"""

Extract:
- tagline: one line in their own words that describes the business, or "".
- hours: opening hours as [{"days": "Tue to Sat", "time": "17:00 to 22:00"}].
- items: every menu or price-list item as {"name", "description", "price", "category"}; keep prices exactly as written, "" if none.
- facts: short statements of fact worth putting on the site (founding year, specialities, awards, parking, delivery). Only what the notes say.

Reply with JSON in exactly this shape:
{"tagline":"","hours":[],"items":[],"facts":[]}`,
  };
}
