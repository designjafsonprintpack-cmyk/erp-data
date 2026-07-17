import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { AppShell } from '@/components/layout/AppShell'

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

  return <AppShell user={userInfo}>{children}</AppShell>
}
