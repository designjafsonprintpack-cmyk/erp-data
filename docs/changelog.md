# CHANGELOG

## Stage 0 — Foundation (Phases 1–5) — July 2026

### Phase 1 — Project Bootstrap
- Next.js 14.2.5 App Router initialized
- TypeScript strict mode
- Tailwind CSS configured with ERP-specific theme tokens
- Folder structure created per FOLDER_STRUCTURE.md
- Environment variable structure

### Phase 2 — Base Schema
- Migration 001: companies, branches, warehouses tables
- Multi-tenant architecture with company_id RLS
- Seed data: Jafson Print Pack company

### Phase 3 — Authentication
- Supabase Auth integration
- Middleware for route protection
- JWT custom claims hook (company_id, role, department_id)
- Login page with Suspense boundary
- Auth callback route
- Client/Server/Admin Supabase wrappers

### Phase 4 — Layout Shell
- AppShell component (Header + Sidebar + main content)
- Collapsible sidebar with localStorage persistence
- Role-based sidebar navigation (26 nav items)
- Header with search, notifications, theme switcher, profile menu
- Placeholder pages for all 21 modules + production sub-routes

### Phase 5 — Theme Engine
- 5 themes: GitHub Dark (default), Dark Blue, Dark Purple, Dark Green, Light
- CSS variable token system (15 tokens per theme)
- Print-forced light theme
- Theme stored in localStorage and applied to HTML data-theme attribute
- Theme switcher in header dropdown

## Build Status
✅ Build passes — 0 TypeScript errors — 29 pages generated
