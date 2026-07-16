'use client'
import { useState, useTransition } from 'react'
import { Check, X, Shield, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { toast } from '@/components/ui/Toast'
import {
  ERP_MODULES, PERMISSION_ACTIONS, PERMISSION_ACTION_LABELS,
  type Role, type Permission, type PermissionMatrix
} from '@/modules/settings/permissions/types/permission.types'

interface Props {
  roles: Role[]
  permissions: Permission[]
  initialMatrix: PermissionMatrix
}

export default function PermissionMatrixClient({ roles, permissions, initialMatrix }: Props) {
  const [matrix, setMatrix] = useState<PermissionMatrix>(initialMatrix)
  const [isPending, startTransition] = useTransition()
  const [selectedRole, setSelectedRole] = useState<string>(roles[0]?.id ?? '')
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set(ERP_MODULES.map(m => m.key)))

  const getPermId = (module: string, action: string): string | undefined =>
    permissions.find(p => p.module === module && p.action === action)?.id

  const isGranted = (roleId: string, module: string, action: string): boolean =>
    matrix[roleId]?.[module]?.[action] ?? false

  const toggle = (module: string, action: string) => {
    const permId = getPermId(module, action)
    if (!permId || !selectedRole) return

    const currentValue = isGranted(selectedRole, module, action)
    const newValue = !currentValue

    // Optimistic update
    setMatrix(prev => ({
      ...prev,
      [selectedRole]: {
        ...prev[selectedRole],
        [module]: {
          ...prev[selectedRole]?.[module],
          [action]: newValue,
        }
      }
    }))

    startTransition(async () => {
      try {
        const res = await fetch('/api/v1/permissions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            role_id: selectedRole,
            permission_id: permId,
            grant: newValue,
            company_id: roles.find(r => r.id === selectedRole)?.company_id,
          }),
        })
        if (!res.ok) throw new Error('Failed')
        toast.success(newValue ? 'Permission granted' : 'Permission revoked')
      } catch {
        // Revert on failure
        setMatrix(prev => ({
          ...prev,
          [selectedRole]: {
            ...prev[selectedRole],
            [module]: { ...prev[selectedRole]?.[module], [action]: currentValue }
          }
        }))
        toast.error('Failed to update permission')
      }
    })
  }

  const toggleModule = (moduleKey: string) => {
    setExpandedModules(prev => {
      const next = new Set(prev)
      if (next.has(moduleKey)) next.delete(moduleKey); else next.add(moduleKey)
      return next
    })
  }

  const grantAll = (moduleKey: string) => {
    PERMISSION_ACTIONS.forEach(action => {
      if (!isGranted(selectedRole, moduleKey, action)) toggle(moduleKey, action)
    })
  }

  const revokeAll = (moduleKey: string) => {
    PERMISSION_ACTIONS.forEach(action => {
      if (isGranted(selectedRole, moduleKey, action)) toggle(moduleKey, action)
    })
  }

  const selectedRoleObj = roles.find(r => r.id === selectedRole)
  const isSystemRole = selectedRoleObj?.slug === 'superadmin' || selectedRoleObj?.slug === 'owner'

  return (
    <div className="space-y-4">
      {/* Role Selector */}
      <div className="flex items-center gap-3 flex-wrap">
        {roles.map(role => (
          <button
            key={role.id}
            onClick={() => setSelectedRole(role.id)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-all',
              selectedRole === role.id
                ? 'bg-[var(--color-accent)] text-white border-transparent shadow-md'
                : 'bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)] border-[var(--color-border)] hover:border-[var(--color-accent)]/40 hover:text-[var(--color-text-primary)]'
            )}
          >
            <Shield size={13} />
            {role.name}
            {role.is_system_role && (
              <span className={cn(
                'text-xs px-1.5 py-0.5 rounded',
                selectedRole === role.id ? 'bg-white/20' : 'bg-[var(--color-bg-elevated)]'
              )}>System</span>
            )}
          </button>
        ))}
      </div>

      {/* System role notice */}
      {isSystemRole && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-[var(--color-success)]/10 border border-[var(--color-success)]/20 text-sm text-[var(--color-success)]">
          <Check size={15} />
          <strong>{selectedRoleObj?.name}</strong> has full access to all modules — permissions cannot be restricted for this role.
        </div>
      )}

      {/* Matrix */}
      <div className={cn(
        'rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] overflow-hidden',
        isSystemRole && 'opacity-60 pointer-events-none'
      )}>
        {/* Header row */}
        <div className="flex items-center border-b border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
          <div className="w-52 px-4 py-3 text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider flex-shrink-0">
            Module
          </div>
          {PERMISSION_ACTIONS.map(action => (
            <div key={action} className="flex-1 min-w-[60px] px-1 py-3 text-center">
              <span className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
                {PERMISSION_ACTION_LABELS[action].slice(0, 3)}
              </span>
            </div>
          ))}
          <div className="w-28 px-3 py-3 text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider text-center flex-shrink-0">
            Quick
          </div>
        </div>

        {/* Module rows */}
        {ERP_MODULES.map((mod, idx) => {
          const expanded = expandedModules.has(mod.key)
          const grantedCount = PERMISSION_ACTIONS.filter(a => isGranted(selectedRole, mod.key, a)).length
          const totalCount = PERMISSION_ACTIONS.length

          return (
            <div key={mod.key} className={cn(
              'border-b border-[var(--color-border-subtle)] last:border-b-0',
              idx % 2 === 0 ? 'bg-[var(--color-bg-secondary)]' : 'bg-[var(--color-bg-elevated)]/30'
            )}>
              <div className="flex items-center hover:bg-[var(--color-bg-elevated)]/50 transition-colors">
                {/* Module label */}
                <button
                  onClick={() => toggleModule(mod.key)}
                  className="w-52 px-4 py-3 flex items-center gap-2 text-sm font-medium text-[var(--color-text-primary)] flex-shrink-0"
                >
                  {expanded ? <ChevronUp size={12} className="text-[var(--color-text-muted)]" /> : <ChevronDown size={12} className="text-[var(--color-text-muted)]" />}
                  {mod.label}
                  <span className="ml-auto text-xs text-[var(--color-text-muted)]">
                    {grantedCount}/{totalCount}
                  </span>
                </button>

                {/* Permission toggles */}
                {PERMISSION_ACTIONS.map(action => {
                  const granted = isGranted(selectedRole, mod.key, action)
                  const permExists = !!getPermId(mod.key, action)
                  return (
                    <div key={action} className="flex-1 min-w-[60px] px-1 py-3 flex justify-center">
                      {permExists ? (
                        <button
                          onClick={() => toggle(mod.key, action)}
                          disabled={isPending}
                          title={`${granted ? 'Revoke' : 'Grant'} ${PERMISSION_ACTION_LABELS[action]} on ${mod.label}`}
                          className={cn(
                            'w-6 h-6 rounded flex items-center justify-center transition-all duration-150',
                            granted
                              ? 'bg-[var(--color-success)] text-white hover:bg-[var(--color-success)]/80'
                              : 'bg-[var(--color-bg-elevated)] border border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-danger)] hover:text-[var(--color-danger)]',
                            isPending && 'opacity-50'
                          )}
                        >
                          {granted ? <Check size={11} /> : <X size={11} />}
                        </button>
                      ) : (
                        <div className="w-6 h-6 flex items-center justify-center">
                          <span className="text-[var(--color-border)] text-xs">—</span>
                        </div>
                      )}
                    </div>
                  )
                })}

                {/* Quick actions */}
                <div className="w-28 px-3 py-3 flex items-center justify-center gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => grantAll(mod.key)}
                    title="Grant all"
                    className="text-xs px-2 py-1 rounded bg-[var(--color-success)]/10 text-[var(--color-success)] hover:bg-[var(--color-success)]/20 border border-[var(--color-success)]/20 transition-colors"
                  >
                    All
                  </button>
                  <button
                    onClick={() => revokeAll(mod.key)}
                    title="Revoke all"
                    className="text-xs px-2 py-1 rounded bg-[var(--color-danger)]/10 text-[var(--color-danger)] hover:bg-[var(--color-danger)]/20 border border-[var(--color-danger)]/20 transition-colors"
                  >
                    None
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <p className="text-xs text-[var(--color-text-muted)]">
        Changes save instantly. Each toggle updates the database immediately.
      </p>
    </div>
  )
}
