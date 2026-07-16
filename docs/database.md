# JAFSON PRINT ERP — DATABASE REFERENCE
**Last Updated:** Stage 0 Complete (Phase 5)

## Migrations Run
1. `001_base_schema.sql` — companies, branches, warehouses + RLS
2. `002_auth_users.sql` — departments, roles, users, JWT claims hook, login_history
3. `003_audit_notifications.sql` — audit_log (partitioned), activity_log (partitioned), notifications
4. `004_attachments_themes.sql` — attachments (polymorphic), themes, user_preferences

## Tables Created
### Core
- `companies` — multi-tenant root table
- `branches` — company branches
- `warehouses` — stock locations
- `departments` — org structure (12 seeded for Jafson)
- `roles` — permission roles (9 seeded)
- `users` — user profiles linked to auth.users
- `login_history` — audit trail for logins

### Infrastructure
- `audit_log` — IMMUTABLE, partitioned by month, trigger-driven
- `activity_log` — IMMUTABLE, partitioned by month
- `notifications` — in-app notifications, Realtime-enabled
- `attachments` — polymorphic file attachments
- `themes` — theme configurations (5 seeded)
- `user_preferences` — per-user UI settings

## Seeded Data (company_id: 00000000-0000-0000-0000-000000000001)
- 1 company: Jafson Print Pack
- 1 branch: Head Office
- 1 warehouse: Main Store
- 12 departments: Management, Sales, Artwork, Planning, Store, Printing, Lamination, Die Cutting, Hot Foil, Folder Gluing, Packing, Dispatch
- 9 roles: superadmin, admin, owner, sales, artwork, planning, store, printing, dispatch
- 5 themes: github-dark (default), dark-blue, dark-purple, dark-green, light

## Key Functions
- `update_updated_at_column()` — trigger function for auto-updating updated_at
- `log_audit_event()` — generic audit trigger, attach as `trg_audit_<table>`
- `custom_access_token_hook(event)` — JWT claims hook (register in Supabase Auth Hooks)

## RLS Pattern
Every table: `USING (company_id = (auth.jwt() ->> 'company_id')::UUID)`
Immutable tables (audit_log, activity_log): SELECT only

## Supabase Setup Required
1. Run all 4 migrations in order
2. Register `custom_access_token_hook` in Supabase Dashboard → Auth → Hooks
3. Enable Realtime for `notifications` table (already in migration)
4. Create storage buckets: `artwork`, `attachments`, `dispatch-pod`, `company-assets`
