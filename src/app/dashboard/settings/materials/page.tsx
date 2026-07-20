import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import MaterialsClient from './MaterialsClient'

export default async function MaterialsPage() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  const companyId = user ? await getCompanyId(user, supabase) : '00000000-0000-0000-0000-000000000001'

  const [board, paper, ink, glue, foil, costItems] = await Promise.all([
    supabase.from('board_types' as any).select('*').eq('company_id', companyId).is('deleted_at', null).order('name'),
    supabase.from('paper_types' as any).select('*').eq('company_id', companyId).is('deleted_at', null).order('name'),
    supabase.from('ink_types' as any).select('*').eq('company_id', companyId).is('deleted_at', null).order('name'),
    supabase.from('glue_types' as any).select('*').eq('company_id', companyId).is('deleted_at', null).order('name'),
    supabase.from('foil_types' as any).select('*').eq('company_id', companyId).is('deleted_at', null).order('name'),
    supabase.from('cost_item_types' as any).select('*').eq('company_id', companyId).is('deleted_at', null).order('sort_order').order('name'),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Material Types</h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-0.5">Configure all material types used in production</p>
      </div>
      <MaterialsClient
        initialData={{
          board: (board.data ?? []) as any[],
          paper: (paper.data ?? []) as any[],
          ink: (ink.data ?? []) as any[],
          glue: (glue.data ?? []) as any[],
          foil: (foil.data ?? []) as any[],
          costItems: (costItems.data ?? []) as any[],
        }}
      />
    </div>
  )
}
