import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'
import { withErrorHandling } from '@/lib/utils/apiHandler'
import { parseBody } from '@/lib/utils/validate'
import { grantPermissionSchema } from '@/lib/schemas/permissions'

export const GET = withErrorHandling(async function GET() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [rolesRes, permsRes, rpRes] = await Promise.all([
    supabase.from('roles' as any).select('*').is('deleted_at', null).eq('is_active', true).order('name'),
    supabase.from('permissions' as any).select('*').is('deleted_at', null).eq('is_active', true).order('module'),
    supabase.from('role_permissions' as any).select('role_id, permission_id').is('deleted_at', null).eq('is_active', true),
  ])

  return NextResponse.json({
    roles: rolesRes.data ?? [],
    permissions: permsRes.data ?? [],
    role_permissions: rpRes.data ?? [],
  })
})

export const POST = withErrorHandling(async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'settings', 'edit', supabase)
  if (denied) return denied

  const parsed = await parseBody(req, grantPermissionSchema)
  if ('error' in parsed) return parsed.error
  const { role_id, permission_id, grant } = parsed.data
  const company_id = companyId

  if (grant) {
    const { error } = await supabase.from('role_permissions' as any).upsert(
      { company_id, role_id, permission_id, is_active: true, deleted_at: null },
      { onConflict: 'company_id,role_id,permission_id' }
    )
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    const { error } = await supabase.from('role_permissions' as any)
      .update({ is_active: false, deleted_at: new Date().toISOString() })
      .eq('role_id', role_id).eq('permission_id', permission_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
})
