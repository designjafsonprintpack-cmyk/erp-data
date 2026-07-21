import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import ColorLibraryClient from './ColorLibraryClient'

export default async function ColorLibraryPage() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  const companyId = user ? await getCompanyId(user, supabase) : '00000000-0000-0000-0000-000000000001'

  const [specsRes, customersRes] = await Promise.all([
    supabase.from('color_specs' as any).select('*, customers(name)').eq('company_id', companyId).eq('is_active', true).is('deleted_at', null).order('name'),
    supabase.from('customers' as any).select('id,name').eq('company_id', companyId).is('deleted_at', null).order('name'),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Color Library</h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-0.5">Pantone, CMYK build, or custom color specs — reusable across jobs and plates instead of retyping each time</p>
      </div>
      <ColorLibraryClient
        initialSpecs={(specsRes.data ?? []) as any[]}
        customers={(customersRes.data ?? []) as any[]}
      />
    </div>
  )
}
