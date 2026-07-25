'use client'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { buildHomeActions } from './navConfig'
import { useNavPermissions } from '@/modules/settings/permissions/hooks/usePermission'

/**
 * Role-aware quick actions shown at the top of the dashboard below lg.
 *
 * On a phone the dashboard's twelve KPI counts are a manager's view; a
 * printing operator or store keeper opens the app to DO one of about three
 * things. These tiles put those three things first, per role — an operator
 * sees My Queue and Scan before anything else, sales sees Quotations — with
 * 56px touch targets sized for factory-floor use (gloves, hurry, glare).
 *
 * Desktop is untouched: at lg+ this renders nothing and the KPI dashboard
 * remains exactly as it is.
 *
 * Like the bottom tab bar, the tiles are permission-derived, not hardcoded
 * per role: MOBILE_HOME_PRIORITY only orders what the user can already see,
 * so a new role Mehboob creates later gets sensible tiles with no code
 * change, and a user stripped of a module never sees its tile.
 */
export function MobileHome() {
  const { ready, role, canView } = useNavPermissions()
  const actions = buildHomeActions(role, ready ? canView : () => true)

  if (actions.length === 0) return null

  return (
    <div className="lg:hidden">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
        {actions.map(a => {
          const Icon = a.icon
          return (
            <Link
              key={a.key}
              href={a.href}
              className="flex items-center gap-3 min-h-14 px-3.5 py-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] active:bg-[var(--color-bg-elevated)] transition-colors"
            >
              <span
                className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: `${a.color}1a` }}
              >
                <Icon size={18} style={{ color: a.color }} />
              </span>
              <span className="text-sm font-medium text-[var(--color-text-primary)] min-w-0 truncate flex-1">
                {a.label}
              </span>
              <ChevronRight size={15} className="text-[var(--color-text-muted)] flex-shrink-0" />
            </Link>
          )
        })}
      </div>
    </div>
  )
}

export default MobileHome
