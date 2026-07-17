import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import StoreClient from './StoreClient'

export default async function StorePage() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null // dashboard/layout.tsx already redirects unauthenticated requests to /login

  const companyId = await getCompanyId(user, supabase)

  const [mrnsRes, jobsRes, unitsRes, boardInventoryRes] = await Promise.all([
    supabase.from('material_requisitions' as any)
      .select('*, jobs(job_number,job_title), material_requisition_items(*)', { count: 'exact' })
      .eq('company_id', companyId).is('deleted_at', null)
      .order('created_at', { ascending: false }).limit(50),
    supabase.from('jobs' as any)
      .select('id,job_number,job_title').eq('company_id', companyId)
      .is('deleted_at', null).in('status', ['new','in_progress']).order('job_number').limit(100),
    supabase.from('units' as any).select('id,name,symbol').eq('company_id', companyId).order('name'),
    supabase.from('board_inventory' as any)
      .select('id,description,current_stock,unit_id').eq('company_id', companyId)
      .is('deleted_at', null).eq('is_active', true).order('description'),
  ])

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Store / MRN</h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-0.5">Material Requisition Notes — {mrnsRes.count ?? 0} total</p>
      </div>
      <StoreClient
        initialMRNs={(mrnsRes.data ?? []) as any[]}
        jobs={(jobsRes.data ?? []) as any[]}
        units={(unitsRes.data ?? []) as any[]}
        boardInventory={(boardInventoryRes.data ?? []) as any[]}
      />
    </div>
  )
}
