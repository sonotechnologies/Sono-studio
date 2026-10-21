import { cookies } from 'next/headers';
import { BottomTabs, Sidebar } from '@/components/shell';
import { SiteFonts } from '@/components/site-fonts';
import { ToastProvider } from '@/components/ui';
import { requireUser } from '@/lib/auth';
import { SIDEBAR_COOKIE } from '@/lib/constants';
import { sonoAiEnabled } from '@/sono-ai';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  const sidebarOpen = (await cookies()).get(SIDEBAR_COOKIE)?.value !== 'closed';
  return (
    <ToastProvider>
      <SiteFonts />
      <div className="flex h-dvh overflow-hidden">
        <Sidebar initialOpen={sidebarOpen} sonoAi={sonoAiEnabled()} />
        <div className="flex min-w-0 flex-1 flex-col">
          {children}
          <BottomTabs sonoAi={sonoAiEnabled()} />
        </div>
      </div>
    </ToastProvider>
  );
}
