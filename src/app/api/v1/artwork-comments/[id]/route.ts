import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'
import { withErrorHandling } from '@/lib/utils/apiHandler'
import { parseBody } from '@/lib/utils/validate'
import { artworkCommentUpdateSchema } from '@/lib/schemas/artwork'

export const PATCH = withErrorHandling(async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'artwork', 'edit', supabase)
  if (denied) return denied

  const parsed = await parseBody(req, artworkCommentUpdateSchema)
  if ('error' in parsed) return parsed.error
  const body = parsed.data
  const updateData: Record<string, any> = {}
  if (body.resolved !== undefined) {
    updateData.resolved = !!body.resolved
    updateData.resolved_at = body.resolved ? new Date().toISOString() : null
    updateData.resolved_by = body.resolved ? userTableId : null
  }

  const { data, error } = await supabase.from('artwork_comments' as any)
    .update(updateData).eq('id', params.id).eq('company_id', companyId).select().single()
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

  const { error } = await supabase.from('artwork_comments' as any)
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq('id', params.id).eq('company_id', companyId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
})
