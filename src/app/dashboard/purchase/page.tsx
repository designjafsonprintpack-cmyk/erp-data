import { createSupabaseServerClient } from '@/lib/supabase/server'
import { LIST_PAGE_SIZE } from '@/lib/constants/pagination'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { DEMAND_SELECT, decorateDemands } from '@/lib/utils/boardDemandQuery'
import { syncMissingBoardDemands } from '@/lib/utils/syncMissingBoardDemands'
import PurchaseClient from './PurchaseClient'
import DemandsClient from './DemandsClient'
import PurchaseTabs from './PurchaseTabs'

export default async function PurchasePage() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  const companyId = user ? await getCompanyId(user, supabase) : '00000000-0000-0000-0000-000000000001'

  // Pehle jhaaru, phir list — warna jo job abhi abhi chhooti hai wo is page par
  // aane ke bajaye agle refresh ka intezar karti. Mamool mein 0 rows.
  await syncMissingBoardDemands(supabase, companyId)

  const [posRes, vendorsRes, boardRes, jobsRes, demandsRes, boardTypesRes] = await Promise.all([
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
    // "Kya khareedna hai" — jo demands abhi order honi baqi hain (135). Wahi
    // tarteeb aur wahi range jo /api/v1/board-demands ka default hai, warna
    // page 1 aur page 2 ek doosre par charh jate hain.
    supabase.from('board_demands' as any)
      .select(DEMAND_SELECT, { count: 'exact' })
      .eq('company_id', companyId).is('deleted_at', null)
      .in('status', ['open', 'partially_ordered'])
      .order('created_at', { ascending: false }).order('id', { ascending: false })
      .range(0, LIST_PAGE_SIZE - 1),
    supabase.from('board_types' as any).select('id,name')
      .eq('company_id', companyId).is('deleted_at', null).eq('is_active', true).order('name'),
  ])

  const demands = await decorateDemands(supabase, companyId, (demandsRes.data ?? []) as any[])

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Purchase</h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-0.5">
          {demandsRes.count ?? 0} board demand{(demandsRes.count ?? 0) !== 1 ? 's' : ''} to order · {posRes.count ?? 0} purchase orders
        </p>
      </div>
      <PurchaseTabs
        demandCount={demandsRes.count ?? 0}
        orderCount={posRes.count ?? 0}
        demands={
          <DemandsClient
            initialDemands={demands as any[]}
            initialTotal={demandsRes.count ?? 0}
            boardTypes={(boardTypesRes.data ?? []) as any[]}
          />
        }
        orders={
          <PurchaseClient
            initialPOs={(posRes.data ?? []) as any[]}
            initialTotal={posRes.count ?? 0}
            vendors={(vendorsRes.data ?? []) as any[]}
            boardItems={(boardRes.data ?? []) as any[]}
            openJobs={(jobsRes.data ?? []) as any[]}
          />
        }
      />
    </div>
  )
}
