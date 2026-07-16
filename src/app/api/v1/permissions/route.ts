import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function GET() {
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
}

export async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { role_id, permission_id, grant, company_id } = body

  if (!role_id || !permission_id || typeof grant !== 'boolean') {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

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
}
