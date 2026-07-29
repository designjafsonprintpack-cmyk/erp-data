import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'
import { recordJobEvent, initializeJobWorkflow } from '@/modules/jobs/services/jobEventService'
import { withErrorHandling } from '@/lib/utils/apiHandler'
import { parseBody } from '@/lib/utils/validate'
import { reprintRequestSchema } from '@/lib/schemas/qc'
import { isPageOutOfRange, outOfRangeResponse } from '@/lib/utils/pagedResponse'

export const GET = withErrorHandling(async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') || ''
  // Was a flat .limit(50) with no offset — the 51st re-print request could not
  // be reached from anywhere.
  const page   = parseInt(searchParams.get('page') || '1')
  const limit  = Math.min(parseInt(searchParams.get('limit') || '50') || 50, 200)
  const offset = (page - 1) * limit

  let q = supabase.from('reprint_requests' as any)
    .select('*, jobs!reprint_requests_original_job_id_fkey(job_number,job_title,customers(name)), reprint_job:jobs!reprint_requests_reprint_job_id_fkey(job_number)', { count: 'exact' })
    .eq('company_id', companyId)
    .is('deleted_at', null)

  if (status) q = q.eq('status', status)

  const { data, error, count } = await q
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(offset, offset + limit - 1)
  // A page past the end is an empty page, not a 500 — see pagedResponse.
  if (isPageOutOfRange(error)) return NextResponse.json(outOfRangeResponse(page, limit))
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [], total: count ?? 0, page, limit })
})

export const POST = withErrorHandling(async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'qc', 'create', supabase)
  if (denied) return denied

  const parsed = await parseBody(req, reprintRequestSchema)
  if ('error' in parsed) return parsed.error
  const body = parsed.data

  const { data, error } = await supabase.from('reprint_requests' as any).insert({
    company_id:      companyId,
    original_job_id: body.original_job_id,
    inspection_id:   body.inspection_id || null,
    reason:          body.reason,
    quantity:        parseFloat(String(body.quantity ?? '0')),
    priority:        body.priority || 'normal',
    notes:           body.notes || null,
    requested_by:    userTableId,
    status:          'pending',
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await recordJobEvent({
    company_id: companyId,
    job_id:     body.original_job_id,
    event_type: 'status_changed',
    new_value:  'Re-print requested',
    notes:      body.reason,
    actor_id:   userTableId,
  }, supabase)

  return NextResponse.json({ data })
})
