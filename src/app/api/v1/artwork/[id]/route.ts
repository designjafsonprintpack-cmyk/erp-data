import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'
import { withErrorHandling } from '@/lib/utils/apiHandler'

export const PATCH = withErrorHandling(async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)

  const body = await req.json()

  // Marking an artwork production-ready is an approval action; anything else
  // (renaming, notes) is a regular edit.
  const denied = await requirePermission(
    userTableId, 'artwork', body.is_production_ready === true ? 'approve' : 'edit', supabase
  )
  if (denied) return denied

  // If marking production ready, unmark all others for same job first
  if (body.is_production_ready === true) {
    const { data: current } = await supabase
      .from('job_artworks' as any).select('job_id').eq('id', params.id).eq('company_id', companyId).single()
    if (current) {
      await supabase.from('job_artworks' as any)
        .update({ is_production_ready: false })
        .eq('job_id', (current as any).job_id)
        .eq('company_id', companyId)
        .neq('id', params.id)
    }
    body.approved_at = new Date().toISOString()
    body.approved_by = userTableId
  }

  const { data, error } = await supabase.from('job_artworks' as any)
    .update(body).eq('id', params.id).eq('company_id', companyId).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
})

export const DELETE = withErrorHandling(async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'artwork', 'delete', supabase)
  if (denied) return denied

  const { error } = await supabase.from('job_artworks' as any)
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq('id', params.id).eq('company_id', companyId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
})
