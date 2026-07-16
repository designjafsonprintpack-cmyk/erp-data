import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import WorkflowClient from './WorkflowClient'

export default async function WorkflowPage() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  const companyId = user ? await getCompanyId(user, supabase) : '00000000-0000-0000-0000-000000000001'

  const { data: templates } = await supabase
    .from('workflow_templates' as any)
    .select('*, workflow_stages(*)')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('name')

  const processed = (templates ?? []).map((tpl: any) => ({
    ...tpl,
    workflow_stages: Array.isArray(tpl.workflow_stages)
      ? tpl.workflow_stages.filter((s: any) => !s.deleted_at).sort((a: any, b: any) => a.sequence_order - b.sequence_order)
      : [],
  }))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Workflow Engine</h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-0.5">Design production workflow templates with configurable stages</p>
      </div>
      <WorkflowClient initialTemplates={processed as any[]} />
    </div>
  )
}
