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

  // Comment summary (count + unresolved-customer flag) per artwork version —
  // fetched upfront so the Comments button shows this immediately, instead
  // of only after it's been clicked once (comments themselves still lazy-
  // load on click, this is just the badge).
  const artworkIds = (data ?? []).map((a: any) => a.id)
  const commentSummary: Record<string, { total: number; unresolvedCustomer: boolean }> = {}
  if (artworkIds.length > 0) {
    const { data: allComments } = await supabase
      .from('artwork_comments' as any)
      .select('artwork_id, author_type, resolved')
      .in('artwork_id', artworkIds)
      .is('deleted_at', null)
    for (const c of (allComments ?? []) as any[]) {
      if (!commentSummary[c.artwork_id]) commentSummary[c.artwork_id] = { total: 0, unresolvedCustomer: false }
      commentSummary[c.artwork_id].total += 1
      if (c.author_type === 'customer' && !c.resolved) commentSummary[c.artwork_id].unresolvedCustomer = true
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Artwork</h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-0.5">{count ?? 0} artwork versions</p>
      </div>
      <ArtworkClient initialArtworks={(data ?? []) as any[]} jobs={(jobs ?? []) as any[]} companyId={companyId} commentSummary={commentSummary} />
    </div>
  )
}
