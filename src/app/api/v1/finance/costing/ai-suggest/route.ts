import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'
import { withErrorHandling } from '@/lib/utils/apiHandler'
import { suggestJobCosting } from '@/lib/utils/aiCostingSuggestion'

// Advisory-only, read-only — this route never writes to job_costings.
// Takes whatever the user has typed into the costing form so far (may be
// incomplete/mid-edit) plus a job_id, and compares against historical
// costings for similar jobs (same board type, quantity within 2x either
// way) to flag anomalies. Reuses the 'finance' permission the costing
// modal itself already requires, not a separate one.
export const POST = withErrorHandling(async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'finance', 'view', supabase)
  if (denied) return denied

  const body = await req.json()
  const jobId = body.job_id as string | undefined
  const currentCosts = (body.current_costs || {}) as Record<string, any>
  if (!jobId) return NextResponse.json({ error: 'job_id is required' }, { status: 400 })

  const { data: job } = await supabase.from('jobs' as any)
    .select('quantity, board_type_id, board_types(name)')
    .eq('id', jobId).eq('company_id', companyId).maybeSingle()
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  const jobRow = job as any

  const qty = Number(jobRow.quantity || 0)
  const qtyLow = Math.floor(qty / 2)
  const qtyHigh = qty * 2

  let historical: any[] = []
  if (jobRow.board_type_id && qty > 0) {
    const { data: histRows } = await supabase.from('job_costings' as any)
      .select('total_cost, board_cost, printing_cost, jobs!inner(quantity, board_type_id)')
      .eq('company_id', companyId)
      .eq('jobs.board_type_id', jobRow.board_type_id)
      .neq('job_id', jobId)
      .gte('jobs.quantity', qtyLow)
      .lte('jobs.quantity', qtyHigh)
      .limit(10)
    historical = ((histRows ?? []) as any[]).map(r => ({
      total_cost: r.total_cost, quantity: r.jobs?.quantity, board_cost: r.board_cost, printing_cost: r.printing_cost,
    }))
  }

  const numericCosts: Record<string, number> = {}
  for (const [k, v] of Object.entries(currentCosts)) {
    const n = parseFloat(String(v))
    if (!isNaN(n) && n > 0) numericCosts[k] = n
  }

  const result = await suggestJobCosting(numericCosts, qty, jobRow.board_types?.name || null, historical)
  if (!result.ok) {
    return NextResponse.json({ error: `AI costing suggestion could not run (${result.reason}).` }, { status: 502 })
  }

  return NextResponse.json({ data: result.data, comparable_count: historical.length })
})
