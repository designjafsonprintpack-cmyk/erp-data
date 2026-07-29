# Security Standards

Security in this ERP is not a separate audit pass — check for it on every
change, because the data involved (client artwork/IP, pricing, purchase
costs, customer contact info) is business-sensitive and the system spans
multiple companies.

## Authentication & authorization

- Every API route / server action must check **both** "is this user
  authenticated" and "is this user authorized for this specific action on
  this specific company's data" — authentication alone is not
  authorization.
- Never trust a `company_id` or `role` sent from the client in a request
  body for an authorization decision — resolve it server-side from the
  authenticated session/JWT.
- Session/JWT expiry and refresh should be handled by Supabase Auth's
  standard flow — don't hand-roll token handling unless there's a specific
  reason already established in the codebase.
- Password reset, invite, and account-linking flows are common places for
  subtle auth bugs (e.g., an invite token that doesn't expire, or that
  leaks another company's user list) — review these extra carefully if
  touched.

## Row Level Security (see also `02`)

- RLS is the primary enforcement layer for multi-company isolation — verify
  it's actually enabled (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`) on
  every table with business data, not just written-but-disabled policies.
- A table with a policy defined but RLS not enabled provides **zero**
  protection — this is an easy, dangerous mistake to miss; check for it
  explicitly.
- Test policies from the perspective of an actual non-admin user role
  whenever reviewing them, not just "does the query run for a service-role
  key" (which bypasses RLS entirely and will always "work").

## Secrets & credentials

- Supabase service-role key, WhatsApp/email provider API keys, and any
  other secret must live in server-only environment variables, never
  `NEXT_PUBLIC_*` (which is inlined into the client bundle at build time
  and is not a secret once used that way).
- Flag immediately if you see a service-role key, API key, or credential
  hardcoded in source, committed in a `.env` file that isn't gitignored, or
  used in client-side code.
- Rotate-on-suspicion: if a secret appears to have been exposed (e.g.,
  committed to git history), say so explicitly rather than just fixing the
  current usage — git history retains it until actively purged/rotated.

## Input validation & injection

- All user-supplied input (forms, file uploads, webhook payloads from
  WhatsApp/email providers) must be validated server-side before use, even
  if also validated client-side (client validation is UX, not security).
- Parameterize all queries — Supabase's query builder does this by default;
  if raw SQL or RPC calls with string interpolation appear anywhere, treat
  it as a SQL injection risk and flag it.
- File uploads (artwork files, proof images) need: file type validation
  (not just trusting the extension), size limits, and storage in a location
  with correct access policies (Supabase Storage bucket policies mirror RLS
  concerns — a bucket that's "public" when artwork should be
  company-restricted is a real, common misconfiguration).

## Third-party integrations (WhatsApp, Email)

- Webhook endpoints receiving WhatsApp/email provider callbacks must verify
  the request's authenticity (signature/token verification per the
  provider's docs) — an unauthenticated webhook endpoint that can trigger
  status changes or send messages is an abuse vector.
- Rate-limit outbound notification sending where feasible — a bug that
  loops and sends 500 WhatsApp messages to a client is a real reputational
  and cost incident in this domain.
- Don't log full message content containing customer PII/phone numbers at
  a verbose level in a way that ends up in shared logs/error trackers
  without reason.

## Data sensitivity specific to this domain

- **Artwork files** are client intellectual property — access control on
  storage should be at least as strict as on the database records
  referencing them. A leaked unreleased packaging design is a real client
  relationship risk.
- **Pricing/costing data** (material costs, machine rates) is commercially
  sensitive within a multi-company or multi-role setup — make sure roles
  like general shop-floor staff aren't granted read access to cost data
  they don't need for their job (principle of least privilege extends to
  role design, not just table-level RLS).
- **Customer contact info** (phone numbers used for WhatsApp) should be
  treated with the same care as any PII — access-controlled, not exposed
  in client-side bundles or logs unnecessarily.

## When reviewing, call out severity

Don't flatten every finding to the same weight. Distinguish:
- **Critical** — data from one company visible to another; secrets exposed;
  unauthenticated write endpoints.
- **High** — missing server-side authorization check; RLS disabled on a
  sensitive table; unvalidated file upload.
- **Medium** — verbose error messages leaking internals; missing rate
  limiting; overly broad role permissions.
- **Low** — logging hygiene, defense-in-depth gaps where a primary control
  already exists.

Say which is which so the user can prioritize fixes correctly rather than
treating everything as equally urgent.
