import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import BoardInventoryClient from './BoardInventoryClient'

export default async function BoardInventoryPage() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  const companyId = user ? await getCompanyId(user, supabase) : '00000000-0000-0000-0000-000000000001'

  const [invRes, boardTypesRes, paperTypesRes, unitsRes, vendorsRes, jobsRes] = await Promise.all([
    supabase.from('board_inventory' as any)
      // vendors embeds only because 113 finally gave vendor_id a foreign key —
      // it was a bare UUID before, which is why the vendor never appeared here.
      // paper_types embeds since 115 — the store carries paper as well as
      // board, and only one of the two is ever set on a row.
      .select('*, board_types(name), paper_types(name), vendors(name)', { count: 'exact' })
      .eq('company_id', companyId).is('deleted_at', null).eq('is_active', true)
      .order('description'),
    supabase.from('board_types' as any).select('id,name').eq('company_id', companyId).is('deleted_at', null).order('name'),
    // The other half of the material dropdown. is_active as well as
    // deleted_at, for the same reason the units query does it: a soft-deleted
    // master row must not reappear in a <select>.
    supabase.from('paper_types' as any).select('id,name,gsm')
      .eq('company_id', companyId).is('deleted_at', null).eq('is_active', true).order('name'),
    // deleted_at + is_active are BOTH required here. The units seed ran twice on
    // 2026-07-15 and one copy of each of the 14 units was soft-deleted by hand —
    // so the table holds 28 rows of which 14 are dead. This query filtered
    // neither, which is why the unit dropdown listed "Sheet", "KG", "Box" and
    // every other unit twice with no way to tell which was real. The data was
    // never the problem; the query was. Settings → Units already does this right.
    supabase.from('units' as any).select('id,name,symbol')
      .eq('company_id', companyId).is('deleted_at', null).eq('is_active', true).order('name'),
    supabase.from('vendors' as any).select('id,name').eq('company_id', companyId).is('deleted_at', null).order('name'),
    // Feeds both job pickers in the movement modal: "For which job?" on a
    // Stock In (board bought for a job without a PO) and "Returned from job"
    // on a Return to Store (leftover board coming back off the floor).
    supabase.from('jobs' as any).select('id,job_number,job_title')
      .eq('company_id', companyId).is('deleted_at', null)
      .in('status', ['new', 'in_progress'])
      .order('job_number', { ascending: false }),
  ])

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Board Inventory</h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-0.5">{invRes.count ?? 0} items in stock</p>
      </div>
      <BoardInventoryClient
        initialItems={(invRes.data ?? []) as any[]}
        boardTypes={(boardTypesRes.data ?? []) as any[]}
        paperTypes={(paperTypesRes.data ?? []) as any[]}
        units={(unitsRes.data ?? []) as any[]}
        vendors={(vendorsRes.data ?? []) as any[]}
        openJobs={(jobsRes.data ?? []) as any[]}
      />
    </div>
  )
}
