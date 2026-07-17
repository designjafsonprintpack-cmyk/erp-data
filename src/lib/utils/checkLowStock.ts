import type { SupabaseClient } from '@supabase/supabase-js'
import { notify } from '@/modules/notifications/services/notificationService'

/**
 * Call this right after decrementing board_inventory.current_stock. If the
 * low_stock_alerts system setting is on and the new stock level has crossed
 * below reorder_level, notifies every superadmin/store user in the company.
 * Respects the setting instead of always firing — it existed in the Settings
 * UI but nothing ever checked it.
 */
export async function checkLowStockAndNotify(
  supabase: SupabaseClient,
  companyId: string,
  boardItemId: string,
  stockAfter: number
): Promise<void> {
  const { data: setting } = await supabase.from('system_settings' as any)
    .select('value').eq('company_id', companyId).eq('key', 'low_stock_alerts').maybeSingle()
  if ((setting as any)?.value !== 'true') return

  const { data: item } = await supabase.from('board_inventory' as any)
    .select('description, reorder_level').eq('id', boardItemId).single()
  const reorderLevel = Number((item as any)?.reorder_level ?? 0)
  if (reorderLevel <= 0 || stockAfter > reorderLevel) return

  const { data: recipients } = await supabase.from('users' as any)
    .select('id').eq('company_id', companyId).eq('is_active', true)
    .in('role', ['superadmin', 'store'])

  const description = (item as any)?.description || 'Inventory item'
  for (const r of ((recipients ?? []) as any[])) {
    try {
      await notify({
        user_id: r.id,
        company_id: companyId,
        title: 'Low stock alert',
        message: `${description} is at ${stockAfter} — at or below the reorder level of ${reorderLevel}.`,
        type: 'warning',
        link_url: '/dashboard/board-inventory',
      })
    } catch {
      // Best-effort — a failed notification should never block the caller's
      // actual inventory transaction.
    }
  }
}
