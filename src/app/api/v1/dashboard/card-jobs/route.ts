import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { withErrorHandling } from '@/lib/utils/apiHandler'

// GET — the actual jobs (or customers, for the one card that isn't
// job-based) behind a dashboard stat card, so clicking a card can show
// "these are the 5 jobs" inline instead of navigating away. Each case
// mirrors the exact count query dashboard/page.tsx uses for that same
// card — this route is the "show me" version of the same logic, not a
// separate definition of what counts as e.g. "Artwork Pending".
export const GET = withErrorHandling(async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)

  const { searchParams } = new URL(req.url)
  const card = searchParams.get('card') || ''
  const today = new Date(); today.setHours(0, 0, 0, 0)

  const jobCols = 'id, job_number, job_title, status, priority, created_at, customers(name)'

  const stageIdsFor = async (name: string) => {
    const { data } = await supabase.from('workflow_stages' as any)
      .select('id').eq('company_id', companyId).eq('name', name)
    return ((data ?? []) as any[]).map(s => s.id)
  }

  switch (card) {
    case 'new_jobs': {
      const { data } = await supabase.from('jobs' as any).select(jobCols)
        .eq('company_id', companyId).eq('status', 'new').is('deleted_at', null)
        .order('created_at', { ascending: false }).limit(50)
      return NextResponse.json({ data: { type: 'jobs', items: data ?? [] } })
    }
    case 'artwork_pending': {
      const { data } = await supabase.from('job_artworks' as any)
        .select(`id, status, jobs(${jobCols})`)
        .eq('company_id', companyId).is('deleted_at', null)
        .not('status', 'in', '("approved","rejected","archived")')
        .order('created_at', { ascending: false }).limit(50)
      const seen = new Set<string>()
      const items = ((data ?? []) as any[]).map(r => r.jobs).filter(j => {
        if (!j || seen.has(j.id)) return false
        seen.add(j.id); return true
      })
      return NextResponse.json({ data: { type: 'jobs', items } })
    }
    case 'planning_pending':
    case 'store_pending': {
      const stageIds = await stageIdsFor(card === 'planning_pending' ? 'Planning' : 'Board Issue')
      if (stageIds.length === 0) return NextResponse.json({ data: { type: 'jobs', items: [] } })
      const { data } = await supabase.from('job_stage_progress' as any)
        .select(`id, jobs(${jobCols})`)
        .eq('company_id', companyId).eq('status', 'pending').in('workflow_stage_id', stageIds)
        .limit(50)
      const items = ((data ?? []) as any[]).map(r => r.jobs).filter(Boolean)
      return NextResponse.json({ data: { type: 'jobs', items } })
    }
    case 'printing_running':
    case 'die_cutting_running':
    case 'packing_running': {
      const name = card === 'printing_running' ? 'Printing' : card === 'die_cutting_running' ? 'Die Cutting' : 'Packing'
      const stageIds = await stageIdsFor(name)
      if (stageIds.length === 0) return NextResponse.json({ data: { type: 'jobs', items: [] } })
      const { data } = await supabase.from('production_assignments' as any)
        .select(`id, job_stage_progress!inner(workflow_stage_id), jobs(${jobCols})`)
        .eq('company_id', companyId).eq('status', 'running').is('deleted_at', null)
        .in('job_stage_progress.workflow_stage_id', stageIds)
        .limit(50)
      const items = ((data ?? []) as any[]).map(r => r.jobs).filter(Boolean)
      return NextResponse.json({ data: { type: 'jobs', items } })
    }
    case 'ready_for_dispatch': {
      const { data } = await supabase.from('jobs' as any).select(jobCols)
        .eq('company_id', companyId).eq('status', 'completed').is('deleted_at', null)
        .order('created_at', { ascending: false }).limit(50)
      return NextResponse.json({ data: { type: 'jobs', items: data ?? [] } })
    }
    case 'dispatched_today': {
      const { data } = await supabase.from('dispatch_orders' as any)
        .select(`id, jobs(${jobCols})`)
        .eq('company_id', companyId).eq('status', 'dispatched')
        .gte('dispatched_at', today.toISOString()).is('deleted_at', null)
        .limit(50)
      const items = ((data ?? []) as any[]).map(r => r.jobs).filter(Boolean)
      return NextResponse.json({ data: { type: 'jobs', items } })
    }
    case 'delayed_jobs': {
      const { data } = await supabase.from('jobs' as any).select(jobCols)
        .eq('company_id', companyId).eq('is_on_hold', true).is('deleted_at', null)
        .order('created_at', { ascending: false }).limit(50)
      return NextResponse.json({ data: { type: 'jobs', items: data ?? [] } })
    }
    case 'urgent_jobs': {
      const { data } = await supabase.from('jobs' as any).select(jobCols)
        .eq('company_id', companyId).eq('priority', 'urgent')
        .not('status', 'in', '("completed","dispatched","cancelled")').is('deleted_at', null)
        .order('created_at', { ascending: false }).limit(50)
      return NextResponse.json({ data: { type: 'jobs', items: data ?? [] } })
    }
    case 'total_customers': {
      const { data } = await supabase.from('customers' as any)
        .select('id, name, phone, email')
        .eq('company_id', companyId).eq('is_active', true).is('deleted_at', null)
        .order('name').limit(50)
      return NextResponse.json({ data: { type: 'customers', items: data ?? [] } })
    }
    default:
      return NextResponse.json({ error: 'Unknown card' }, { status: 400 })
  }
})
