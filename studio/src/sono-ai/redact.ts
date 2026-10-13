/*
 * Swaps client details for placeholders ("Client A", "Phone 1") before
 * anything is written to the knowledge bank. Known details come from the
 * project and its client record; emails, phone numbers and @handles found in
 * free text are caught by pattern. The placeholder table is kept per project
 * so the same value always gets the same placeholder.
 */

export type RedactionKind = 'business' | 'person' | 'phone' | 'email' | 'handle' | 'address';

export interface Redaction {
  placeholder: string;
  kind: RedactionKind;
  value: string;
}

/** What the studio knows about a project's client. */
export interface ClientDetails {
  businessName?: string;
  ownerName?: string;
  whatsapp?: string;
  instagram?: string;
  address?: string;
}

const LABEL: Record<RedactionKind, string> = {
  business: 'Client',
  person: 'Person',
  phone: 'Phone',
  email: 'Email',
  handle: 'Handle',
  address: 'Address',
};

/** Words too common to redact on their own when they are part of a name. */
const COMMON = new Set(['the', 'and', 'for', 'with', 'from', 'studio', 'kitchen', 'shop', 'store', 'salon', 'cafe', 'café', 'restaurant', 'house', 'lab', 'co', 'ltd', 'inc', 'mrs', 'mr', 'miss', 'dr']);

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// "+234 803 000 0000", "(0803) 000-0000": at least 9 digits, so prices and years are left alone.
const PHONE = /(?<![\w.])\+?\(?\d[\d\s().-]{7,}\d(?![\w.])/g;
const HANDLE = /(?<![\w@])@[A-Za-z0-9_](?:[A-Za-z0-9_.]{1,28}[A-Za-z0-9_])(?![\w@])/g;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const digits = (s: string) => s.replace(/\D/g, '');

export class Redactor {
  private entries: Redaction[];
  /** Placeholders added since the redactor was made, to be saved to the map. */
  readonly added: Redaction[] = [];

  constructor(existing: Redaction[] = [], client: ClientDetails = {}) {
    this.entries = [...existing];
    if (client.businessName) this.ensure('business', client.businessName);
    if (client.ownerName) {
      this.ensure('person', client.ownerName);
      // First or last name on its own ("Amara"), when it isn't an everyday word.
      for (const part of client.ownerName.split(/\s+/)) if (part.length >= 3 && !COMMON.has(part.toLowerCase())) this.ensure('person', part);
    }
    if (client.whatsapp && digits(client.whatsapp).length >= 7) this.ensure('phone', client.whatsapp);
    if (client.instagram) this.ensure('handle', client.instagram.startsWith('@') ? client.instagram : `@${client.instagram}`);
    if (client.address) this.ensure('address', client.address);
  }

  /** The placeholder for a value, adding one if it's new. Names that share a person's placeholder stay together. */
  private ensure(kind: RedactionKind, raw: string): string {
    const value = raw.trim();
    const same = (e: Redaction) => e.kind === kind && (kind === 'phone' ? digits(e.value) === digits(value) : e.value.toLowerCase() === value.toLowerCase());
    const found = this.entries.find(same);
    if (found) return found.placeholder;
    // A first or last name shares the full name's placeholder.
    const person = kind === 'person' ? this.entries.find((e) => e.kind === 'person' && e.value.split(/\s+/).some((p) => p.toLowerCase() === value.toLowerCase())) : undefined;
    const n = new Set(this.entries.filter((e) => e.kind === kind).map((e) => e.placeholder)).size;
    const placeholder = person?.placeholder ?? (kind === 'business' ? `${LABEL[kind]} ${String.fromCharCode(65 + (n % 26))}${n >= 26 ? Math.floor(n / 26) : ''}` : `${LABEL[kind]} ${n + 1}`);
    const entry = { placeholder, kind, value };
    this.entries.push(entry);
    this.added.push(entry);
    return placeholder;
  }

  redact(text: string): string {
    if (!text) return text;
    // Patterns first, so a name inside an email ("amara@…") goes with the email.
    let out = text.replace(EMAIL, (m) => this.ensure('email', m));
    out = out.replace(PHONE, (m) => (digits(m).length >= 9 && digits(m).length <= 15 ? this.ensure('phone', m) : m));
    out = out.replace(HANDLE, (m) => this.ensure('handle', m));
    // Then known names and addresses, longest first so "Kora Kitchen Lagos" goes before "Kora Kitchen".
    const known = [...this.entries].filter((e) => e.kind !== 'phone' && e.kind !== 'email').sort((a, b) => b.value.length - a.value.length);
    for (const e of known) {
      const edge = /^\w/.test(e.value) ? '(?<![\\w])' : '';
      const end = /\w$/.test(e.value) ? '(?![\\w])' : '';
      out = out.replace(new RegExp(`${edge}${escape(e.value)}${end}`, 'gi'), e.placeholder);
    }
    return out;
  }

  /** Puts the real values back (for the studio's own eyes, never stored). */
  restore(text: string): string {
    const seen = new Map<string, string>();
    for (const e of this.entries) if (!seen.has(e.placeholder)) seen.set(e.placeholder, e.value);
    return [...seen.entries()]
      .sort((a, b) => b[0].length - a[0].length)
      .reduce((s, [p, v]) => s.replace(new RegExp(`(?<![\\w])${escape(p)}(?![\\w])`, 'g'), v), text);
  }
}
