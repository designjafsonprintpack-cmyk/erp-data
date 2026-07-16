import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { AppShell } from '@/components/layout/AppShell'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Fetch user profile from public.users table
  const { data: profile } = await supabase
    .from('users' as any)
    .select('full_name, email, app_role')
    .eq('id', user.id)
    .maybeSingle()

  const userInfo = profile ? {
    full_name: (profile as any).full_name || user.email || 'User',
    email: (profile as any).email || user.email || '',
    role: (profile as any).app_role || 'staff',
  } : {
    full_name: user.email?.split('@')[0] || 'User',
    email: user.email || '',
    role: 'staff',
  }

  return <AppShell user={userInfo}>{children}</AppShell>
}
