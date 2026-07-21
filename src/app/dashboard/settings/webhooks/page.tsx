import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import WebhooksClient from './WebhooksClient'

export default async function WebhooksPage() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  const companyId = user ? await getCompanyId(user, supabase) : '00000000-0000-0000-0000-000000000001'

  const { data } = await supabase.from('webhook_endpoints' as any)
    .select('id, name, url, event_types, is_active, created_at')
    .eq('company_id', companyId).is('deleted_at', null)
    .order('created_at', { ascending: false })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Webhooks</h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-0.5">Send an HTTPS POST to your own system when a business event happens — dispatch delivered, payment recorded</p>
      </div>
      <WebhooksClient initialEndpoints={(data ?? []) as any[]} />
    </div>
  )
}
