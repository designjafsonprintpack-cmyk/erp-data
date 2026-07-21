import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { withErrorHandling } from '@/lib/utils/apiHandler'
import { detectDefectPatterns } from '@/lib/utils/aiDefectPatterns'

// Read-only, advisory — reuses the exact same aggregated data the Trends
// tab already fetches from get_qc_defect_trends, just hands it to OpenAI
// for pattern commentary instead of only rendering it as bars. Same
// permission model as the underlying trends endpoint (no explicit
// requirePermission there either — company_id scoping via RLS + the
// authenticated-user check is what gates this).
export const GET = withErrorHandling(async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)

  const { searchParams } = new URL(req.url)
  const days = parseInt(searchParams.get('days') || '90')
  const dateTo = new Date()
  const dateFrom = new Date(Date.now() - days * 86400000)

  const { data: trendRows, error } = await (supabase as any).rpc('get_qc_defect_trends', {
    p_company_id: companyId,
    p_date_from: dateFrom.toISOString().slice(0, 10),
    p_date_to: dateTo.toISOString().slice(0, 10),
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const trendData = trendRows?.[0] ?? null
  if (!trendData || trendData.total_defects === 0) {
    return NextResponse.json({ error: 'No defects logged in this period — nothing to analyze.' }, { status: 400 })
  }

  const result = await detectDefectPatterns(trendData)
  if (!result.ok) {
    return NextResponse.json({ error: `AI pattern analysis could not run (${result.reason}).` }, { status: 502 })
  }

  return NextResponse.json({ data: result.data })
})
