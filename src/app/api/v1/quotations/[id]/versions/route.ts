import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { withErrorHandling } from '@/lib/utils/apiHandler'

export const GET = withErrorHandling(async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)

  const [versionsRes, currentRes] = await Promise.all([
    supabase.from('quotation_versions' as any)
      .select('id, version_number, snapshot, created_at, users(full_name)')
      .eq('company_id', companyId).eq('quotation_id', params.id)
      .order('version_number', { ascending: false }),
    supabase.from('quotations' as any)
      .select('status, subtotal, discount_percent, discount_amount, tax_amount, total_amount, notes, terms_conditions, quotation_items(product_desc, quantity, unit_price, subtotal, no_of_colors, board_type_id)')
      .eq('id', params.id).eq('company_id', companyId).single(),
  ])

  if (versionsRes.error) return NextResponse.json({ error: versionsRes.error.message }, { status: 500 })

  const cur = currentRes.data as any
  const currentAsVersion = cur ? {
    id: 'current',
    version_number: (versionsRes.data?.[0] as any)?.version_number ? (versionsRes.data[0] as any).version_number + 1 : 1,
    snapshot: {
      header: {
        status: cur.status, subtotal: cur.subtotal, discount_percent: cur.discount_percent,
        discount_amount: cur.discount_amount, tax_amount: cur.tax_amount, total_amount: cur.total_amount,
        notes: cur.notes, terms_conditions: cur.terms_conditions,
      },
      items: cur.quotation_items ?? [],
    },
    created_at: null,
    is_current: true,
  } : null

  return NextResponse.json({
    data: currentAsVersion ? [currentAsVersion, ...(versionsRes.data ?? [])] : (versionsRes.data ?? []),
  })
})
