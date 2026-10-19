import type { Mode } from './types';

/*
 * How Sono AI decides what kind of answer a message needs, without spending a
 * request on it: a rule to remember, a draft to write, a question about the
 * studio, something current from the web, or everyday conversation.
 */

const RULE = /^\s*(?:rule\s*:|remember(?:\s+that\b|\s*:|\s+to\b)|from now on\b|always\b|never\b|don['’]t ever\b|make sure (?:you )?always\b)\s*,?\s*(.+)$/is;
/**
 * Things that start like a rule but aren't one: "never mind", "always happy
 * to help!", "never got a reply from…", "always the same wahala", "remember
 * that site I built…".
 */
const NOT_RULE =
  /^\s*(?:never\s*mind|nevermind|never (?:heard|seen|thought|knew|been|got|gotten|received|had|did|was|were|replied|answered|paid|came|showed|responded|saw|found|made)|always (?:happy|glad|nice|good|great|fun|the same|like (?:this|that)|so|been|was|were|had|did)|remember to (?:remind|tell) me|remember (?:that|the|when|how|what) (?:site|website|time|day|client|project|one|thing|pitch|guy|lady|person|call|meeting)\b|remember when)\b/i;

/** The rule in a message like "always quote in dollars for UK clients", or null. */
export function ruleIn(message: string): string | null {
  if (NOT_RULE.test(message) || /\?\s*$/.test(message)) return null;
  const m = RULE.exec(message.trim());
  if (!m) return null;
  const lead = message.trim().match(/^\s*(always|never)\b/i)?.[1];
  // "Always …" and "Never …" are the rule itself; "Remember that …" and "Rule: …" introduce it.
  const text = (lead ? message.trim() : m[1]).replace(/\s+/g, ' ').trim();
  return text.length >= 6 ? text.charAt(0).toUpperCase() + text.slice(1) : null;
}

export type DraftAsk = { kind: 'follow_up' } | { kind: 'quote' } | { kind: 'checklist' };

/** "Draft follow-ups", "write a quote for this", "handover checklist", … */
export function draftAsk(message: string): DraftAsk | null {
  const m = message.toLowerCase();
  // "How do I write a good follow-up?" is a question about drafting, not a request for one.
  if (/^\s*(?:how|what|why|when|where|who|which|should|is|are|does|do i|did)\b/.test(m) || (/\?\s*$/.test(m) && !/^\s*(?:can|could|would|will) you\b/.test(m))) return null;
  // The asking word comes just before what's asked for: "draft a follow-up", "write me a quote for Kora".
  if (!/\b(draft|write|make|prepare|create|give me|send me)\b(?:\s+[\w'’-]+){0,3}?\s+(?:follow[- ]?ups?|quotes?|quotation|price|handover|checklist)\b/.test(m) && !/^(follow[- ]?ups?|quote|checklist)\b/.test(m.trim())) return null;
  // "Make a website for Lagos Quotes" is a site, not a quote.
  if (/\b(site|website|web\s*page|landing\s*page|homepage)\b/.test(m) && !/\b(quote|follow[- ]?ups?|checklist)\s+for\b/.test(m)) return null;
  if (/\bfollow[- ]?ups?\b/.test(m)) return { kind: 'follow_up' };
  if (/\bquote|quotation|price for\b/.test(m)) return { kind: 'quote' };
  if (/\b(handover|hand-over|checklist)\b/.test(m)) return { kind: 'checklist' };
  return null;
}

// Clearly about the web, whatever else the message says.
const SEARCH = /\b(search|look up|google|news|price of|exchange rate|weather|release notes)\b|https?:\/\//i;
// About something current, unless the message is plainly about your own work.
// Includes anything that changes over time (releases, episodes, seasons, scores, schedules) and "check" or "look it up".
const CURRENT =
  /\b(latest|today['’]?s|right now|currently|recently|this (?:week|month|year)|how much (?:is|does|do)|what['’]?s new|(?:been |was |is |get )?released|release date|come out|came out|coming out|out yet|new season|season \d+|(?:second|third|next|last) season|seasons?|episodes?|ep \d+|airing|premiere|who won|scores?|fixtures|schedule|upcoming|when (?:is|does|will|did)|check|verify|look (?:it|that) up|find out|is (?:it|that) true)\b/i;
// Not "Sono" (it's the assistant's name), "live", "models" or "summary": they come up in everyday questions too.
const STUDIO =
  /\b(pitch(?:es)?|projects?|clients?|sites?|websites?|quotes?|drafts?|follow[- ]?ups?|leads?|deploy(?:ed|s)?|bookings?|orders?|studio|sent|opened|approved|scorecards?|rules?|keep rate|my work|products?|workspace|themes?|presets?|export|domains?|telegram|settings|sections?)\b/i;

/** Which kind of answer a message needs; project names count as studio questions. */
export function pickMode(message: string, projectNames: string[] = []): Mode {
  if (SEARCH.test(message)) return 'search';
  const lower = message.toLowerCase();
  if (STUDIO.test(message) || projectNames.some((n) => n.length >= 3 && lower.includes(n.toLowerCase()))) return 'studio';
  return CURRENT.test(message) ? 'search' : 'casual';
}
