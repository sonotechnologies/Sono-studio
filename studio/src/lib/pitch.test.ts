import { describe, expect, it } from 'vitest';
import { deviceFrom, isBotAgent } from './pitch';

const UA = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  android: 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36',
  cubot: 'Mozilla/5.0 (Linux; Android 10; CUBOT X30) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36',
  ipad: 'Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  androidTablet: 'Mozilla/5.0 (Linux; Android 13; SM-X700) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  instagramApp: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 330.0.3.12.235',
  facebookApp: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/460.0]',
  whatsappPreview: 'WhatsApp/2.24.8.78 A',
  facebookPreview: 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
  telegram: 'TelegramBot (like TwitterBot)',
  google: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  slack: 'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)',
  curl: 'curl/8.4.0',
};

describe('pitch visitors', () => {
  it('counts people, including in-app browsers', () => {
    for (const k of ['iphone', 'android', 'cubot', 'ipad', 'androidTablet', 'windows', 'instagramApp', 'facebookApp'] as const) expect(isBotAgent(UA[k]), k).toBe(false);
  });

  it('flags link previews and crawlers', () => {
    for (const k of ['whatsappPreview', 'facebookPreview', 'telegram', 'google', 'slack', 'curl'] as const) expect(isBotAgent(UA[k]), k).toBe(true);
    expect(isBotAgent('')).toBe(true);
  });

  it('tells phones, tablets and computers apart', () => {
    expect(deviceFrom(UA.iphone)).toBe('mobile');
    expect(deviceFrom(UA.android)).toBe('mobile');
    expect(deviceFrom(UA.ipad)).toBe('tablet');
    expect(deviceFrom(UA.androidTablet)).toBe('tablet');
    expect(deviceFrom(UA.windows)).toBe('desktop');
  });
});
