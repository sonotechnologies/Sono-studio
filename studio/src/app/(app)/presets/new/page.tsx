import type { Metadata } from 'next';
import { Page } from '@/components/shell';
import { requireUser } from '@/lib/auth';
import { PRESET_IDS, type PresetId } from '@/lib/types';
import { themeFromPreset } from '@/site/theme';
import { StyleEditor } from '../style-editor';

export const metadata: Metadata = { title: 'New style' };

export default async function NewStylePage({ searchParams }: { searchParams: Promise<{ base?: string }> }) {
  await requireUser();
  const { base } = await searchParams;
  const preset: PresetId = PRESET_IDS.includes(base as PresetId) ? (base as PresetId) : 'warm-table';
  return (
    <Page title="New style" width={1200}>
      <StyleEditor initial={{ name: '', note: '', theme: themeFromPreset(preset) }} />
    </Page>
  );
}
