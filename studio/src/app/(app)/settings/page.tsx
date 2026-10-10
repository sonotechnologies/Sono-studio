import type { Metadata } from 'next';
import { Page } from '@/components/shell';
import { getRepo, requireUser } from '@/lib/auth';
import { SettingsTabs, type SettingsTab } from './settings-tabs';

export const metadata: Metadata = { title: 'Settings' };

const TABS: SettingsTab[] = ['providers', 'connections', 'pitch', 'account'];

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requireUser();
  const { tab } = await searchParams;
  const settings = await (await getRepo()).getSettings();
  const active = TABS.includes(tab as SettingsTab) ? (tab as SettingsTab) : 'pitch';
  return (
    <Page title="Settings" width={880}>
      <SettingsTabs tab={active} settings={settings} email={user.email} />
    </Page>
  );
}
