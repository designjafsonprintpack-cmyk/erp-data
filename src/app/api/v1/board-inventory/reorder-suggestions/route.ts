import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'
import { withErrorHandling } from '@/lib/utils/apiHandler'

// Extends the existing low-stock ALERT (checkLowStock.ts, which only
// notifies) with an actual reorder SUGGESTION surface — the same
// current_stock <= reorder_level condition, but returned as a list with a
// suggested order quantity, so a Purchase Order can be drafted from it
// instead of just being told a number is low.
//
// suggested_quantity = reorder_level - current_stock (floored at 0): the
// simplest, most transparent target — bring stock back up to the reorder
// trigger point. There's no separate "target stock" column in the schema
// to aim higher than that, so this deliberately doesn't invent one.
//
// Items are grouped by vendor_id where the board inventory row already has
// one on file (this column already exists — no migration needed); items
// with no vendor on file are returned separately since a Purchase Order
// requires a vendor and this route can't guess one.
export const GET = withErrorHandling(async function GET(_req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'store', 'view', supabase)
  if (denied) return denied

  const { data, error } = await supabase.from('board_inventory' as any)
    .select('id, description, current_stock, reorder_level, vendor_id, unit_id, vendors(name), units(name,symbol)')
    .eq('company_id', companyId)
    .is('deleted_at', null).eq('is_active', true)
    .gt('reorder_level', 0)
    .order('description')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const lowStock = ((data ?? []) as any[])
    .filter(item => Number(item.current_stock) <= Number(item.reorder_level))
    .map(item => ({
      board_item_id: item.id,
      description: item.description,
      current_stock: item.current_stock,
      reorder_level: item.reorder_level,
      suggested_quantity: Math.max(Number(item.reorder_level) - Number(item.current_stock), 0),
      vendor_id: item.vendor_id,
      vendor_name: item.vendors?.name ?? null,
      unit_id: item.unit_id,
      unit_symbol: item.units?.symbol ?? null,
    }))

  const withVendor = lowStock.filter(item => item.vendor_id)
  const withoutVendor = lowStock.filter(item => !item.vendor_id)

  const byVendor = withVendor.reduce((acc: Record<string, { vendor_id: string; vendor_name: string | null; items: typeof lowStock }>, item) => {
    const key = item.vendor_id as string
    if (!acc[key]) acc[key] = { vendor_id: key, vendor_name: item.vendor_name, items: [] }
    acc[key].items.push(item)
    return acc
  }, {})

  return NextResponse.json({
    data: {
      by_vendor: Object.values(byVendor),
      needs_vendor: withoutVendor,
    },
    total: lowStock.length,
  })
})
