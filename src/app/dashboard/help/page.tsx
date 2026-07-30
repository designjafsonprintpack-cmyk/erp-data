import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import HelpClient from './HelpClient'

/**
 * The manual. Deliberately NOT permission-gated — see NavLink.alwaysVisible in
 * navConfig.ts. A read-only guide grants no access, and the one role most
 * likely to be handed the system cold (`admin`) has no `dashboard` permission
 * at all, so any gate would hide the manual from exactly the wrong person.
 *
 * The prose lives in src/lib/help/content.ts. What is fetched HERE is the one
 * thing that must never go stale: which screens each role can actually open.
 * Writing that down would make it a lie the first time a permission changed in
 * Settings → Roles & Permissions.
 */
export default async function HelpPage() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  const companyId = user ? await getCompanyId(user, supabase) : '00000000-0000-0000-0000-000000000001'

  const [rolesRes, viewPermsRes] = await Promise.all([
    supabase.from('roles' as any)
      .select('slug, name, description')
      .eq('company_id', companyId).is('deleted_at', null).eq('is_active', true)
      .order('slug'),
    // Only the `view` action decides whether a screen opens at all, so the join
    // is narrowed to it first. That matters: role_permissions holds over 1300
    // rows and PostgREST silently caps a select at 1000 with no error — the
    // array just stops. Filtering to `view` brings the second query to a few
    // hundred rows, provably under the cap, which is the pattern CLAUDE.md
    // requires instead of paging blind.
    supabase.from('permissions' as any)
      .select('id, module')
      .eq('company_id', companyId).eq('action', 'view')
      .is('deleted_at', null).eq('is_active', true),
  ])

  const viewPerms = (viewPermsRes.data ?? []) as unknown as Array<{ id: string; module: string }>
  const moduleByPermId = new Map(viewPerms.map(p => [p.id, p.module]))

  // role slug -> modules that role can view.
  const roleModules: Record<string, string[]> = {}
  if (viewPerms.length) {
    const [roleRowsRes, rpRes] = await Promise.all([
      supabase.from('roles' as any).select('id, slug')
        .eq('company_id', companyId).is('deleted_at', null),
      supabase.from('role_permissions' as any)
        .select('role_id, permission_id')
        .eq('company_id', companyId).is('deleted_at', null).eq('is_active', true)
        .in('permission_id', viewPerms.map(p => p.id)),
    ])
    const slugByRoleId = new Map(
      ((roleRowsRes.data ?? []) as unknown as Array<{ id: string; slug: string }>).map(r => [r.id, r.slug])
    )
    for (const row of (rpRes.data ?? []) as unknown as Array<{ role_id: string; permission_id: string }>) {
      const slug = slugByRoleId.get(row.role_id)
      const mod = moduleByPermId.get(row.permission_id)
      if (!slug || !mod) continue
      ;(roleModules[slug] ||= []).push(mod)
    }
    for (const k of Object.keys(roleModules)) roleModules[k] = Array.from(new Set(roleModules[k])).sort()
  }

  // Every module that exists, so "not available to you" can be shown honestly
  // rather than silently omitted.
  const allModules = Array.from(new Set(viewPerms.map(p => p.module))).sort()

  return (
    <HelpClient
      roles={(rolesRes.data ?? []) as any[]}
      roleModules={roleModules}
      allModules={allModules}
    />
  )
}
