'use client'
import { useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Building2, Users, Settings2, Workflow, Palette, Shield, Bell, FileText, Hash, Circle, ClipboardList, BookOpen, Mail, Droplet, Zap, Clock, Search, X, SearchX } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { EmptyState } from '@/components/ui/EmptyState'

export interface SettingsSection {
  title: string
  description: string
  href: string
  icon: LucideIcon
  /**
   * What lives INSIDE this page. Searching only titles and descriptions is
   * close to useless here — nobody looking for "Spot UV" guesses that it sits
   * under "Material Types", and nobody hunting for the auto sign-out timer
   * types "Session Timeout". These are the words people actually reach for,
   * matched but never displayed.
   */
  keywords: string[]
}

/**
 * The list lives here, in the client component, rather than in page.tsx.
 * `icon` holds a React component, and a server component may not pass a
 * function across to a client one — doing so type-checks, builds clean, and
 * then throws "Functions cannot be passed directly to Client Components" when
 * the page actually renders. Nothing in this list needs the server anyway.
 *
 * `keywords` are what actually lives INSIDE each page, so the search finds the
 * right card from the thing being looked for rather than only from the card's
 * own title. They are matched but never rendered — checked against each page's
 * real contents, not guessed.
 */
export const SETTINGS_SECTIONS: SettingsSection[] = [
  { title: 'Company', description: 'Company profile, logo, branches, warehouses', href: '/dashboard/settings/company', icon: Building2,
    keywords: ['profile', 'logo', 'branch', 'warehouse', 'store', 'address', 'ntn', 'strn', 'business'] },
  { title: 'Departments', description: 'Department setup and org structure', href: '/dashboard/settings/departments', icon: Users,
    keywords: ['org', 'team', 'section', 'printing', 'dispatch', 'store', 'artwork', 'planning', 'quality'] },
  { title: 'Machines', description: 'Machine registry and status management', href: '/dashboard/settings/machines', icon: Settings2,
    keywords: ['press', 'printing', 'die cutting', 'lamination', 'folder gluing', 'hot foil', 'capacity', 'downtime', 'maintenance'] },
  // Tabs really present here: Board, Box, Paper, Ink, Glue, Foil, Coating,
  // Cost Items. The old description listed lamination, which has no tab.
  { title: 'Material Types', description: 'Board, box, paper, ink, glue, foil and coating types', href: '/dashboard/settings/materials', icon: FileText,
    keywords: ['board', 'bleach', 'ecano', 'white eagle', 'duplex', 'gsm', 'flute', 'paper', 'art paper', 'sticker', 'ink', 'glue', 'foil',
               'coating', 'uv', 'spot uv', 'water base', 'drip-off', 'varnish', 'box type', 'hl', 'label', 'cost item', 'rate'] },
  { title: 'Color Library', description: 'Pantone / CMYK / custom color specs for jobs and customers', href: '/dashboard/settings/color-library', icon: Droplet,
    keywords: ['pantone', 'cmyk', 'rgb', 'hex', 'shade', 'spot color', 'brand color', 'swatch'] },
  { title: 'Units, Currencies & Taxes', description: 'Measurement units, currencies and tax rates', href: '/dashboard/settings/units-currencies', icon: BookOpen,
    keywords: ['unit', 'kg', 'sheet', 'piece', 'currency', 'pkr', 'rupee', 'symbol', 'tax', 'gst', 'sales tax', 'rate', 'code'] },
  { title: 'Document Numbering', description: 'Sequence formats for jobs, orders, dispatches', href: '/dashboard/settings/sequences', icon: Hash,
    keywords: ['sequence', 'prefix', 'counter', 'format', 'padding', 'job number', 'invoice number',
               'job', 'inv', 'qt', 'so', 'po', 'mrn', 'disp', 'cust', 'vnd'] },
  { title: 'Workflow Engine', description: 'Build production workflow templates with stages', href: '/dashboard/settings/workflow', icon: Workflow,
    keywords: ['stage', 'template', 'sequence', 'dependency', 'gate', 'qc', 'artwork', 'plates', 'board issue',
               // 'uv coating' stays as a search alias after 127 renamed the stage
               // to 'Coating' — people will keep typing the old name for years.
               'printing', 'lamination', 'coating', 'uv coating', 'die cutting', 'hot foil', 'folder gluing', 'packing', 'dispatch'] },
  { title: 'Job Status & Delay Reasons', description: 'Job statuses and mandatory delay reason list', href: '/dashboard/settings/job-status', icon: Circle,
    keywords: ['status', 'hold', 'delay', 'reason', 'on hold', 'in progress', 'completed', 'cancelled'] },
  { title: 'Permissions & Roles', description: 'Role-based access control matrix', href: '/dashboard/settings/permissions', icon: Shield,
    keywords: ['role', 'access', 'rbac', 'matrix', 'superadmin', 'admin', 'owner', 'sales', 'artwork',
               'planning', 'store', 'printing', 'dispatch', 'view', 'create', 'edit', 'delete', 'approve'] },
  { title: 'Notifications', description: 'Alert rules and notification preferences', href: '/dashboard/settings/notifications', icon: Bell,
    keywords: ['alert', 'email', 'whatsapp', 'channel', 'digest', 'preference', 'bell'] },
  { title: 'Session Timeout', description: 'Auto sign-out after a period of inactivity', href: '/dashboard/settings/session-timeout', icon: Clock,
    keywords: ['logout', 'sign out', 'idle', 'inactivity', 'security', 'auto', 'expiry', 'login'] },
  { title: 'Report Schedules', description: 'Automatically email reports on a recurring schedule', href: '/dashboard/settings/report-schedules', icon: Mail,
    keywords: ['schedule', 'email', 'recurring', 'cron', 'daily', 'weekly', 'monthly', 'report', 'export'] },
  { title: 'Webhooks', description: 'Send business events to your own systems via HTTPS POST', href: '/dashboard/settings/webhooks', icon: Zap,
    keywords: ['api', 'integration', 'endpoint', 'https', 'post', 'event', 'payload', 'delivery', 'retry'] },
  { title: 'Automation Rules', description: 'Automatic notifications for jobs stuck on hold, overdue invoices, new customers', href: '/dashboard/settings/automation-rules', icon: Bell,
    keywords: ['rule', 'trigger', 'automatic', 'reminder', 'overdue', 'stuck', 'on hold', 'escalation'] },
  { title: 'Audit Log', description: 'Immutable record of all system changes', href: '/dashboard/settings/audit-log', icon: ClipboardList,
    keywords: ['history', 'trail', 'change', 'who', 'record', 'log', 'tracking', 'activity'] },
  { title: 'Themes', description: 'Customize the ERP appearance', href: '/dashboard/settings/themes', icon: Palette,
    keywords: ['appearance', 'colour', 'color', 'dark', 'light', 'look', 'branding', 'display'] },
  { title: 'Users', description: 'Manage user accounts and departments', href: '/dashboard/users', icon: Users,
    keywords: ['account', 'staff', 'employee', 'password', 'login', 'email', 'phone', 'role', 'invite', 'deactivate'] },
]

/**
 * Exported so the matching rules can be asserted directly instead of being
 * eyeballed through a rendered component.
 *
 * Every term must land somewhere, so "job number" narrows to Document
 * Numbering rather than returning every page that mentions "job".
 */
export function filterSections(sections: SettingsSection[], query: string): SettingsSection[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!terms.length) return sections
  return sections.filter(s => {
    const haystack = `${s.title} ${s.description} ${s.keywords.join(' ')}`.toLowerCase()
    return terms.every(t => haystack.includes(t))
  })
}

export function SettingsClient({ sections = SETTINGS_SECTIONS }: { sections?: SettingsSection[] }) {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const results = useMemo(() => filterSections(sections, query), [sections, query])

  const clear = () => { setQuery(''); inputRef.current?.focus() }

  return (
    <div className="space-y-4">
      <div className="relative max-w-md">
        <Search size={15} aria-hidden
          className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] pointer-events-none" />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => { if (e.key === 'Escape' && query) { e.preventDefault(); clear() } }}
          placeholder="Search settings…"
          aria-label="Search settings"
          className="w-full h-11 lg:h-9 pl-9 pr-9 rounded-md border text-sm bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border-[var(--color-border)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] transition-colors [&::-webkit-search-cancel-button]:hidden"
        />
        {query && (
          <button type="button" onClick={clear} aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-secondary)] transition-colors">
            <X size={14} />
          </button>
        )}
      </div>

      {query && (
        <p className="text-xs text-[var(--color-text-muted)]" role="status" aria-live="polite">
          {results.length === 0
            ? 'No settings match'
            : `${results.length} of ${sections.length} settings`}
        </p>
      )}

      {results.length === 0 ? (
        <EmptyState
          icon={<SearchX size={40} />}
          title="Nothing found"
          description={`No settings page matches “${query}”. Try a shorter word.`}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {results.map(section => {
            const Icon = section.icon
            return (
              <Link key={section.href} href={section.href}
                className="group rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-5 hover:border-[color:color-mix(in_srgb,var(--color-accent)_40%,transparent)] hover:bg-[var(--color-bg-elevated)] transition-all duration-150">
                <div className="w-10 h-10 rounded-lg bg-[var(--color-bg-elevated)] border border-[var(--color-border)] flex items-center justify-center mb-3 group-hover:bg-[color:color-mix(in_srgb,var(--color-accent)_10%,transparent)] group-hover:border-[color:color-mix(in_srgb,var(--color-accent)_20%,transparent)] transition-colors">
                  <Icon size={18} className="text-[var(--color-text-secondary)] group-hover:text-[var(--color-accent)] transition-colors" />
                </div>
                <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-1">{section.title}</h3>
                <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">{section.description}</p>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default SettingsClient
