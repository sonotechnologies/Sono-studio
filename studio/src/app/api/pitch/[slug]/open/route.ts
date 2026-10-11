import { getRepo, getUser } from '@/lib/auth';
import { deviceFrom, isBotAgent, validSlug } from '@/lib/pitch';

/**
 * Called once per visit by the pitch page after it loads. Link-preview fetchers
 * don't run scripts, so they rarely get here; when one does, it is flagged as a bot.
 * Your own visits while signed in are not counted.
 */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!validSlug(slug)) return new Response(null, { status: 404 });
  if (await getUser()) return new Response(null, { status: 204 });
  const ua = req.headers.get('user-agent') ?? '';
  let path = '/';
  try {
    const body = (await req.json()) as { path?: unknown };
    if (typeof body.path === 'string' && /^\/[a-z0-9-/]{0,99}$/.test(body.path)) path = body.path;
  } catch {}
  try {
    await (await getRepo()).logPitchOpen(slug, { device: deviceFrom(ua), isBot: isBotAgent(ua), path });
  } catch (err) {
    console.error('pitch open not logged', err);
  }
  return new Response(null, { status: 204 });
}
