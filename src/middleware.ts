import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PUBLIC_ROUTES = ['/login', '/auth/callback', '/auth/reset-password']
const PRINT_ROUTES = ['/print']

/**
 * Customer-facing token links — the token IS the credential (CLAUDE.md §3):
 * a crypto-random token with an expiry on the row, validated server-side with
 * the service-role client. There is no session and there never will be one.
 *
 * WHAT WAS BROKEN
 *   Neither of these was listed anywhere in this file, so both fell through to
 *   `if (!user && !isPublicRoute)` and **redirected the customer to /login**.
 *   The quotation approval link and the customer portal have been unreachable
 *   for the people they were built for. Nothing errored — the visitor just
 *   landed on a login screen for a company they don't work at.
 *
 *   It survived because every test of these went through /api/v1/public/... ,
 *   and `isApiRoute` returns early two checks above. The API half was always
 *   reachable; only the page a human opens was not.
 *
 *   (`/artwork/approve` was the third. That page has since been retired —
 *   artwork approval is taken on WhatsApp — so it is deliberately not listed.)
 *
 * WHY NOT JUST ADD THEM TO PUBLIC_ROUTES
 *   That list also does the reverse: a logged-in user visiting one is bounced
 *   to /dashboard. A staff member checking the link they just sent would never
 *   see it. These routes are open to everybody, signed in or not.
 */
const TOKEN_ROUTES = ['/approve', '/portal']

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const { pathname } = request.nextUrl

  const isPublicRoute = PUBLIC_ROUTES.some(r => pathname.startsWith(r))
  const isPrintRoute  = PRINT_ROUTES.some(r => pathname.startsWith(r))
  const isApiRoute = pathname.startsWith('/api/')
  // Prefix match with a boundary, so /approve/<token> matches but a future
  // /approvals page would not be silently made public.
  const isTokenRoute = TOKEN_ROUTES.some(r => pathname === r || pathname.startsWith(`${r}/`))

  if (isApiRoute) return supabaseResponse

  // Open to everyone — signed in or not. Access is decided by the token itself,
  // server-side, on the page and in the route it calls.
  if (isTokenRoute) return supabaseResponse

  // Print routes: allow if logged in, redirect to login if not
  if (isPrintRoute) {
    if (!user) {
      const loginUrl = new URL('/login', request.url)
      loginUrl.searchParams.set('redirect', pathname)
      return NextResponse.redirect(loginUrl)
    }
    return supabaseResponse  // logged in — show print page as-is, no dashboard redirect
  }

  if (!user && !isPublicRoute) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  if (user && isPublicRoute) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|public/).*)'],
}
