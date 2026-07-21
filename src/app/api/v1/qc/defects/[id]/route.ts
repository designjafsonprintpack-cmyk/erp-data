import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'
import { withErrorHandling } from '@/lib/utils/apiHandler'
import { parseBody } from '@/lib/utils/validate'
import { qcDefectUpdateSchema } from '@/lib/schemas/qc'

export const PATCH = withErrorHandling(async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'qc', 'edit', supabase)
  if (denied) return denied

  const parsed = await parseBody(req, qcDefectUpdateSchema)
  if ('error' in parsed) return parsed.error
  const body = parsed.data
  const updateData: Record<string, any> = { ...body }

  if (body.action === 'resolve') {
    updateData.resolved        = true
    updateData.resolved_notes  = body.resolved_notes || null
    updateData.resolved_at     = new Date().toISOString()
    delete updateData.action
  }

  const { data, error } = await supabase.from('qc_defects' as any)
    .update(updateData).eq('id', params.id).eq('company_id', companyId).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
})
