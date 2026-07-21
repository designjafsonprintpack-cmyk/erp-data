import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'
import { recordJobEvent } from '@/modules/jobs/services/jobEventService'
import { withErrorHandling } from '@/lib/utils/apiHandler'
import { parseBody } from '@/lib/utils/validate'
import { jobRemarkSchema } from '@/lib/schemas/jobActions'

export const GET = withErrorHandling(async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)

  const { searchParams } = new URL(req.url)
  const page = parseInt(searchParams.get('page') || '1')
  const limit = 50
  const offset = (page - 1) * limit

  const { data, error, count } = await supabase
    .from('job_stage_events' as any)
    .select('*, users(full_name)', { count: 'exact' })
    .eq('job_id', params.id)
    .eq('company_id', companyId)
    .order('occurred_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [], total: count ?? 0, page })
})

// POST: Add a remark (append-only)
export const POST = withErrorHandling(async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'jobs', 'edit', supabase)
  if (denied) return denied
  const parsed = await parseBody(req, jobRemarkSchema)
  if ('error' in parsed) return parsed.error
  const { notes } = parsed.data

  await recordJobEvent({
    company_id: companyId,
    job_id: params.id,
    event_type: 'remark_added',
    notes: notes.trim(),
    actor_id: userTableId,
  }, supabase)

  return NextResponse.json({ success: true })
})
