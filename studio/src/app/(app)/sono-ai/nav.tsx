import Link from 'next/link';

// The overview first, so it's in view on a phone.
const TABS = [
  { href: '/sono-ai', label: 'Setup and history' },
  { href: '/sono-ai/chat', label: 'Chat' },
  { href: '/sono-ai/drafts', label: 'Drafts' },
  { href: '/sono-ai/builds', label: 'Builds' },
  { href: '/sono-ai/rules', label: 'Rulebook' },
  { href: '/sono-ai/scorecards', label: 'Scorecards' },
];

export function SonoAiNav({ current }: { current: string }) {
  return (
    <nav aria-label="Sono AI" className="-mb-2 flex gap-[22px] overflow-x-auto border-b border-border [scrollbar-width:thin] max-sm:[mask-image:linear-gradient(to_right,#000_calc(100%-24px),transparent)]">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={t.href === current ? 'page' : undefined}
          className={`-mb-px border-b-2 pb-2.5 text-[15px] whitespace-nowrap ${t.href === current ? 'border-terracotta font-semibold text-text' : 'border-transparent text-muted hover:text-text'}`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
