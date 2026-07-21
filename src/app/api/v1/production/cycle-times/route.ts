import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { withErrorHandling } from '@/lib/utils/apiHandler'

// Data foundation for scheduling estimates (Task 45) — aggregates the
// actual_minutes already captured on every completed production assignment
// (migration 016) into a per-machine, per-stage average/min/max via
// get_machine_cycle_times (migration 074). Read-only; does not change how
// estimated_minutes is entered or used anywhere else — this is a reference
// view a planner can check, not an automatic override.
export const GET = withErrorHandling(async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)

  const { searchParams } = new URL(req.url)
  const days = parseInt(searchParams.get('days') || '90')

  const { data, error } = await (supabase as any).rpc('get_machine_cycle_times', {
    p_company_id: companyId,
    p_days: days,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ data: data ?? [] })
})
