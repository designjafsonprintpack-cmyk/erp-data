import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import AdminClient from './AdminClient'

export default async function AdminPage() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  const companyId = user ? await getCompanyId(user, supabase) : '00000000-0000-0000-0000-000000000001'

  const [settingsRes, auditRes, companyRes] = await Promise.all([
    supabase.from('system_settings' as any)
      .select('key,value,category,description')
      .eq('company_id', companyId).order('category').order('key'),
    supabase.from('audit_log' as any)
      .select('id,table_name,action,changed_at,changed_by,record_id')
      .eq('company_id', companyId)
      .order('changed_at', { ascending: false }).limit(50),
    supabase.from('companies' as any)
      .select('*, branches(id,name,is_default)').eq('id', companyId).single(),
  ])

  // Build settings map
  const settingsMap: Record<string, string> = {}
  ;(settingsRes.data ?? []).forEach((s: any) => { settingsMap[s.key] = s.value ?? '' })

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Admin</h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-0.5">System settings, company info, audit trail</p>
      </div>
      <AdminClient
        settings={settingsMap}
        settingsFull={(settingsRes.data ?? []) as any[]}
        auditLog={(auditRes.data ?? []) as any[]}
        company={companyRes.data as any}
      />
    </div>
  )
}
