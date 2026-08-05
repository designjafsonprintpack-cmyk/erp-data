import { createSupabaseServerClient } from '@/lib/supabase/server'
import { LIST_PAGE_SIZE } from '@/lib/constants/pagination'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import StoreClient from './StoreClient'
import { loadJobsAwaitingBoardIssue } from '@/lib/utils/jobsAwaitingBoardIssue'

export default async function StorePage() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null // dashboard/layout.tsx already redirects unauthenticated requests to /login

  const companyId = await getCompanyId(user, supabase)

  const [mrnsRes, jobsRes, unitsRes, boardInventoryRes] = await Promise.all([
    supabase.from('material_requisitions' as any)
      .select('*, jobs(job_number,job_title,gsm), material_requisition_items(*)', { count: 'exact' })
      .eq('company_id', companyId).is('deleted_at', null)
      // First page only — StoreClient pages the rest from /api/v1/store.
      .order('created_at', { ascending: false }).order('id', { ascending: false })
      .range(0, LIST_PAGE_SIZE - 1),
    supabase.from('jobs' as any)
      .select('id,job_number,job_title').eq('company_id', companyId)
      .is('deleted_at', null).in('status', ['new','in_progress']).order('job_number').limit(100),
    // Same double-listing as Board Inventory had: 28 unit rows exist, 14 of them
    // soft-deleted leftovers from a seed that ran twice, and this query filtered
    // neither deleted_at nor is_active.
    supabase.from('units' as any).select('id,name,symbol')
      .eq('company_id', companyId).is('deleted_at', null).eq('is_active', true).order('name'),
    supabase.from('board_inventory' as any)
      // reserved_stock (135) — issue karte waqt yehi asal sawal hai: kitna
      // KHALI hai. Sirf current_stock dikhana ek job ka reserve kiya hua board
      // doosri job ko issue kar dene ka seedha raasta hai.
      .select('id,description,current_stock,reserved_stock,unit_id,gsm,board_type_id').eq('company_id', companyId)
      .is('deleted_at', null).eq('is_active', true).order('description'),
  ])

  // Jobs standing at the Board Issue stage, with their MRN state attached —
  // Store's actual work list. The MRN list below is the paperwork; this is
  // which jobs are waiting on it.
  const boardIssueJobs = await loadJobsAwaitingBoardIssue(supabase, companyId)

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Store / MRN</h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-0.5">Material Requisition Notes — {mrnsRes.count ?? 0} total</p>
      </div>
      <StoreClient
        initialMRNs={(mrnsRes.data ?? []) as any[]}
        initialTotal={mrnsRes.count ?? 0}
        boardIssueJobs={boardIssueJobs}
        jobs={(jobsRes.data ?? []) as any[]}
        units={(unitsRes.data ?? []) as any[]}
        boardInventory={(boardInventoryRes.data ?? []) as any[]}
      />
    </div>
  )
}
