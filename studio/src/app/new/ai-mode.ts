import 'server-only';
import { demoAllowed } from '@/ai/demo';
import { isAiProvider } from '@/ai/service';
import type { Repo } from '@/lib/data/repo';
import type { AiMode } from './setup-flow';

export async function aiMode(repo: Repo): Promise<AiMode> {
  const rows = (await repo.listProviderKeys()).filter((r) => isAiProvider(r.provider));
  if (rows.length) return 'real';
  return demoAllowed() ? 'demo' : 'none';
}
