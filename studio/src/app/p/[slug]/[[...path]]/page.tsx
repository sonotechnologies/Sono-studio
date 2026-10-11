import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { cache } from 'react';
import { getRepo } from '@/lib/auth';
import { shortDate, siteUrl } from '@/lib/format';
import { validSlug } from '@/lib/pitch';
import { whatsappHref } from '@/site/primitives';
import { findPage, SitePageView } from '@/site/render';
import { siteConfigSchema, type SiteConfig } from '@/site/schema';
import { PitchShell } from '../pitch-shell';

type Props = { params: Promise<{ slug: string; path?: string[] }> };

/** One read per request, shared by the metadata and the page. */
const load = cache(async (slug: string) => {
  if (!validSlug(slug)) return null;
  const pitch = await (await getRepo()).getPitch(slug);
  if (!pitch) return null;
  const parsed = pitch.config ? siteConfigSchema.safeParse(pitch.config) : null;
  return { pitch, config: parsed?.success ? parsed.data : null };
});

function heroImage(config: SiteConfig): string | undefined {
  for (const s of config.pages.find((p) => p.path === '/')?.sections ?? []) {
    const src = (s.content as { image?: { src?: string } }).image?.src;
    if (src) return src.startsWith('/') ? `${siteUrl()}${src}` : src;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await load((await params).slug);
  if (!data?.config) return { title: { absolute: data?.pitch.name ?? 'Not found' }, robots: { index: false, follow: false } };
  const { meta } = data.config;
  const image = heroImage(data.config);
  // What WhatsApp and Instagram show when the link is shared.
  return {
    title: { absolute: meta.businessName },
    description: meta.description,
    robots: { index: false, follow: false },
    openGraph: { title: meta.businessName, description: meta.description, type: 'website', ...(image ? { images: [image] } : {}) },
  };
}

export default async function PitchPage({ params }: Props) {
  const { slug, path } = await params;
  const data = await load(slug);
  if (!data) notFound();
  const { pitch, config } = data;
  // A live site replaces its concept: links already sent keep working.
  if (pitch.liveUrl && /^https:\/\//.test(pitch.liveUrl)) redirect(`${pitch.liveUrl.replace(/\/+$/, '')}/${(path ?? []).join('/')}`);

  if (pitch.paused || !config) {
    const expired = !pitch.paused && pitch.expiresAt && new Date(pitch.expiresAt) <= new Date();
    return (
      <Unavailable
        name={pitch.name}
        title={pitch.paused ? 'This concept is paused' : expired ? 'This link has expired' : 'This concept isn’t ready yet'}
        body={expired ? `The preview link for ${pitch.name} ended on ${shortDate(pitch.expiresAt!)}.` : `The preview of ${pitch.name} isn’t available right now.`}
        whatsapp={pitch.whatsapp}
      />
    );
  }

  const sitePath = `/${(path ?? []).join('/')}`;
  const page = findPage(config, sitePath);
  if (!page) notFound();
  const base = `/p/${slug}`;
  const link = (href: string) => {
    const [p, hash] = href.split('#');
    return `${base}${p === '/' ? '' : p}${hash ? `#${hash}` : ''}`;
  };

  return (
    <PitchShell slug={slug} path={sitePath} banner={pitch.banner ? { whatsapp: pitch.whatsapp, instagram: pitch.instagram, businessName: config.meta.businessName } : null}>
      <SitePageView config={config} page={page} ctx={{ link, editable: false }} className="min-h-dvh" />
    </PitchShell>
  );
}

function Unavailable({ name, title, body, whatsapp }: { name: string; title: string; body: string; whatsapp: string }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-[#F7F5F1] p-6 text-center text-[#16140F]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo/sono-mark.svg" alt="Sono Technologies" className="h-10 w-auto" />
      <h1 className="m-0 text-[22px] font-semibold tracking-[-0.01em]">{title}</h1>
      <p className="m-0 max-w-[420px] text-[15px] leading-normal text-[#6B665C]">{body}</p>
      {whatsapp && (
        <a
          href={whatsappHref(whatsapp, `Hi, the website concept link for ${name} isn’t working. Could you send a new one?`)}
          target="_blank"
          rel="noreferrer"
          className="mt-2 flex h-11 items-center rounded-full bg-[#B4502E] px-5 text-[14px] font-semibold text-white hover:bg-[#A24627]"
        >
          Ask Sono Technologies for a new link
        </a>
      )}
    </main>
  );
}
