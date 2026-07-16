import { Briefcase, Users, Clock, CheckCircle, AlertTriangle, Truck, Package, BarChart3, TrendingUp, Zap, type LucideIcon } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils/cn'

interface StatCard {
  label: string
  value: string | number
  icon: LucideIcon
  color: string
  bgColor: string
  href?: string
  badge?: string
}

const stats: StatCard[] = [
  { label: 'New Jobs', value: 0, icon: Briefcase, color: 'text-[var(--color-accent)]', bgColor: 'bg-[var(--color-accent)]/10', href: '/dashboard/jobs?status=new' },
  { label: 'Artwork Pending', value: 0, icon: Clock, color: 'text-[var(--color-warning)]', bgColor: 'bg-[var(--color-warning)]/10', href: '/dashboard/artwork' },
  { label: 'Planning Pending', value: 0, icon: BarChart3, color: 'text-[var(--color-info)]', bgColor: 'bg-[var(--color-info)]/10', href: '/dashboard/planning' },
  { label: 'Store Pending', value: 0, icon: Package, color: 'text-[var(--color-warning)]', bgColor: 'bg-[var(--color-warning)]/10', href: '/dashboard/store' },
  { label: 'Printing Running', value: 0, icon: Zap, color: 'text-[var(--color-success)]', bgColor: 'bg-[var(--color-success)]/10', href: '/dashboard/production/printing' },
  { label: 'Die Cutting Running', value: 0, icon: Zap, color: 'text-[var(--color-success)]', bgColor: 'bg-[var(--color-success)]/10', href: '/dashboard/production/die-cutting' },
  { label: 'Packing Running', value: 0, icon: Package, color: 'text-[var(--color-success)]', bgColor: 'bg-[var(--color-success)]/10', href: '/dashboard/production/packing' },
  { label: 'Ready for Dispatch', value: 0, icon: Truck, color: 'text-[var(--color-info)]', bgColor: 'bg-[var(--color-info)]/10', href: '/dashboard/dispatch' },
  { label: 'Dispatched', value: 0, icon: CheckCircle, color: 'text-[var(--color-success)]', bgColor: 'bg-[var(--color-success)]/10', href: '/dashboard/dispatch?status=dispatched' },
  { label: 'Delayed Jobs', value: 0, icon: AlertTriangle, color: 'text-[var(--color-danger)]', bgColor: 'bg-[var(--color-danger)]/10', href: '/dashboard/jobs?status=delayed', badge: 'Alert' },
  { label: 'Urgent Jobs', value: 0, icon: AlertTriangle, color: 'text-[var(--color-danger)]', bgColor: 'bg-[var(--color-danger)]/10', href: '/dashboard/jobs?priority=urgent' },
  { label: 'Total Customers', value: 0, icon: Users, color: 'text-[var(--color-text-secondary)]', bgColor: 'bg-[var(--color-bg-elevated)]', href: '/dashboard/customers' },
]

export default function DashboardPage() {
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

      <div className="rounded-xl border border-[var(--color-accent)]/20 bg-[var(--color-accent)]/5 p-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-[var(--color-accent)] flex items-center justify-center flex-shrink-0">
            <TrendingUp size={22} className="text-white" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-semibold text-[var(--color-text-primary)] mb-1">
              Welcome to Jafson Print ERP
            </h3>
            <p className="text-sm text-[var(--color-text-secondary)]">
              Your production management system is ready. Start by configuring your company settings, then add customers and create your first job.
            </p>
          </div>
          <Link
            href="/dashboard/settings/company"
            className="flex-shrink-0 px-4 py-2 rounded-md text-sm font-medium bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] transition-colors"
          >
            Setup Company
          </Link>
        </div>
      </div>
    </div>
  )
}
