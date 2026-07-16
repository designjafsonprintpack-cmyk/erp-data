import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const updateData: Record<string, any> = {}

  if (body.full_name !== undefined)     updateData.full_name     = body.full_name
  if (body.employee_code !== undefined) updateData.employee_code = body.employee_code
  if (body.app_role !== undefined)      updateData.app_role      = body.app_role
  if (body.department_id !== undefined) updateData.department_id = body.department_id
  if (body.mobile !== undefined)        updateData.mobile        = body.mobile
  if (body.is_active !== undefined)     updateData.is_active     = body.is_active

  const { data, error } = await supabase.from('users' as any)
    .update(updateData).eq('id', params.id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Sync app_role to auth metadata if changed
  if (body.app_role) {
    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    await adminClient.auth.admin.updateUserById(params.id, {
      app_metadata: { app_role: body.app_role }
    })
  }

  return NextResponse.json({ data })
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Soft-delete only — never hard delete users
  const { error } = await supabase.from('users' as any)
    .update({ is_active: false, deleted_at: new Date().toISOString() })
    .eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
