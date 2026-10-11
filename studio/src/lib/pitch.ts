import type { Device } from './data/repo';

/*
 * Who opened a pitch link. Link previews in WhatsApp, Instagram and other apps
 * fetch the page too; they are flagged so the open count reflects real people.
 */

const BOTS =
  /\bbot\b|bot\/|crawler|spider|crawl|slurp|facebookexternalhit|facebookcatalog|meta-externalagent|whatsapp\/|instagram.*preview|telegrambot|twitterbot|linkedinbot|slackbot|slack-imgproxy|discordbot|skypeuripreview|embedly|vkshare|redditbot|applebot|googlebot|google-inspectiontool|bingbot|bingpreview|yandex|duckduckbot|baiduspider|petalbot|headlesschrome|lighthouse|preview|curl\/|wget\/|python-requests|python-urllib|node-fetch|axios\/|go-http-client|okhttp\//i;

export function isBotAgent(ua: string): boolean {
  return !ua.trim() || BOTS.test(ua);
}

export function deviceFrom(ua: string): Device {
  if (/ipad|tablet|kindle|silk|playbook|(android(?!.*mobile))/i.test(ua)) return 'tablet';
  if (/mobi|iphone|ipod|android|windows phone|blackberry|opera mini/i.test(ua)) return 'mobile';
  return 'desktop';
}

/** Pitch slugs as stored: lowercase letters, numbers and dashes. */
export function validSlug(slug: string): boolean {
  return /^[a-z0-9-]{3,64}$/.test(slug);
}
