import type { ChecklistItem } from '@/export/checklist';
import type { MirrorMeta } from './copy';

/** What to sort out before a copied site replaces the original. */
export function copyChecklist(meta: MirrorMeta): ChecklistItem[] {
  return [
    ...meta.notes.map((n, i) =>
      // Copies made before notes had titles stored plain sentences.
      typeof n === 'string' ? { key: `note-${i}`, title: 'Note', detail: n, done: false, important: true } : { key: `note-${i}`, title: n.title, detail: n.detail, done: false, important: true },
    ),
    {
      key: 'check',
      title: 'Click through it',
      detail: `Open the copy and check each of its ${meta.pages.length} page${meta.pages.length === 1 ? '' : 's'}, the menu, the animations and the phone layout against ${meta.sourceUrl}.`,
      done: false,
    },
    { key: 'domain', title: 'Domain', detail: 'When it’s live, point the client’s domain at it in Vercel → the project → Settings → Domains, and update their DNS records.', done: false },
    {
      key: 'hosting',
      title: 'Hosting account',
      detail: 'Vercel’s free Hobby plan is for non-commercial use. For a paying client, transfer the project to their own Vercel account or use a paid plan.',
      done: false,
    },
  ];
}
