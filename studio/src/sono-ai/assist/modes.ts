import type { Mode } from './types';

/*
 * How Sono AI decides what kind of answer a message needs, without spending a
 * request on it: a rule to remember, a draft to write, a question about the
 * studio, something current from the web, or everyday conversation.
 */

const RULE = /^\s*(?:rule\s*:|remember(?:\s+that)?\b|from now on\b|always\b|never\b|don['’]t ever\b|make sure (?:you )?always\b)\s*,?\s*(.+)$/is;

/** The rule in a message like "always quote in dollars for UK clients", or null. */
export function ruleIn(message: string): string | null {
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
  if (!/\b(draft|write|make|prepare|create|give me)\b/.test(m) && !/^(follow[- ]?ups?|quote|checklist)\b/.test(m.trim())) return null;
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
const STUDIO =
  /\b(pitch(?:es)?|projects?|clients?|sites?|websites?|quotes?|drafts?|follow[- ]?ups?|leads?|models?|providers?|summary|deploy(?:ed|s)?|bookings?|orders?|studio|sent|opened|approved|live|scorecards?|rules?|keep rate|my work)\b/i;

/** Which kind of answer a message needs; project names count as studio questions. */
export function pickMode(message: string, projectNames: string[] = []): Mode {
  if (SEARCH.test(message)) return 'search';
  const lower = message.toLowerCase();
  if (STUDIO.test(message) || projectNames.some((n) => n.length >= 3 && lower.includes(n.toLowerCase()))) return 'studio';
  return CURRENT.test(message) ? 'search' : 'casual';
}
