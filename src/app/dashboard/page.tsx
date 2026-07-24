import { Briefcase, Users, Clock, CheckCircle, AlertTriangle, Truck, Package, BarChart3, Zap } from 'lucide-react'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import DashboardPanel from './DashboardPanel'
import AutoRefresh from '@/components/shared/AutoRefresh'

interface StatCard {
  label: string
  value: string | number
  iconEl: React.ReactNode
  bgColor: string
  card: string
  badge?: string
  sub?: string
}

export default async function DashboardPage() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  let companyId: string | null = null
  if (user) {
    companyId = await getCompanyId(user, supabase)
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  let counts = {
    newJobs: 0, artworkPending: 0, planningPending: 0, storePending: 0,
    printingRunning: 0, dieCuttingRunning: 0, packingRunning: 0,
    readyForDispatch: 0, dispatchedToday: 0, delayedJobs: 0, urgentJobs: 0, totalCustomers: 0,
  }

  let oldestSubs: { artwork?: string; planning?: string; store?: string } = {}
  let machineRows: any[] = []
  let recentJobs: any[] = []
  let departments: any[] = []
  let userDepartmentId: string | null = null

  if (companyId) {
    // Stage ids for the named stages — a stage name can exist under multiple
    // workflow templates (Standard Carton, Premium Rigid Box, etc.), each with
    // its own row/id, so this collects every id sharing that name.
    const { data: stages } = await supabase.from('workflow_stages' as any)
      .select('id, name').eq('company_id', companyId)
      .in('name', ['Planning', 'Board Issue', 'Printing', 'Die Cutting', 'Packing'])
    const idsFor = (name: string) => ((stages as any[]) ?? []).filter(s => s.name === name).map(s => s.id)
    const planningIds = idsFor('Planning')
    const boardIssueIds = idsFor('Board Issue')
    const printingIds = idsFor('Printing')
    const dieCuttingIds = idsFor('Die Cutting')
    const packingIds = idsFor('Packing')

    const [
      newJobsRes, artworkPendingRes, pendingStagesRes, runningAssignmentsRes,
      readyForDispatchRes, dispatchedTodayRes, delayedJobsRes, urgentJobsRes, customersRes,
      machinesRes, recentJobsRes, departmentsRes, profileRes,
    ] = await Promise.all([
      supabase.from('jobs' as any).select('*', { count: 'exact', head: true })
        .eq('company_id', companyId).eq('status', 'new').is('deleted_at', null),
      supabase.from('job_artworks' as any).select('created_at', { count: 'exact' })
        .eq('company_id', companyId).is('deleted_at', null)
        .not('status', 'in', '("approved","rejected","archived")')
        .order('created_at', { ascending: true }).limit(1),
      supabase.from('job_stage_progress' as any).select('workflow_stage_id, created_at')
        .eq('company_id', companyId).eq('status', 'pending')
        .in('workflow_stage_id', [...planningIds, ...boardIssueIds]),
      supabase.from('production_assignments' as any)
        .select('id, job_stage_progress(workflow_stage_id)')
        .eq('company_id', companyId).eq('status', 'running').is('deleted_at', null),
      supabase.from('jobs' as any).select('*', { count: 'exact', head: true })
        .eq('company_id', companyId).eq('status', 'completed').is('deleted_at', null),
      supabase.from('dispatch_orders' as any).select('*', { count: 'exact', head: true })
        .eq('company_id', companyId).eq('status', 'dispatched')
        .gte('dispatched_at', today.toISOString()).is('deleted_at', null),
      supabase.from('jobs' as any).select('*', { count: 'exact', head: true })
        .eq('company_id', companyId).eq('is_on_hold', true).is('deleted_at', null),
      supabase.from('jobs' as any).select('*', { count: 'exact', head: true })
        .eq('company_id', companyId).eq('priority', 'urgent')
        .not('status', 'in', '("completed","dispatched","cancelled")').is('deleted_at', null),
      supabase.from('customers' as any).select('*', { count: 'exact', head: true })
        .eq('company_id', companyId).eq('is_active', true).is('deleted_at', null),
      // Every machine, left-joined to its current queued/running/paused assignment
      // (see migration 016 — machine_floor_status view). A machine with several
      // queued jobs produces several rows here; grouped by machine_id client-side.
      supabase.from('machine_floor_status' as any)
        .select('*').eq('company_id', companyId).order('machine_name'),
      // Most recent jobs company-wide, shown by default in the Recent Jobs panel.
      supabase.from('jobs' as any)
        .select('id, job_number, job_title, status, priority, created_at, customers(name)')
        .eq('company_id', companyId).is('deleted_at', null)
        .order('created_at', { ascending: false }).limit(8),
      supabase.from('departments' as any)
        .select('id, name, code').eq('company_id', companyId).is('deleted_at', null).eq('is_active', true).order('name'),
      supabase.from('users' as any)
        .select('department_id').eq('company_id', companyId).eq('auth_user_id', user!.id).maybeSingle(),
    ])

    const pendingStages = (pendingStagesRes.data as any[]) ?? []
    const runningAssignments = (runningAssignmentsRes.data as any[]) ?? []
    const stageIdOf = (row: any) => row.job_stage_progress?.workflow_stage_id

    counts = {
      newJobs: newJobsRes.count ?? 0,
      artworkPending: artworkPendingRes.count ?? 0,
      planningPending: pendingStages.filter(s => planningIds.includes(s.workflow_stage_id)).length,
      storePending: pendingStages.filter(s => boardIssueIds.includes(s.workflow_stage_id)).length,
      printingRunning: runningAssignments.filter(a => printingIds.includes(stageIdOf(a))).length,
      dieCuttingRunning: runningAssignments.filter(a => dieCuttingIds.includes(stageIdOf(a))).length,
      packingRunning: runningAssignments.filter(a => packingIds.includes(stageIdOf(a))).length,
      readyForDispatch: readyForDispatchRes.count ?? 0,
      dispatchedToday: dispatchedTodayRes.count ?? 0,
      delayedJobs: delayedJobsRes.count ?? 0,
      urgentJobs: urgentJobsRes.count ?? 0,
      totalCustomers: customersRes.count ?? 0,
    }

    // "Oldest waiting Xd" sub-labels — a bare pending count hides HOW LONG
    // things have been stuck, which is the number a manager actually needs.
    const daysOld = (iso: string | null | undefined): number | null => {
      if (!iso) return null
      const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
      return d >= 0 ? d : 0
    }
    const oldestOf = (rows: any[]) => rows.length
      ? rows.reduce((min, r) => (r.created_at && (!min || r.created_at < min)) ? r.created_at : min, null as string | null)
      : null
    const subFor = (iso: string | null) => {
      const d = daysOld(iso)
      return d === null ? undefined : d === 0 ? 'oldest: today' : `oldest: ${d}d`
    }
    oldestSubs = {
      artwork: counts.artworkPending > 0 ? subFor(((artworkPendingRes.data as any[]) ?? [])[0]?.created_at ?? null) : undefined,
      planning: counts.planningPending > 0 ? subFor(oldestOf(pendingStages.filter(s => planningIds.includes(s.workflow_stage_id)))) : undefined,
      store: counts.storePending > 0 ? subFor(oldestOf(pendingStages.filter(s => boardIssueIds.includes(s.workflow_stage_id)))) : undefined,
    }

    machineRows = (machinesRes.data as any[]) ?? []
    recentJobs = (recentJobsRes.data as any[]) ?? []
    departments = (departmentsRes.data as any[]) ?? []
    userDepartmentId = (profileRes.data as any)?.department_id ?? null
  }

  const machinesById = new Map<string, any>()
  for (const row of machineRows) {
    if (!machinesById.has(row.machine_id)) {
      machinesById.set(row.machine_id, {
        machine_id: row.machine_id,
        machine_name: row.machine_name,
        machine_type: row.machine_type,
        jobs: [] as any[],
      })
    }
    if (row.job_id) {
      machinesById.get(row.machine_id).jobs.push({
        job_id: row.job_id,
        job_number: row.job_number,
        job_title: row.job_title,
        customer_name: row.customer_name,
        assignment_status: row.assignment_status,
        stage_name: row.stage_name,
      })
    }
  }
  const machines = Array.from(machinesById.values())

  const stats: StatCard[] = [
    // Blocked/overdue signals lead the row — a manager should see these
    // before anything else, not after scanning nine other counts.
    { label: 'Delayed Jobs', value: counts.delayedJobs, iconEl: <AlertTriangle size={12} className="text-[var(--color-danger)]" />, bgColor: 'bg-[var(--color-danger)]/10', card: 'delayed_jobs', badge: counts.delayedJobs > 0 ? 'Alert' : undefined },
    { label: 'Urgent Jobs', value: counts.urgentJobs, iconEl: <AlertTriangle size={12} className="text-[var(--color-danger)]" />, bgColor: 'bg-[var(--color-danger)]/10', card: 'urgent_jobs' },
    { label: 'New Jobs', value: counts.newJobs, iconEl: <Briefcase size={12} className="text-[var(--color-accent)]" />, bgColor: 'bg-[var(--color-accent)]/10', card: 'new_jobs' },
    { label: 'Artwork Pending', value: counts.artworkPending, iconEl: <Clock size={12} className="text-[var(--color-warning)]" />, bgColor: 'bg-[var(--color-warning)]/10', card: 'artwork_pending', sub: oldestSubs.artwork },
    { label: 'Planning Pending', value: counts.planningPending, iconEl: <BarChart3 size={12} className="text-[var(--color-info)]" />, bgColor: 'bg-[var(--color-info)]/10', card: 'planning_pending', sub: oldestSubs.planning },
    { label: 'Store Pending', value: counts.storePending, iconEl: <Package size={12} className="text-[var(--color-warning)]" />, bgColor: 'bg-[var(--color-warning)]/10', card: 'store_pending', sub: oldestSubs.store },
    { label: 'Printing Running', value: counts.printingRunning, iconEl: <Zap size={12} className="text-[var(--color-success)]" />, bgColor: 'bg-[var(--color-success)]/10', card: 'printing_running' },
    { label: 'Die Cutting Running', value: counts.dieCuttingRunning, iconEl: <Zap size={12} className="text-[var(--color-success)]" />, bgColor: 'bg-[var(--color-success)]/10', card: 'die_cutting_running' },
    { label: 'Packing Running', value: counts.packingRunning, iconEl: <Package size={12} className="text-[var(--color-success)]" />, bgColor: 'bg-[var(--color-success)]/10', card: 'packing_running' },
    { label: 'Ready for Dispatch', value: counts.readyForDispatch, iconEl: <Truck size={12} className="text-[var(--color-info)]" />, bgColor: 'bg-[var(--color-info)]/10', card: 'ready_for_dispatch' },
    { label: 'Dispatched', value: counts.dispatchedToday, iconEl: <CheckCircle size={12} className="text-[var(--color-success)]" />, bgColor: 'bg-[var(--color-success)]/10', card: 'dispatched_today' },
    { label: 'Total Customers', value: counts.totalCustomers, iconEl: <Users size={12} className="text-[var(--color-text-secondary)]" />, bgColor: 'bg-[var(--color-bg-elevated)]', card: 'total_customers' },
  ]

  return (
    <div className="space-y-6">
      <AutoRefresh />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Dashboard</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-0.5">
            Production overview — {new Date().toLocaleDateString('en-PK', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <span className="flex items-center gap-1.5 text-xs text-[var(--color-success)] bg-[var(--color-success)]/10 px-2.5 py-1 rounded-full border border-[var(--color-success)]/20">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-success)] animate-pulse" />
          Live
        </span>
      </div>

      <DashboardPanel
        stats={stats}
        machines={machines}
        recentJobs={recentJobs}
        departments={departments}
        initialDepartmentId={userDepartmentId || ''}
      />
    </div>
  )
}
