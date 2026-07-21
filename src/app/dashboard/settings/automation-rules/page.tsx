import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import AutomationRulesClient from './AutomationRulesClient'

export default async function AutomationRulesPage() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  const companyId = user ? await getCompanyId(user, supabase) : '00000000-0000-0000-0000-000000000001'

  const { data } = await supabase.from('automation_rules' as any)
    .select('id, rule_type, name, is_active, config, last_run_at, created_at')
    .eq('company_id', companyId).is('deleted_at', null)
    .order('rule_type')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Automation Rules</h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-0.5">Turn on automatic notifications and reminders for common situations — no code, just configure and go</p>
      </div>
      <AutomationRulesClient initialRules={(data ?? []) as any[]} />
    </div>
  )
}
