import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import CompanySettingsClient from './CompanySettingsClient'

export default async function CompanySettingsPage() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  const companyId = user ? await getCompanyId(user, supabase) : '00000000-0000-0000-0000-000000000001'

  const [companyRes, branchesRes, warehousesRes] = await Promise.all([
    supabase.from('companies' as any).select('*').eq('id', companyId).maybeSingle(),
    supabase.from('branches' as any).select('*').eq('company_id', companyId).is('deleted_at', null).order('name'),
    supabase.from('warehouses' as any).select('*').eq('company_id', companyId).is('deleted_at', null).order('name'),
  ])

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Company Settings</h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-0.5">Manage company profile, branches and warehouses</p>
      </div>
      <CompanySettingsClient
        company={companyRes.data as any}
        branches={(branchesRes.data ?? []) as any[]}
        warehouses={(warehousesRes.data ?? []) as any[]}
      />
    </div>
  )
}
