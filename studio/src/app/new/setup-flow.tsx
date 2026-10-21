'use client';

import { ArrowRight, Info } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Logo } from '@/components/logo';
import { btn } from '@/components/ui';
import { presetLabel } from '@/generate/assemble';
import { pagesFor, type Asset, type Brief, type GenerationJob, type Plan } from '@/generate/brief';
import { logoPalette, prepareUpload } from '@/generate/browser-images';
import { LivePreview, PipelineColumn, PlanReview } from './generation';
import { approvePlanAction, importSiteAction, reopenBriefAction, saveBriefAction, startGenerationAction, startWizardAction } from './actions';
import type { CustomStyle } from '@/lib/data/repo';
import { BusinessStep, ContentStep, ReviewStep, StyleStep, type ImportOutcome, type UploadTile } from './wizard-steps';

export type AiMode = 'real' | 'demo' | 'none';

const STEPS = ['Business', 'Style', 'Content', 'Review'];

const EMPTY_BRIEF: Brief = {
  businessName: '',
  businessType: '',
  preset: 'warm-table',
  pages: ['home', 'about', 'contact'],
  paste: '',
  client: { ownerName: '', whatsapp: '', instagram: '', address: '' },
  brandColors: [],
  useBrand: false,
};

function tilesFrom(assets: Asset[]): UploadTile[] {
  return assets
    .filter((a) => a.source === 'upload')
    .map((a) => ({ key: a.id, name: a.alt || (a.kind === 'logo' ? 'logo' : 'photo'), kind: a.kind, state: 'done', asset: a }));
}

export function SetupFlow({
  initialJob,
  initialAssets,
  initialStep,
  aiMode,
  styles,
}: {
  initialJob: GenerationJob | null;
  initialAssets: Asset[];
  initialStep: number;
  aiMode: AiMode;
  styles: CustomStyle[];
}) {
  const router = useRouter();
  const [job, setJob] = useState(initialJob);
  const [brief, setBrief] = useState<Brief>(initialJob?.brief ?? EMPTY_BRIEF);
  const [step, setStep] = useState(initialJob ? initialStep : 0);
  const [tiles, setTiles] = useState<UploadTile[]>(tilesFrom(initialAssets));
  const [planDraft, setPlanDraft] = useState<Plan | null>(initialJob?.plan ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loopRef = useRef(false);

  const inWizard = !job || job.status === 'draft';
  const assets = tiles.flatMap((t) => (t.asset ? [t.asset] : []));

  /* ----- Generation loop: one server step per request until done or waiting for review ----- */
  const runLoop = useCallback(async (jobId: string) => {
    if (loopRef.current) return;
    loopRef.current = true;
    try {
      for (;;) {
        const res = await fetch(`/api/jobs/${jobId}/advance`, { method: 'POST' });
        if (!res.ok) throw new Error(res.status === 401 ? 'You were signed out. Sign in again and reopen this project.' : `The server answered ${res.status}.`);
        const data = (await res.json()) as { job: GenerationJob; busy?: boolean };
        // Another tab is running this step: wait a moment and ask again.
        if (data.busy) await new Promise((r) => setTimeout(r, 3000));
        setJob(data.job);
        // The loop only runs while nothing is being edited, so the server's plan is always the latest.
        setPlanDraft(data.job.plan);
        if (data.job.status !== 'running') break;
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      loopRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (job?.status === 'running') runLoop(job.id);
  }, [job?.status, job?.id, runLoop]);

  useEffect(() => {
    if (job?.status !== 'done') return;
    const t = setTimeout(() => router.push(`/workspace/${job.projectId}`), 1800);
    return () => clearTimeout(t);
  }, [job?.status, job?.projectId, router]);

  /* ----- Wizard ----- */
  const save = async () => {
    if (!job) return;
    await saveBriefAction(job.id, brief);
  };

  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError((err as Error).message || 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const goStep = (n: number) =>
    act(async () => {
      await save();
      setStep(n);
      window.history.replaceState(null, '', `/new/${job!.id}?step=${n}`);
      window.scrollTo(0, 0);
    });

  const canContinue = step === 0 ? brief.businessName.trim().length > 0 && brief.businessType.trim().length > 0 : true;

  const next = () =>
    act(async () => {
      if (step === 0 && !job) {
        const id = await startWizardAction({ businessName: brief.businessName.trim(), businessType: brief.businessType.trim(), pages: brief.pages });
        router.replace(`/new/${id}?step=1`);
        return;
      }
      if (step < 3) {
        await save();
        setStep(step + 1);
        window.history.replaceState(null, '', `/new/${job!.id}?step=${step + 1}`);
        window.scrollTo(0, 0);
        return;
      }
      await save();
      await startGenerationAction(job!.id);
      setJob({ ...job!, brief, status: 'running', error: null });
    });

  const close = () =>
    act(async () => {
      if (job && inWizard) await save();
      router.push(job ? `/projects/${job.projectId}` : '/');
    });

  /* ----- Uploads ----- */
  const onFiles = async (files: File[], forceLogo = false) => {
    if (!job) return;
    for (const file of files) {
      const kind: 'photo' | 'logo' = forceLogo || /logo/i.test(file.name) || file.type === 'image/svg+xml' ? 'logo' : 'photo';
      const key = `${Date.now()}-${Math.random()}`;
      setTiles((t) => [...(kind === 'logo' ? t.filter((x) => x.kind !== 'logo') : t), { key, name: file.name, kind, state: 'uploading' }]);
      try {
        if (!/^image\/(jpeg|png|webp|svg\+xml)$/.test(file.type)) throw new Error('Use JPG, PNG or WebP');
        const prepared = await prepareUpload(file, kind);
        if (kind === 'logo') {
          const colors = await logoPalette(file).catch(() => []);
          setBrief((b) => ({ ...b, brandColors: colors.slice(0, 4), useBrand: colors.length > 0 }));
        }
        const form = new FormData();
        form.set('file', new File([prepared.blob], prepared.name, { type: prepared.blob.type || file.type }));
        form.set('kind', kind);
        form.set('alt', file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '));
        form.set('width', String(prepared.width));
        form.set('height', String(prepared.height));
        const res = await fetch(`/api/projects/${job.projectId}/assets`, { method: 'POST', body: form });
        const data = (await res.json()) as { asset?: Asset; error?: string };
        if (!res.ok || !data.asset) throw new Error(data.error ?? 'Upload failed');
        setTiles((t) => t.map((x) => (x.key === key ? { ...x, state: 'done', asset: data.asset } : x)));
      } catch (err) {
        setTiles((t) => t.map((x) => (x.key === key ? { ...x, state: 'error', error: (err as Error).message } : x)));
      }
    }
  };

  /* ----- Rebuilding the client's current site ----- */
  const onImport = async (url: string, confirmed: boolean): Promise<ImportOutcome> => {
    if (!job) return { error: 'Finish the first step first.' };
    const r = await importSiteAction(job.id, url, confirmed);
    if (r.error || !r.site) return { error: r.error ?? 'That site couldn’t be read.' };
    const site = r.site;
    const assets = r.assets ?? [];
    const logoAsset = assets.find((a) => a.kind === 'logo');
    setTiles((t) => [
      ...(logoAsset ? t.filter((x) => x.kind !== 'logo') : t),
      ...assets.map((a) => ({ key: a.id, name: a.alt || (a.kind === 'logo' ? 'logo' : 'photo'), kind: a.kind, state: 'done' as const, asset: a })),
    ]);
    // The logo's colours, read in the browser as for an upload.
    let colors: string[] = [];
    if (logoAsset) colors = await fetch(logoAsset.url).then((res) => res.blob()).then(logoPalette).catch(() => []);
    setBrief((b) => ({
      ...b,
      businessName: b.businessName || site.businessName || b.businessName,
      pages: [...new Set([...b.pages, ...site.pages])],
      paste: [site.paste, b.paste.trim() ? `## Notes\n${b.paste.trim()}` : ''].filter(Boolean).join('\n\n').slice(0, 12000),
      client: {
        ...b.client,
        whatsapp: b.client.whatsapp || site.client.whatsapp,
        instagram: b.client.instagram || site.client.instagram,
        address: b.client.address || site.client.address,
      },
      ...(colors.length ? { brandColors: colors.slice(0, 4), useBrand: b.useBrand || !b.style } : {}),
    }));
    return { site, photos: assets.filter((a) => a.kind === 'photo').length, logo: !!logoAsset, skipped: r.skippedPhotos ?? 0 };
  };

  const onRemove = async (tile: UploadTile) => {
    setTiles((t) => t.filter((x) => x.key !== tile.key));
    if (tile.kind === 'logo') setBrief((b) => ({ ...b, brandColors: [], useBrand: false }));
    if (tile.asset && job) await fetch(`/api/projects/${job.projectId}/assets/${tile.asset.id}`, { method: 'DELETE' }).catch(() => {});
  };

  /* ----- Review summary ----- */
  const photos = tiles.filter((t) => t.kind === 'photo' && t.state === 'done').length;
  const hasLogo = tiles.some((t) => t.kind === 'logo' && t.state === 'done');
  const reviewRows = [
    { label: 'Business', value: brief.businessName || 'Untitled', edit: () => goStep(0) },
    { label: 'Site type', value: brief.businessType, edit: () => goStep(0) },
    {
      label: 'Pages',
      value: pagesFor(brief).map((p) => p.title).join(', ') + (brief.pages.includes('shop') ? ` · prices in ${brief.currency ?? 'the price list’s currency'}` : ''),
      edit: () => goStep(0),
    },
    { label: 'Style', value: presetLabel(brief), edit: () => goStep(1) },
    {
      label: 'Files',
      value: photos || hasLogo ? [photos && `${photos} photo${photos === 1 ? '' : 's'}`, hasLogo && 'logo'].filter(Boolean).join(' and ') : 'None, stock photos will be used where set up',
      edit: () => goStep(2),
    },
    { label: 'Notes', value: brief.paste.trim() ? brief.paste.trim().slice(0, 160) + (brief.paste.length > 160 ? '…' : '') : 'None', edit: () => goStep(2) },
    {
      label: 'Client',
      value: [brief.client.ownerName, brief.client.whatsapp, brief.client.instagram, brief.client.address].filter(Boolean).join(' · ') || 'No details yet',
      edit: () => goStep(2),
    },
  ];
  const thinInput = brief.paste.trim().length < 80;
  const thinNotice = thinInput && (
    <p className="m-0 flex gap-2.5 rounded-card border border-border bg-surface p-4 text-[14px] leading-normal">
      <Info size={18} className="mt-0.5 flex-none text-accent-text" />
      <span>
        The AI only knows the name and kind of business, so the copy will stay general. For copy that sounds like this business, add a few facts in{' '}
        <button type="button" onClick={() => goStep(2)} className="cursor-pointer font-medium text-accent-text hover:underline">
          Content
        </button>
        : what they offer, prices, opening hours, what makes them different.
      </span>
    </p>
  );
  const notice =
    aiMode === 'demo' ? (
      <p className="m-0 flex gap-2.5 rounded-card border border-border bg-surface p-4 text-[14px] leading-normal">
        <Info size={18} className="mt-0.5 flex-none text-accent-text" />
        <span>
          No AI key yet, so <b className="font-semibold">Demo mode</b> fills the plan and copy from templates. Add a key in{' '}
          <Link href="/settings?tab=providers" className="font-medium text-accent-text hover:underline">
            Settings → AI providers
          </Link>{' '}
          for real copy.
        </span>
      </p>
    ) : aiMode === 'none' ? (
      <p role="alert" className="m-0 flex gap-2.5 rounded-card border border-border bg-surface p-4 text-[14px] leading-normal">
        <Info size={18} className="mt-0.5 flex-none text-danger" />
        <span>
          Add an AI provider key in{' '}
          <Link href="/settings?tab=providers" className="font-medium text-accent-text hover:underline">
            Settings → AI providers
          </Link>{' '}
          before generating.
        </span>
      </p>
    ) : null;

  /* ----- Footer ----- */
  let primary: { label: string; onClick: () => void; disabled?: boolean } | null = null;
  let back: (() => void) | null = null;
  let foot = '';
  if (inWizard) {
    primary = { label: step === 3 ? 'Generate' : 'Continue', onClick: next, disabled: !canContinue || busy || (step === 3 && aiMode === 'none') || tiles.some((t) => t.state === 'uploading') };
    if (step > 0) back = () => goStep(step - 1);
    // Say why the button can't be pressed yet, rather than only fading it.
    foot =
      step === 2 && tiles.some((t) => t.state === 'uploading')
        ? 'Uploading…'
        : !canContinue
          ? 'Add the business name and what kind of business it is to continue.'
          : step === 3 && aiMode === 'none'
            ? 'Add an AI key in Settings → AI providers to generate.'
            : '';
  } else if (job!.status === 'running') {
    foot = job!.plan ? 'Writing page by page. You can close this tab; it picks up where it stopped.' : 'Planning usually takes under a minute.';
  } else if (job!.status === 'plan_review' && planDraft) {
    const n = planDraft.pages.reduce((s, p) => s + p.sections.length, 0);
    primary = {
      label: 'Write content',
      disabled: busy || n === 0,
      onClick: () =>
        act(async () => {
          await approvePlanAction(job!.id, { pages: planDraft.pages.map((p) => ({ id: p.id, sections: p.sections })) });
          setJob({ ...job!, plan: planDraft, status: 'running', error: null });
        }),
    };
    back = () =>
      act(async () => {
        await reopenBriefAction(job!.id);
        setJob({ ...job!, status: 'draft', extracted: null, plan: null, filled: {}, imagesDone: false, steps: [], error: null });
        setPlanDraft(null);
        setStep(3);
      });
    foot = `${n} sections · about ${Math.max(1, Math.round(planDraft.pages.length * 0.4))} minute${planDraft.pages.length > 2 ? 's' : ''} to write`;
  } else if (job!.status === 'failed') {
    primary = {
      label: 'Try again',
      disabled: busy,
      onClick: () =>
        act(async () => {
          await startGenerationAction(job!.id);
          setJob({ ...job!, status: 'running', error: null });
        }),
    };
    if (!job!.plan)
      back = () =>
        act(async () => {
          await reopenBriefAction(job!.id);
          setJob({ ...job!, status: 'draft', extracted: null, plan: null, filled: {}, imagesDone: false, steps: [], error: null });
          setStep(3);
        });
    foot = 'Progress is kept; trying again continues from the step that failed.';
  } else if (job!.status === 'done') {
    primary = { label: 'Open workspace', onClick: () => router.push(`/workspace/${job!.projectId}`) };
    foot = 'Opening the workspace…';
  }

  return (
    <div className="flex h-dvh flex-col bg-bg">
      <header className="flex h-16 flex-none items-center gap-4 border-b border-border px-4 md:px-6">
        <div className="flex flex-1 items-center gap-2.5">
          <Logo kind="mark" alt="Sono" className="h-[18px] w-auto" />
          <span className="text-[14px] font-semibold">New site</span>
        </div>
        {inWizard && (
          <span className="text-[13px] text-muted sm:hidden" aria-hidden>
            Step {step + 1} of 4
          </span>
        )}
        {inWizard && (
          <nav aria-label="Steps" className="hidden items-center gap-2 sm:flex">
            {STEPS.map((name, i) => (
              <div key={name} className="flex items-center gap-2">
                <button
                  type="button"
                  title={name}
                  aria-label={`Step ${i + 1}: ${name}`}
                  aria-current={i === step ? 'step' : undefined}
                  disabled={!job || i > step}
                  onClick={() => goStep(i)}
                  className={`size-3.5 cursor-pointer rounded-full border-[3px] transition-colors duration-200 disabled:cursor-default ${
                    i <= step ? 'border-terracotta' : 'border-border'
                  } ${i < step ? 'bg-terracotta' : 'bg-transparent'}`}
                />
                {i < STEPS.length - 1 && <span className={`h-0.5 w-6 rounded-full ${i < step ? 'bg-terracotta' : 'bg-border'}`} />}
              </div>
            ))}
            <span className="min-w-[140px] pl-2 text-[13px] text-muted">
              Step {step + 1} of 4 · {STEPS[step]}
            </span>
          </nav>
        )}
        <div className="flex flex-1 justify-end">
          <button type="button" onClick={close} className="flex h-[34px] cursor-pointer items-center rounded-full px-3 text-[13px] font-medium text-muted hover:bg-hover hover:text-text">
            {inWizard ? 'Save and close' : 'Close'}
          </button>
        </div>
      </header>

      <main className={`flex min-h-0 flex-1 flex-col ${inWizard ? 'overflow-auto' : 'overflow-auto md:overflow-hidden'}`}>
        {inWizard ? (
          <div key={step} className="mx-auto box-border w-full max-w-[1160px] animate-fade-up px-5 pt-10 pb-28 md:px-8 md:pt-14">
            {step === 0 && <BusinessStep brief={brief} set={setBrief} />}
            {step === 1 && <StyleStep brief={brief} set={setBrief} styles={styles} />}
            {step === 2 && <ContentStep brief={brief} set={setBrief} tiles={tiles} onFiles={onFiles} onRemove={onRemove} onImport={onImport} />}
            {step === 3 && (
              <ReviewStep
                rows={reviewRows}
                notice={
                  <>
                    {thinNotice}
                    {notice}
                  </>
                }
              />
            )}
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
            <PipelineColumn job={job!} />
            <div className="flex min-h-[320px] flex-col gap-5 overflow-auto bg-stage p-5 md:p-10">
              {job!.status === 'plan_review' && planDraft ? (
                <PlanReview plan={planDraft} setPlan={setPlanDraft} brief={job!.brief} />
              ) : job!.plan ? (
                <LivePreview job={job!} assets={assets} />
              ) : (
                <div className="flex flex-1 items-center justify-center text-[14px] text-text/75">The plan appears here when it’s ready.</div>
              )}
            </div>
          </div>
        )}
      </main>

      <footer className="flex h-[76px] flex-none items-center gap-3 border-t border-border bg-bg px-4 md:px-6">
        {back && (
          <button type="button" onClick={back} disabled={busy} className={`${btn.secondary} h-11 px-[18px] text-[15px]`}>
            Back
          </button>
        )}
        <p role="status" className={`m-0 min-w-0 flex-1 truncate text-[13px] ${error ? 'text-danger' : 'text-muted'}`} title={error ?? foot}>
          {error ?? foot}
        </p>
        {primary && (
          <button type="button" onClick={primary.onClick} disabled={primary.disabled} className={`${btn.primary} h-11 gap-2 px-[22px] text-[15px]`}>
            {busy ? 'Saving…' : primary.label}
            <ArrowRight size={16} strokeWidth={2} />
          </button>
        )}
      </footer>
    </div>
  );
}

