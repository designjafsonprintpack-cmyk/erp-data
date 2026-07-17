import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import ArtworkClient from './ArtworkClient'

export default async function ArtworkPage() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null // dashboard/layout.tsx already redirects unauthenticated requests to /login

  const companyId = await getCompanyId(user, supabase)

  const { data, count } = await supabase
    .from('job_artworks' as any)
    .select('*, jobs(job_number,job_title,customers(name))', { count: 'exact' })
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(50)

  const { data: jobs } = await supabase
    .from('jobs' as any)
    .select('id,job_number,job_title,customers(name)')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .in('status', ['new','in_progress'])
    .order('created_at', { ascending: false })
    .limit(100)

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Artwork</h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-0.5">{count ?? 0} artwork versions</p>
      </div>
      <ArtworkClient initialArtworks={(data ?? []) as any[]} jobs={(jobs ?? []) as any[]} companyId={companyId} />
    </div>
  )
}
