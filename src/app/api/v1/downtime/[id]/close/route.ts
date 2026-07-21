import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'
import { withErrorHandling } from '@/lib/utils/apiHandler'
import { parseBody } from '@/lib/utils/validate'
import { downtimeCloseSchema } from '@/lib/schemas/machine'

export const POST = withErrorHandling(async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'machines', 'edit', supabase)
  if (denied) return denied

  const parsed = await parseBody(req, downtimeCloseSchema)
  if ('error' in parsed) return parsed.error
  const body = parsed.data

  const { data, error } = await (supabase as any).rpc('close_machine_downtime', {
    p_company_id: companyId,
    p_downtime_id: params.id,
    p_resolved_by: userTableId,
    p_resolution_notes: body.resolution_notes || null,
    p_new_machine_status: body.new_machine_status || 'idle',
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
})
