import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import CompanySettingsClient from './CompanySettingsClient'

export default async function CompanySettingsPage() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null // dashboard/layout.tsx already redirects unauthenticated requests to /login

  const companyId = await getCompanyId(user, supabase)

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
      {companyRes.error && (
        <div className="rounded-lg border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/10 p-4 text-sm text-[var(--color-danger)]">
          Could not load company profile: {companyRes.error.message}
          {' '}(resolved company id: {companyId || 'none'})
        </div>
      )}
      <CompanySettingsClient
        company={companyRes.data as any}
        branches={(branchesRes.data ?? []) as any[]}
        warehouses={(warehousesRes.data ?? []) as any[]}
      />
    </div>
  )
}
