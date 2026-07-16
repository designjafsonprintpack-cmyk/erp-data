# JAFSON PRINT ERP — CONTEXT FILE
**Last Updated:** Phase 5 Complete (Stage 0 — Foundation)
**Current Status:** Stage 0 fully deployed. Ready for Stage 1.

---

## Tech Stack
- **Framework:** Next.js 14.2.5 (App Router)
- **Language:** TypeScript 5 (strict mode)
- **Styling:** Tailwind CSS 3.4 + CSS Variables Theme System
- **Backend:** Supabase (PostgreSQL + Auth + Storage + Realtime)
- **Hosting:** Vercel
- **Key packages:** @supabase/ssr@0.5.2, @supabase/supabase-js@2.45.4, lucide-react, zustand, zod

## Multi-Tenant Architecture
- Shared database, shared schema, row-level isolation
- Every business table has `company_id` column
- RLS enforces tenant isolation automatically
- Custom JWT claims carry: `company_id`, `role`, `department_id`, `full_name`
- Jafson seed company_id: `00000000-0000-0000-0000-000000000001`

## JWT Claims Pattern
```typescript
// Always extract company_id from JWT claims:
const companyId = session?.user?.user_metadata?.company_id 
  || session?.user?.app_metadata?.company_id
```

## Supabase Client Pattern
- **Client-side:** `createSupabaseClient()` from `@/lib/supabase/client`
- **Server-side (RSC/API routes):** `createSupabaseServerClient()` from `@/lib/supabase/server`
- **Admin (service role):** `createSupabaseAdminClient()` from `@/lib/supabase/admin`
- `createSupabaseServerClient()` is synchronous — NO await needed

## File Structure Key Paths
- Pages: `src/app/(dashboard)/[module]/page.tsx`
- Business logic: `src/modules/[module]/services/`
- Shared UI: `src/components/ui/`
- Layout: `src/components/layout/`
- Types: `src/types/shared.ts` (cross-module) + `src/modules/[module]/types/`
- Database migrations: `supabase/migrations/`
- Theme CSS: `src/styles/themes/index.css`

## Theme System
- 5 themes: `github-dark` (default), `dark-blue`, `dark-purple`, `dark-green`, `light`
- Applied via `data-theme` attribute on `<html>`
- All colors via CSS variables — NEVER hardcode hex
- Key tokens: `--color-bg-primary`, `--color-bg-secondary`, `--color-bg-elevated`, `--color-border`, `--color-accent`, `--color-success`, `--color-warning`, `--color-danger`
- Theme stored in localStorage key `erp_theme`

## Layout
- Header height: `var(--header-height)` = 56px
- Sidebar width: `var(--sidebar-width)` = 240px (collapsed: 56px)
- Sidebar state stored in localStorage key `erp_sidebar_collapsed`
- Main content: `margin-left: sidebarWidth; margin-top: header-height`

## Standard Database Pattern (every business table)
```sql
id UUID PRIMARY KEY DEFAULT gen_random_uuid()
company_id UUID NOT NULL REFERENCES companies(id)
created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()  -- auto via trigger
created_by UUID
updated_by UUID
deleted_at TIMESTAMPTZ  -- soft delete
is_active BOOLEAN NOT NULL DEFAULT TRUE
```

## Completed Phases (Stage 0)
- ✅ Phase 1: Project Bootstrap & Folder Structure
- ✅ Phase 2: Supabase Multi-Tenant Base Schema (companies, branches, warehouses)
- ✅ Phase 3: Auth & Session Management (middleware, JWT claims hook, login page)
- ✅ Phase 4: Global Layout Shell (AppShell, Header, Sidebar, all placeholder pages)
- ✅ Phase 5: Theme Engine (5 themes, CSS variables, theme switcher in header)

## Important Rules
- Soft delete only — never hard delete
- company_id always injected server-side from JWT
- Audit triggers on every business table
- NOTIFY pgrst after every migration
- Print pages outside dashboard at `src/app/print/`
