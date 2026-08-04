import { createSupabaseServerClient } from '@/lib/supabase/server'
import { LIST_PAGE_SIZE } from '@/lib/constants/pagination'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import PurchaseClient from './PurchaseClient'

export default async function PurchasePage() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  const companyId = user ? await getCompanyId(user, supabase) : '00000000-0000-0000-0000-000000000001'

  const [posRes, vendorsRes, boardRes, jobsRes] = await Promise.all([
    supabase.from('purchase_orders' as any)
      .select('*, vendors(name,vendor_code), purchase_order_items(*, jobs(job_number,job_title))', { count: 'exact' })
      .eq('company_id', companyId).is('deleted_at', null)
      // First page only — PurchaseClient pages the rest from
      // /api/v1/purchase-orders, which filters server-side.
      .order('created_at', { ascending: false }).order('id', { ascending: false })
      .range(0, LIST_PAGE_SIZE - 1),
    supabase.from('vendors' as any).select('id,name,vendor_code')
      .eq('company_id', companyId).is('deleted_at', null).order('name'),
    // Board stock items, so a PO line can say WHICH stock item it is buying.
    // Without this link the receive never credits stock at all — the gap that
    // kept board_inventory_movements empty.
    supabase.from('board_inventory' as any)
      .select('id,description,gsm,sheet_width_in,sheet_height_in,sheets_per_packet')
      .eq('company_id', companyId).is('deleted_at', null).eq('is_active', true)
      .order('description'),
    // Open jobs, so a line can say which job it is being bought FOR (113).
    // Blank is a real answer — general stock.
    supabase.from('jobs' as any)
      .select('id,job_number,job_title')
      .eq('company_id', companyId).is('deleted_at', null)
      .in('status', ['new', 'in_progress'])
      .order('job_number', { ascending: false }),
  ])

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Purchase Orders</h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-0.5">{posRes.count ?? 0} purchase orders</p>
      </div>
      <PurchaseClient
        initialPOs={(posRes.data ?? []) as any[]}
        initialTotal={posRes.count ?? 0}
        vendors={(vendorsRes.data ?? []) as any[]}
        boardItems={(boardRes.data ?? []) as any[]}
        openJobs={(jobsRes.data ?? []) as any[]}
      />
    </div>
  )
}
