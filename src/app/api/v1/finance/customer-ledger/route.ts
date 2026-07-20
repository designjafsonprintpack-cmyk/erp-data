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
  const customerId = searchParams.get('customer_id')
  if (!customerId) return NextResponse.json({ error: 'customer_id is required' }, { status: 400 })

  const dateFrom = searchParams.get('from') || ''
  const dateTo   = searchParams.get('to') || ''

  let q = supabase.from('customer_ledger_entries' as any)
    .select('*')
    .eq('company_id', companyId)
    .eq('customer_id', customerId)
    .is('deleted_at', null)

  if (dateFrom) q = q.gte('entry_date', dateFrom)
  if (dateTo)   q = q.lte('entry_date', dateTo)

  const { data, error } = await q.order('entry_date').order('created_at')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const entries = data ?? []
  const currentBalance = entries.length ? (entries[entries.length - 1] as any).balance_after : 0

  return NextResponse.json({ data: entries, current_balance: currentBalance })
})
