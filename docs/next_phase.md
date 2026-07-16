# NEXT PHASE: Stage 1 — Platform Configuration Engine
## Start with Phase 6: Roles, Permissions & Permission Matrix Engine

### Objective
Build the roles and permissions system:
- `permissions` table (module_key + action columns)
- `role_permissions` junction table
- `user_roles` junction table
- Permission matrix admin UI (View/Create/Edit/Delete/Approve/Reject/Print/Export/Settings per module)
- `has_permission(user_id, module, action)` Postgres function
- `usePermission(module, action)` React hook
- Server-side permission check utility

### Depends On
- Phase 3 (Auth) ✅
- Migration 002 (roles, users tables) ✅

### Key Files to Modify
- New migration: `supabase/migrations/005_permissions.sql`
- New module: `src/modules/settings/permissions/`
- New page: `src/app/(dashboard)/settings/permissions/page.tsx`

### How to Resume
1. Upload `docs/context.md` and `docs/database.md`
2. Say "Start Phase 6 — Permissions"
