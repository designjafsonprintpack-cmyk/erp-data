import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import NotificationsSettingsClient from './NotificationsSettingsClient'

export default async function NotificationsSettingsPage() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const companyId = await getCompanyId(user, supabase)
  const { data } = await supabase.from('system_settings' as any)
    .select('key, value').eq('company_id', companyId).eq('category', 'notifications')

  const settings: Record<string, string> = {}
  for (const row of ((data ?? []) as any[])) settings[row.key] = row.value

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Notification Channels</h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-0.5">
          Choose which customer-facing events send a WhatsApp message or email. Each channel needs
          its provider credentials configured as environment variables before it can actually
          deliver — toggling it on here just tells the app to attempt sending.
        </p>
      </div>
      <NotificationsSettingsClient initialSettings={settings} />
    </div>
  )
}
