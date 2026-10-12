import type { Metadata } from 'next';
import { Page } from '@/components/shell';
import { getRepo, requireUser } from '@/lib/auth';
import { demoAllowed } from '@/ai/demo';
import { availability, isAiProvider } from '@/ai/service';
import { usageToday } from '@/lib/data/repo';
import { isDevStore } from '@/lib/env';
import { siteUrl } from '@/lib/format';
import type { KeyView } from './keys-panels';
import { SettingsTabs, type SettingsTab } from './settings-tabs';

export const metadata: Metadata = { title: 'Settings' };

const TABS: SettingsTab[] = ['providers', 'connections', 'payments', 'pitch', 'account'];

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requireUser();
  const { tab } = await searchParams;
  const repo = await getRepo();
  const [settings, rows] = await Promise.all([repo.getSettings(), repo.listProviderKeys()]);
  const active = TABS.includes(tab as SettingsTab) ? (tab as SettingsTab) : 'providers';
  // Only what the page needs to show; the encrypted key never leaves the server.
  const keys: KeyView[] = rows.map((r) => ({
    provider: r.provider,
    hint: r.hint,
    models: r.models,
    position: r.position,
    dailyLimit: r.dailyLimit,
    usage: usageToday(r),
    cooldownUntil: r.cooldownUntil,
    state: availability(r),
  }));
  const demo = !rows.some((r) => isAiProvider(r.provider)) && demoAllowed();
  return (
    <Page title="Settings" width={880}>
      <SettingsTabs tab={active} settings={settings} email={user.email} keys={keys} demo={demo} supabase={!isDevStore()} siteUrl={siteUrl()} />
    </Page>
  );
}
