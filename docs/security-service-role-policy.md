# Service-Role Client Usage Policy

**File:** `src/lib/supabase/admin.ts` — `createSupabaseAdminClient()`

The service-role key bypasses Row Level Security entirely. Every query made
with it sees every company's data, with no tenant isolation. This is
necessary for a small number of routes and dangerous everywhere else — this
document exists so that stays true as the codebase and team grow, not just
as tribal knowledge from the original build.

## The Rule

**Only use `createSupabaseAdminClient()` in a route that has no
authenticated user session to work with.** If `supabase.auth.getUser()` can
return a real user for the request, use `createSupabaseServerClient()`
instead — that client respects RLS and scopes every query to the caller's
own company automatically. There is no other reason to reach for the admin
client. In particular:

- Needing to query across companies is **not** a valid reason on its own —
  see `admin/companies/route.ts`, which does this correctly by checking the
  caller's `app_role` claim server-side with the *regular* server client and
  RLS still active, not by switching to the admin client.
- "It's simpler" or "avoids an RLS policy edge case" are not valid reasons —
  fix the RLS policy or the query instead.

## Approved Use Cases (as of this policy)

Every current use of `createSupabaseAdminClient()` falls into exactly one of
these two categories. A new use should too — if it doesn't fit either, it's
very likely wrong.

**1. Public, unauthenticated, token-scoped routes** — the request carries a
crypto-random token instead of a session, and the token itself (validated
server-side against the DB, with an expiry check) is what proves the
caller's right to see/act on that one record. There is no `auth.uid()` for
RLS to check against, so the admin client is the only way to read/write the
row at all.
- `src/app/api/v1/public/quotations/[token]/route.ts`
- `src/app/api/v1/public/artwork/[token]/route.ts`
- `src/app/api/v1/public/portal/[token]/route.ts`

**2. Pre-session / no-session server processes** — code that runs before a
session exists (login, checking lockout state) or without one entirely
(a cron job with no human caller).
- `src/app/api/v1/auth/login/route.ts` — pre-auth lockout check/counter;
  the actual sign-in itself still goes through `createSupabaseServerClient()`
  so session cookies are set normally.
- `src/app/api/cron/send-scheduled-reports/route.ts` — triggered by Vercel
  Cron (see `CRON_SECRET` check), not a logged-in user.

## Adding a New Use

Before adding a new `createSupabaseAdminClient()` call anywhere:

1. Confirm it genuinely fits one of the two categories above.
2. Add a code comment at the call site explaining which category and why —
   every existing use already does this; match that pattern.
3. Add it to the "Approved Use Cases" list in this file in the same change.

If it doesn't fit either category, it almost certainly shouldn't use the
admin client — use `createSupabaseServerClient()` and let RLS do its job.
