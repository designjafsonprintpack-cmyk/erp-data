import Link from 'next/link'
import { Building2, Users, Settings2, Workflow, Palette, Shield, Bell, FileText, Hash, Circle, ClipboardList, BookOpen, Calculator, Mail, Droplet, Zap, Clock } from 'lucide-react'

const settingsSections = [
  { title: 'Company', description: 'Company profile, logo, branches, warehouses', href: '/dashboard/settings/company', icon: Building2 },
  { title: 'Departments', description: 'Department setup and org structure', href: '/dashboard/settings/departments', icon: Users },
  { title: 'Machines', description: 'Machine registry and status management', href: '/dashboard/settings/machines', icon: Settings2 },
  { title: 'Material Types', description: 'Board, paper, ink, glue, foil, lamination types', href: '/dashboard/settings/materials', icon: FileText },
  { title: 'Color Library', description: 'Pantone / CMYK / custom color specs for jobs and customers', href: '/dashboard/settings/color-library', icon: Droplet },
  { title: 'Units, Currencies & Taxes', description: 'Measurement units, currencies and tax rates', href: '/dashboard/settings/units-currencies', icon: BookOpen },
  { title: 'Document Numbering', description: 'Sequence formats for jobs, orders, dispatches', href: '/dashboard/settings/sequences', icon: Hash },
  { title: 'Workflow Engine', description: 'Build production workflow templates with stages', href: '/dashboard/settings/workflow', icon: Workflow },
  { title: 'Job Status & Delay Reasons', description: 'Job statuses and mandatory delay reason list', href: '/dashboard/settings/job-status', icon: Circle },
  { title: 'Permissions & Roles', description: 'Role-based access control matrix', href: '/dashboard/settings/permissions', icon: Shield },
  { title: 'Notifications', description: 'Alert rules and notification preferences', href: '/dashboard/settings/notifications', icon: Bell },
  { title: 'Session Timeout', description: 'Auto sign-out after a period of inactivity', href: '/dashboard/settings/session-timeout', icon: Clock },
  { title: 'Report Schedules', description: 'Automatically email reports on a recurring schedule', href: '/dashboard/settings/report-schedules', icon: Mail },
  { title: 'Webhooks', description: 'Send business events to your own systems via HTTPS POST', href: '/dashboard/settings/webhooks', icon: Zap },
  { title: 'Automation Rules', description: 'Automatic notifications for jobs stuck on hold, overdue invoices, new customers', href: '/dashboard/settings/automation-rules', icon: Bell },
  { title: 'Audit Log', description: 'Immutable record of all system changes', href: '/dashboard/settings/audit-log', icon: ClipboardList },
  { title: 'Themes', description: 'Customize the ERP appearance', href: '/dashboard/settings/themes', icon: Palette },
  { title: 'Users', description: 'Manage user accounts and departments', href: '/dashboard/users', icon: Users },
]

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Settings</h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-0.5">Configure every aspect of your ERP system</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {settingsSections.map(section => {
          const Icon = section.icon
          return (
            <Link key={section.href} href={section.href}
              className="group rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-5 hover:border-[var(--color-accent)]/40 hover:bg-[var(--color-bg-elevated)] transition-all duration-150">
              <div className="w-10 h-10 rounded-lg bg-[var(--color-bg-elevated)] border border-[var(--color-border)] flex items-center justify-center mb-3 group-hover:bg-[var(--color-accent)]/10 group-hover:border-[var(--color-accent)]/20 transition-colors">
                <Icon size={18} className="text-[var(--color-text-secondary)] group-hover:text-[var(--color-accent)] transition-colors" />
              </div>
              <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-1">{section.title}</h3>
              <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">{section.description}</p>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
