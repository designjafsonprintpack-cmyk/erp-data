import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { withErrorHandling } from '@/lib/utils/apiHandler'

export const GET = withErrorHandling(async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)

  const { searchParams } = new URL(req.url)
  const days = parseInt(searchParams.get('days') || '90')
  const dateTo = new Date()
  const dateFrom = new Date(Date.now() - days * 86400000)

  const { data, error } = await (supabase as any).rpc('get_qc_defect_trends', {
    p_company_id: companyId,
    p_date_from: dateFrom.toISOString().slice(0, 10),
    p_date_to: dateTo.toISOString().slice(0, 10),
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ data: data?.[0] ?? null })
})
