import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { withErrorHandling } from '@/lib/utils/apiHandler'
import { isPageOutOfRange, outOfRangeResponse } from '@/lib/utils/pagedResponse'

/**
 * The QC page's Inspections list.
 *
 * There was no list endpoint for inspections at all — the page loaded the most
 * recent 200 on the server and that was the whole list, with no way to reach
 * inspection 201. Defects and re-prints already had routes; this is the missing
 * third one, in the same shape so the page can treat all three alike.
 *
 * Read-only. Creating and signing off an inspection stays where it was
 * (/api/v1/qc/signoff and the checklists route), so nothing here duplicates a
 * write path.
 */
export const GET = withErrorHandling(async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)

  const { searchParams } = new URL(req.url)
  const jobId  = searchParams.get('job_id') || ''
  const result = searchParams.get('result') || ''
  const page   = parseInt(searchParams.get('page') || '1')
  const limit  = Math.min(parseInt(searchParams.get('limit') || '50') || 50, 200)
  const offset = (page - 1) * limit

  let q = supabase.from('qc_inspections' as any)
    .select('*, jobs(job_number,job_title,customers(name)), qc_templates(name), qc_defects(id,severity,resolved)',
            { count: 'exact' })
    .eq('company_id', companyId)
    .is('deleted_at', null)

  if (jobId)  q = q.eq('job_id', jobId)
  if (result) q = q.eq('result', result)

  const { data, error, count } = await q
    .order('created_at', { ascending: false })
    // Tiebreaker — inspections recorded in the same batch share a created_at,
    // and an unstable order makes page 2 repeat rows from page 1.
    .order('id', { ascending: false })
    .range(offset, offset + limit - 1)

  // A page past the end is an empty page, not a 500 — see pagedResponse.
  if (isPageOutOfRange(error)) return NextResponse.json(outOfRangeResponse(page, limit))
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [], total: count ?? 0, page, limit })
})
