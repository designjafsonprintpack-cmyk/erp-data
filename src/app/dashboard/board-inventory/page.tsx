import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import BoardInventoryClient from './BoardInventoryClient'

export default async function BoardInventoryPage() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  const companyId = user ? await getCompanyId(user, supabase) : '00000000-0000-0000-0000-000000000001'

  const [invRes, boardTypesRes, unitsRes] = await Promise.all([
    supabase.from('board_inventory' as any)
      .select('*, board_types(name)', { count: 'exact' })
      .eq('company_id', companyId).is('deleted_at', null).eq('is_active', true)
      .order('description'),
    supabase.from('board_types' as any).select('id,name').eq('company_id', companyId).is('deleted_at', null).order('name'),
    supabase.from('units' as any).select('id,name,symbol').eq('company_id', companyId).order('name'),
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
        units={(unitsRes.data ?? []) as any[]}
      />
    </div>
  )
}
