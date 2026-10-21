import 'server-only';
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto';

/**
 * AES-256-GCM for provider keys at rest. SONO_ENCRYPTION_KEY is 32 random
 * bytes, base64-encoded (`openssl rand -base64 32`). The dev store falls back
 * to a fixed development key; production refuses to run without a real one.
 */
function key(): Buffer {
  const raw = process.env.SONO_ENCRYPTION_KEY;
  if (raw) {
    const buf = Buffer.from(raw, 'base64');
    if (buf.length !== 32) throw new Error('SONO_ENCRYPTION_KEY must be 32 bytes, base64-encoded');
    return buf;
  }
  if (process.env.NODE_ENV === 'production' && process.env.SONO_ALLOW_DEV_STORE !== '1') {
    throw new Error('SONO_ENCRYPTION_KEY is not set');
  }
  return createHash('sha256').update('sono-studio-development-only').digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), body.toString('base64')].join(':');
}

export function decryptSecret(sealed: string): string {
  const [v, iv, tag, body] = sealed.split(':');
  if (v !== 'v1' || !iv || !tag || !body) throw new Error('Unrecognised secret format');
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(body, 'base64')), decipher.final()]).toString('utf8');
}

/**
 * A saved key, or null when it can't be opened (the encryption key changed, or
 * the row is damaged): callers skip it and ask for it again instead of failing.
 */
export function openSecret(sealed: string): string | null {
  try {
    return decryptSecret(sealed);
  } catch (err) {
    console.warn('A saved key could not be decrypted:', (err as Error).message);
    return null;
  }
}

/** "Key saved · ends 7f2a", never more of the key than that. */
export function keyHint(plain: string): string {
  return plain.slice(-4);
}

/** A secret for one purpose, derived from the encryption key, so it needs no storage of its own. */
export function serverSecret(purpose: string): string {
  return createHmac('sha256', key()).update(`sono:${purpose}`).digest('hex');
}
