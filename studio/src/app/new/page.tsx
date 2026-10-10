import type { Metadata } from 'next';
import { getRepo, requireUser } from '@/lib/auth';
import { aiMode } from './ai-mode';
import { SetupFlow } from './setup-flow';

export const metadata: Metadata = { title: 'New site' };

export default async function NewSitePage() {
  await requireUser();
  return <SetupFlow initialJob={null} initialAssets={[]} initialStep={0} aiMode={await aiMode(await getRepo())} />;
}
