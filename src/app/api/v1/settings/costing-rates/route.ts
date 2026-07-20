import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'
import { withErrorHandling } from '@/lib/utils/apiHandler'

const KEYS = [
  'costing_plate_rate_per_color',
  'costing_printing_rate_per_1000',
  'costing_die_cutting_rate_per_1000',
  'costing_pasting_rate_per_1000',
  'costing_foiling_rate_per_sheet',
  'costing_embossing_rate_per_1000',
  'costing_die_making_rate_per_ups',
  'costing_breaking_rate_per_1000',
  'costing_packing_rate_per_1000_boxes',
  'costing_cartage_rate_per_1000_boxes',
  'costing_default_wastage_percent',
  'costing_default_overhead_percent',
  'costing_default_margin_percent',
] as const

export const GET = withErrorHandling(async function GET() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)

  const { data, error } = await supabase.from('system_settings' as any)
    .select('key, value, description').eq('company_id', companyId).eq('category', 'costing')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rates: Record<string, string> = {}
  for (const row of ((data ?? []) as any[])) rates[row.key] = row.value
  return NextResponse.json({ data: rates })
})

export const PATCH = withErrorHandling(async function PATCH(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'settings', 'edit', supabase)
  if (denied) return denied

  const body = await req.json()
  const updates = KEYS.filter(k => body[k] !== undefined)
  if (updates.length === 0) return NextResponse.json({ error: 'No valid costing rate fields provided' }, { status: 400 })

  for (const key of updates) {
    const { error } = await supabase.from('system_settings' as any)
      .update({ value: String(body[key]), updated_by: userTableId })
      .eq('company_id', companyId).eq('key', key)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: { success: true } })
})
