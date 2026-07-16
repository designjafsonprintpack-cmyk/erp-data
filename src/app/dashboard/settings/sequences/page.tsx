import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import SequencesClient from './SequencesClient'

export default async function SequencesPage() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  const companyId = user ? await getCompanyId(user, supabase) : '00000000-0000-0000-0000-000000000001'

  const { data } = await supabase
    .from('document_sequences' as any)
    .select('*')
    .eq('company_id', companyId)
    .eq('year', new Date().getFullYear())
    .order('document_type')

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Document Numbering</h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-0.5">Configure number formats for Jobs, Sales Orders, Quotations, Purchase Orders and Dispatches</p>
      </div>
      <SequencesClient sequences={(data ?? []) as any[]} companyId={companyId} />
    </div>
  )
}
