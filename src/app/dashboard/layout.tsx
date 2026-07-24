import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { AppShell } from '@/components/layout/AppShell'
import { SESSION_TIMEOUT_KEY } from '@/config/sessionTimeout'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Fetch user profile from public.users table.
  // NOTE: match on auth_user_id, not id — public.users.id is the app's own
  // generated primary key, a different UUID from the Supabase auth id in user.id.
  const { data: profile } = await supabase
    .from('users' as any)
    .select('full_name, email, role')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  const userInfo = profile ? {
    full_name: (profile as any).full_name || user.email || 'User',
    email: (profile as any).email || user.email || '',
    role: (profile as any).role || 'staff',
  } : {
    full_name: user.email?.split('@')[0] || 'User',
    email: user.email || '',
    role: 'staff',
  }

  // Company name/logo for the header branding — best-effort, falls back to
  // the default "Jafson Print ERP" branding in Header.tsx if this fails.
  const companyId = await getCompanyId(user, supabase)
  const { data: companyRow } = companyId
    ? await supabase.from('companies' as any).select('name, logo_url').eq('id', companyId).maybeSingle()
    : { data: null }
  const companyInfo = companyRow ? { name: (companyRow as any).name, logo_url: (companyRow as any).logo_url } : null

  // Configurable idle-logout timeout — best-effort, falls back to
  // IdleTimeoutGuard's own default if this fails or hasn't been set yet.
  const { data: timeoutRow } = companyId
    ? await supabase.from('system_settings' as any)
        .select('value').eq('company_id', companyId).eq('key', SESSION_TIMEOUT_KEY).maybeSingle()
    : { data: null }
  const sessionTimeoutMinutes = (timeoutRow as any)?.value ?? null

  return <AppShell user={userInfo} company={companyInfo} sessionTimeoutMinutes={sessionTimeoutMinutes}>{children}</AppShell>
}
