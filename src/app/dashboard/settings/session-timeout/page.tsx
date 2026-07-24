import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { SESSION_TIMEOUT_KEY, DEFAULT_SESSION_TIMEOUT, isValidSessionTimeout } from '@/config/sessionTimeout'
import SessionTimeoutClient from './SessionTimeoutClient'

export default async function SessionTimeoutSettingsPage() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const companyId = await getCompanyId(user, supabase)
  const { data } = await supabase.from('system_settings' as any)
    .select('value').eq('company_id', companyId).eq('key', SESSION_TIMEOUT_KEY).maybeSingle()

  const currentValue = data && isValidSessionTimeout((data as any).value) ? (data as any).value : DEFAULT_SESSION_TIMEOUT

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Session Timeout</h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-0.5">
          Automatically sign users out after a period of no mouse, keyboard, or page activity.
          A warning with a countdown is shown before sign-out.
        </p>
      </div>
      <SessionTimeoutClient initialValue={currentValue} />
    </div>
  )
}
