import type { Metadata } from 'next';
import { ToastProvider } from '@/components/ui';
import { requireAdmin } from '@/lib/admin';
import { getRepo } from '@/lib/auth';
import { pitchUrl } from '@/lib/format';
import { siteConfigSchema } from '@/site/schema';
import { AdminApp } from './admin-app';

export const metadata: Metadata = { title: 'Edit your website', robots: { index: false } };

export default async function AdminPage() {
  const { token, me } = await requireAdmin();
  const parsed = siteConfigSchema.safeParse(me.config);
  if (!parsed.success) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-bg p-6 text-center">
        <p className="m-0 max-w-[420px] text-[15px] text-muted">Your website can’t be edited here right now. Ask your web designer to have a look.</p>
      </main>
    );
  }
  const config = parsed.data;
  const repo = await getRepo();
  const [orders, bookings, assets] = await Promise.all([
    config.store ? repo.adminOrders(token) : Promise.resolve(null),
    config.bookings ? repo.adminBookings(token, new Date(Date.now() - 7 * 86_400_000).toISOString()) : Promise.resolve(null),
    repo.adminAssets(token),
  ]);
  return (
    <ToastProvider>
      <AdminApp
        me={{ name: me.name, email: me.email, projectId: me.projectId, projectName: me.projectName }}
        siteUrl={me.liveUrl ?? pitchUrl(me.pitchSlug)}
        initialConfig={config}
        version={me.version}
        orders={orders}
        bookings={bookings}
        initialAssets={assets}
        now={Date.now()}
      />
    </ToastProvider>
  );
}
