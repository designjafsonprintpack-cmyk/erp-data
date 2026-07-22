import { Briefcase, Users, Clock, CheckCircle, AlertTriangle, Truck, Package, BarChart3, Zap, type LucideIcon } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils/cn'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import DashboardMachinesPanel from './DashboardMachinesPanel'

interface StatCard {
  label: string
  value: string | number
  icon: LucideIcon
  color: string
  bgColor: string
  href?: string
  badge?: string
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

  let machineRows: any[] = []
  let recentJobs: any[] = []

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
      machinesRes, recentJobsRes,
    ] = await Promise.all([
      supabase.from('jobs' as any).select('*', { count: 'exact', head: true })
        .eq('company_id', companyId).eq('status', 'new').is('deleted_at', null),
      supabase.from('job_artworks' as any).select('*', { count: 'exact', head: true })
        .eq('company_id', companyId).is('deleted_at', null)
        .not('status', 'in', '("approved","rejected","archived")'),
      supabase.from('job_stage_progress' as any).select('workflow_stage_id')
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

    machineRows = (machinesRes.data as any[]) ?? []
    recentJobs = (recentJobsRes.data as any[]) ?? []
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
    { label: 'New Jobs', value: counts.newJobs, icon: Briefcase, color: 'text-[var(--color-accent)]', bgColor: 'bg-[var(--color-accent)]/10', href: '/dashboard/jobs?status=new' },
    { label: 'Artwork Pending', value: counts.artworkPending, icon: Clock, color: 'text-[var(--color-warning)]', bgColor: 'bg-[var(--color-warning)]/10', href: '/dashboard/artwork' },
    { label: 'Planning Pending', value: counts.planningPending, icon: BarChart3, color: 'text-[var(--color-info)]', bgColor: 'bg-[var(--color-info)]/10', href: '/dashboard/planning' },
    { label: 'Store Pending', value: counts.storePending, icon: Package, color: 'text-[var(--color-warning)]', bgColor: 'bg-[var(--color-warning)]/10', href: '/dashboard/store' },
    { label: 'Printing Running', value: counts.printingRunning, icon: Zap, color: 'text-[var(--color-success)]', bgColor: 'bg-[var(--color-success)]/10', href: '/dashboard/production/printing' },
    { label: 'Die Cutting Running', value: counts.dieCuttingRunning, icon: Zap, color: 'text-[var(--color-success)]', bgColor: 'bg-[var(--color-success)]/10', href: '/dashboard/production/die-cutting' },
    { label: 'Packing Running', value: counts.packingRunning, icon: Package, color: 'text-[var(--color-success)]', bgColor: 'bg-[var(--color-success)]/10', href: '/dashboard/production/packing' },
    { label: 'Ready for Dispatch', value: counts.readyForDispatch, icon: Truck, color: 'text-[var(--color-info)]', bgColor: 'bg-[var(--color-info)]/10', href: '/dashboard/dispatch' },
    { label: 'Dispatched', value: counts.dispatchedToday, icon: CheckCircle, color: 'text-[var(--color-success)]', bgColor: 'bg-[var(--color-success)]/10', href: '/dashboard/dispatch?status=dispatched' },
    { label: 'Delayed Jobs', value: counts.delayedJobs, icon: AlertTriangle, color: 'text-[var(--color-danger)]', bgColor: 'bg-[var(--color-danger)]/10', href: '/dashboard/jobs?status=delayed', badge: counts.delayedJobs > 0 ? 'Alert' : undefined },
    { label: 'Urgent Jobs', value: counts.urgentJobs, icon: AlertTriangle, color: 'text-[var(--color-danger)]', bgColor: 'bg-[var(--color-danger)]/10', href: '/dashboard/jobs?priority=urgent' },
    { label: 'Total Customers', value: counts.totalCustomers, icon: Users, color: 'text-[var(--color-text-secondary)]', bgColor: 'bg-[var(--color-bg-elevated)]', href: '/dashboard/customers' },
  ]

  return (
    <div className="space-y-6">
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

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
        {stats.map((stat) => {
          const Icon = stat.icon
          const content = (
            <div className={cn(
              'rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4',
              'hover:border-[var(--color-border-subtle)] hover:bg-[var(--color-bg-elevated)]',
              'transition-all duration-150',
              stat.href && 'cursor-pointer'
            )}>
              <div className="flex items-center justify-between mb-3">
                <div className={cn('w-8 h-8 rounded-md flex items-center justify-center', stat.bgColor)}>
                  <Icon size={15} className={stat.color} />
                </div>
                {stat.badge && (
                  <span className="text-xs bg-[var(--color-danger)]/15 text-[var(--color-danger)] px-1.5 py-0.5 rounded">
                    {stat.badge}
                  </span>
                )}
              </div>
              <div className="text-2xl font-bold text-[var(--color-text-primary)] mb-1">{stat.value}</div>
              <div className="text-xs text-[var(--color-text-muted)] leading-tight">{stat.label}</div>
            </div>
          )
          return stat.href ? (
            <Link key={stat.label} href={stat.href}>{content}</Link>
          ) : (
            <div key={stat.label}>{content}</div>
          )
        })}
      </div>

      <DashboardMachinesPanel machines={machines} recentJobs={recentJobs} />
    </div>
  )
}
