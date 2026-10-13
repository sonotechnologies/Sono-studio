import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC_PATHS = ['/login'];

/**
 * Refreshes the Supabase session cookie and sends signed-out visitors to /login.
 * Pages still check the user themselves; this is the fast first gate.
 */
export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const isPublic = PUBLIC_PATHS.includes(request.nextUrl.pathname);

  if (!url || !anonKey) {
    // Dev store: the cookie is verified properly in lib/auth.
    if (!isPublic && !request.cookies.has('sono_dev_session')) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });
  const { data } = await supabase.auth.getUser();
  if (!data.user && !isPublic) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  return response;
}

export const config = {
  // Everything except static files, logos, the public pitch pages (with their open logging, images and checkout),
  // payment webhooks and orders reported by live sites.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|logo/|p/|api/pitch/|api/uploads/|api/pay/|api/sites/|admin|api/admin/|custom-frame|vendor/).*)'],
};
