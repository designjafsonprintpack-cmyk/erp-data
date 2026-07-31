'use client'
import { useState } from 'react'
import { Users, Plus, UserCheck, UserX, Edit2, Key, Copy, Check, Eye, EyeOff, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { toast } from '@/components/ui/Toast'
import { Modal, ConfirmDialog } from '@/components/ui/Modal'
import { DataList, type DataListColumn } from '@/components/ui/DataList'
import { Toolbar } from '@/components/ui/Toolbar'

interface User {
  id: string; full_name: string; email: string; employee_code: string | null
  app_role: string; is_active: boolean; mobile: string | null; created_at: string
  department_id: string | null
  departments?: { name: string } | null
}
interface Department { id: string; name: string }
interface Role { id: string; name: string; slug: string; description: string | null }

const ROLE_CFG: Record<string, { label: string; color: string }> = {
  superadmin:    { label: 'Super Admin',    color: 'text-[var(--color-danger)] bg-[color:color-mix(in_srgb,var(--color-danger)_10%,transparent)] border-[color:color-mix(in_srgb,var(--color-danger)_20%,transparent)]' },
  super_admin:   { label: 'Super Admin',    color: 'text-[var(--color-danger)] bg-[color:color-mix(in_srgb,var(--color-danger)_10%,transparent)] border-[color:color-mix(in_srgb,var(--color-danger)_20%,transparent)]' },
  owner:         { label: 'Owner',          color: 'text-[var(--color-danger)] bg-[color:color-mix(in_srgb,var(--color-danger)_10%,transparent)] border-[color:color-mix(in_srgb,var(--color-danger)_20%,transparent)]' },
  ceo:           { label: 'CEO',            color: 'text-[var(--color-danger)] bg-[color:color-mix(in_srgb,var(--color-danger)_10%,transparent)] border-[color:color-mix(in_srgb,var(--color-danger)_20%,transparent)]' },
  gm:            { label: 'General Manager',color: 'text-[var(--color-warning)] bg-[color:color-mix(in_srgb,var(--color-warning)_10%,transparent)] border-[color:color-mix(in_srgb,var(--color-warning)_20%,transparent)]' },
  admin:         { label: 'Admin',          color: 'text-[var(--color-warning)] bg-[color:color-mix(in_srgb,var(--color-warning)_10%,transparent)] border-[color:color-mix(in_srgb,var(--color-warning)_20%,transparent)]' },
  // The two manager tiers (119, 121, 122) share the accent, one step down from
  // the warning tier that GM and Admin sit on.
  production_manager: { label: 'Production Manager', color: 'text-[var(--color-accent)] bg-[color:color-mix(in_srgb,var(--color-accent)_10%,transparent)] border-[color:color-mix(in_srgb,var(--color-accent)_20%,transparent)]' },
  store_manager: { label: 'Store Manager',  color: 'text-[var(--color-accent)] bg-[color:color-mix(in_srgb,var(--color-accent)_10%,transparent)] border-[color:color-mix(in_srgb,var(--color-accent)_20%,transparent)]' },
  manager:       { label: 'Manager',        color: 'text-[var(--color-accent)] bg-[color:color-mix(in_srgb,var(--color-accent)_10%,transparent)] border-[color:color-mix(in_srgb,var(--color-accent)_20%,transparent)]' },
  production:    { label: 'Production',     color: 'text-[var(--color-info)] bg-[color:color-mix(in_srgb,var(--color-info)_10%,transparent)] border-[color:color-mix(in_srgb,var(--color-info)_20%,transparent)]' },
  sales:         { label: 'Sales',          color: 'text-[var(--color-success)] bg-[color:color-mix(in_srgb,var(--color-success)_10%,transparent)] border-[color:color-mix(in_srgb,var(--color-success)_20%,transparent)]' },
  accounts:      { label: 'Accounts',       color: 'text-purple-400 bg-purple-400/10 border-purple-400/20' },
  // The shop-floor roles. All had a real `roles` row but no entry here, so
  // every one of them rendered in the grey "Staff" colour with only the
  // database name to tell them apart — which is most of the staff now on the
  // system. Label is still read from `roles.name` first (see roleLabel); these
  // exist for the colour and for the fallback dropdown.
  printing:      { label: 'Production Operator', color: 'text-[var(--color-info)] bg-[color:color-mix(in_srgb,var(--color-info)_10%,transparent)] border-[color:color-mix(in_srgb,var(--color-info)_20%,transparent)]' },
  planning:      { label: 'Planning',       color: 'text-[var(--color-info)] bg-[color:color-mix(in_srgb,var(--color-info)_10%,transparent)] border-[color:color-mix(in_srgb,var(--color-info)_20%,transparent)]' },
  artwork:       { label: 'Artwork',        color: 'text-[var(--color-info)] bg-[color:color-mix(in_srgb,var(--color-info)_10%,transparent)] border-[color:color-mix(in_srgb,var(--color-info)_20%,transparent)]' },
  plates:        { label: 'Plate Making',   color: 'text-[var(--color-info)] bg-[color:color-mix(in_srgb,var(--color-info)_10%,transparent)] border-[color:color-mix(in_srgb,var(--color-info)_20%,transparent)]' },
  store:         { label: 'Store',          color: 'text-[var(--color-success)] bg-[color:color-mix(in_srgb,var(--color-success)_10%,transparent)] border-[color:color-mix(in_srgb,var(--color-success)_20%,transparent)]' },
  purchase:      { label: 'Purchase',       color: 'text-[var(--color-success)] bg-[color:color-mix(in_srgb,var(--color-success)_10%,transparent)] border-[color:color-mix(in_srgb,var(--color-success)_20%,transparent)]' },
  dispatch:      { label: 'Dispatch',       color: 'text-[var(--color-success)] bg-[color:color-mix(in_srgb,var(--color-success)_10%,transparent)] border-[color:color-mix(in_srgb,var(--color-success)_20%,transparent)]' },
  qc:            { label: 'Quality Control', color: 'text-purple-400 bg-purple-400/10 border-purple-400/20' },
  staff:         { label: 'Staff',          color: 'text-[var(--color-text-muted)] bg-[var(--color-bg-elevated)] border-[var(--color-border)]' },
  readonly:      { label: 'Read Only',      color: 'text-[var(--color-text-muted)] bg-[var(--color-bg-elevated)] border-[var(--color-border)]' },
}

/**
 * Fallback only. The Role dropdown is normally built from the `roles` table
 * (see page.tsx) so anything added in Settings → Roles & Permissions — GM, CEO,
 * or whatever comes next — shows up with no code change. This list is what
 * renders if that query ever comes back empty.
 */
const FALLBACK_ROLES = ['ceo','gm','admin','manager','production','sales','accounts','staff','readonly']

/** Human label for a role slug: DB name first, then ROLE_CFG, then the slug. */
function roleLabel(slug: string, roles: Role[]): string {
  return roles.find(r => r.slug === slug)?.name
    || ROLE_CFG[slug]?.label
    || slug.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

const inputCls = 'w-full h-11 md:h-9 px-3 rounded-md border text-sm bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border-[var(--color-border)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] transition-colors'

/**
 * Factory rather than a constant: the action buttons need the modal setters,
 * which only exist inside the component. Same shape as INV_COLUMNS/MRP_COLUMNS.
 *
 * Spans total 12, so the desktop table is byte-for-byte the old layout. The
 * `role` on each column is what drives the mobile card: name on top, email
 * under it, role badge top-right, code/dept/status as a labelled meta grid,
 * buttons on their own bottom row.
 */
const USER_COLUMNS = (
  onEdit: (u: User) => void,
  onToggleActive: (u: User) => void,
  onResetPassword: ((u: User) => void) | null,
  onDelete: ((u: User) => void) | null,
  roles: Role[],
): DataListColumn<User>[] => [
  {
    key: 'name', header: 'Name', span: 3, role: 'identity',
    render: u => (
      <div className="min-w-0">
        <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">{u.full_name}</p>
        {u.mobile && <p className="text-xs text-[var(--color-text-muted)] truncate">{u.mobile}</p>}
      </div>
    ),
  },
  {
    // span 3 → 2 to make room for the third action button (Reset Password);
    // the address was already `truncate`, and 12 columns still total 12.
    key: 'email', header: 'Email', span: 2, role: 'title',
    render: u => <span className="text-sm text-[var(--color-text-secondary)] truncate block">{u.email}</span>,
  },
  {
    key: 'role', header: 'Role', span: 2, role: 'status',
    render: u => {
      const cfg = ROLE_CFG[u.app_role] || ROLE_CFG.staff
      return <span className={cn('text-xs px-2 py-0.5 rounded-full border font-medium whitespace-nowrap', cfg.color)}>{roleLabel(u.app_role, roles)}</span>
    },
  },
  {
    key: 'code', header: 'Code', span: 1, role: 'meta', label: 'Code',
    render: u => <span className="text-xs font-mono text-[var(--color-text-muted)]">{u.employee_code || '—'}</span>,
  },
  {
    key: 'dept', header: 'Dept', span: 1, role: 'meta', label: 'Dept',
    render: u => <span className="text-xs text-[var(--color-text-muted)] truncate block">{u.departments?.name || '—'}</span>,
  },
  {
    key: 'status', header: 'Status', span: 1, role: 'meta', label: 'Status',
    render: u => (
      <span className={cn('text-xs font-medium', u.is_active ? 'text-[var(--color-success)]' : 'text-[var(--color-text-muted)]')}>
        {u.is_active ? 'Active' : 'Inactive'}
      </span>
    ),
  },
  {
    key: 'actions', header: 'Actions', span: 2, role: 'actions', align: 'right',
    render: u => (
      <div className="flex items-center gap-1.5 justify-end">
        {onResetPassword && (
          <button onClick={() => onResetPassword(u)} aria-label={`Reset password for ${u.full_name}`} title="Reset password"
            className="w-9 h-9 md:w-7 md:h-7 flex items-center justify-center rounded border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-warning)] hover:border-[color:color-mix(in_srgb,var(--color-warning)_30%,transparent)] transition-colors">
            <Key size={13} />
          </button>
        )}
        <button onClick={() => onEdit(u)} aria-label={`Edit ${u.full_name}`}
          className="w-9 h-9 md:w-7 md:h-7 flex items-center justify-center rounded border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-accent)] hover:border-[color:color-mix(in_srgb,var(--color-accent)_30%,transparent)] transition-colors">
          <Edit2 size={13} />
        </button>
        <button onClick={() => onToggleActive(u)} aria-label={u.is_active ? `Deactivate ${u.full_name}` : `Activate ${u.full_name}`}
          className={cn('w-9 h-9 md:w-7 md:h-7 flex items-center justify-center rounded border transition-colors',
            u.is_active
              ? 'border-[color:color-mix(in_srgb,var(--color-danger)_30%,transparent)] text-[var(--color-danger)] hover:bg-[color:color-mix(in_srgb,var(--color-danger)_10%,transparent)]'
              : 'border-[color:color-mix(in_srgb,var(--color-success)_30%,transparent)] text-[var(--color-success)] hover:bg-[color:color-mix(in_srgb,var(--color-success)_10%,transparent)]')}>
          {u.is_active ? <UserX size={13} /> : <UserCheck size={13} />}
        </button>
        {onDelete && (
          <button onClick={() => onDelete(u)} aria-label={`Delete ${u.full_name}`} title="Delete user"
            className="w-9 h-9 md:w-7 md:h-7 flex items-center justify-center rounded border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-danger)] hover:border-[color:color-mix(in_srgb,var(--color-danger)_30%,transparent)] transition-colors">
            <Trash2 size={13} />
          </button>
        )}
      </div>
    ),
  },
]

export default function UsersClient({ initialUsers, departments, roles, isSuperadmin = false, canDelete = false, currentUserId = null }: {
  initialUsers: User[]; departments: Department[]; roles: Role[]
  isSuperadmin?: boolean
  /** users → delete permission. The API re-checks; this only hides the button. */
  canDelete?: boolean
  /** public.users.id of the signed-in user, so they can't delete themselves. */
  currentUserId?: string | null
}) {
  // Role dropdown options come from the roles table; the hardcoded list is only
  // a safety net for an empty query.
  const roleOptions = roles.length
    ? roles.map(r => ({ value: r.slug, label: r.name }))
    : FALLBACK_ROLES.map(r => ({ value: r, label: ROLE_CFG[r]?.label || r }))

  // A <select> whose value isn't among its options renders BLANK and then saves
  // that blank back — the trap that already bit jobs.uv_coating. So a value the
  // options don't cover (a legacy 'staff', or a role since renamed) is appended
  // rather than silently dropped.
  const optionsWith = (selected: string) =>
    selected && !roleOptions.some(o => o.value === selected)
      ? [...roleOptions, { value: selected, label: roleLabel(selected, roles) }]
      : roleOptions

  const [users, setUsers] = useState(initialUsers)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)

  // New user modal. Defaults to the first real role rather than the old literal
  // 'staff', which has no row in `roles` — so it granted no permissions and
  // showed blank in this dropdown.
  const [newModal, setNewModal] = useState(false)
  const [newForm, setNewForm] = useState({ full_name: '', email: '', password: '', employee_code: '', app_role: roleOptions[0]?.value ?? 'staff', department_id: '', mobile: '' })

  // Edit modal
  const [editModal, setEditModal] = useState<User | null>(null)
  const [editForm, setEditForm] = useState({ full_name: '', employee_code: '', app_role: '', department_id: '', mobile: '' })

  // Reset password modal. `issued` holds the password the server actually set —
  // this is the one and only moment it is readable, so it stays on screen until
  // the modal is closed rather than disappearing into a toast.
  const [resetModal, setResetModal] = useState<User | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [issued, setIssued] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [showNew, setShowNew] = useState(false)

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null)

  const filtered = users.filter(u =>
    !search ||
    u.full_name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    (u.employee_code || '').toLowerCase().includes(search.toLowerCase())
  )

  const activeCount   = users.filter(u => u.is_active).length
  const inactiveCount = users.filter(u => !u.is_active).length

  const createUser = async () => {
    if (!newForm.full_name || !newForm.email) { toast.error('Name and email required'); return }
    if (!newForm.password || newForm.password.length < 8) { toast.error('Password must be at least 8 characters'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/v1/admin/users', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        // "No department" sends '' from the <select>, and the request schema
        // types department_id as a UUID — so an empty string failed validation
        // with a 400 instead of meaning "none". Send null, per the blankToNull
        // convention in src/lib/schemas/job.ts.
        body: JSON.stringify({ ...newForm, department_id: newForm.department_id || null }),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
      const { data } = await res.json()
      setUsers(prev => [...prev, { ...data, departments: departments.find(d => d.id === newForm.department_id) || null }].sort((a, b) => a.full_name.localeCompare(b.full_name)))
      setNewModal(false)
      setNewForm({ full_name: '', email: '', password: '', employee_code: '', app_role: roleOptions[0]?.value ?? 'staff', department_id: '', mobile: '' })
      toast.success(`User ${data.full_name} created`)
    } catch (e: any) { toast.error(e.message || 'Failed to create user') }
    finally { setLoading(false) }
  }

  const updateUser = async () => {
    if (!editModal) return
    setLoading(true)
    try {
      const res = await fetch(`/api/v1/admin/users/${editModal.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        // Same blank-vs-UUID trap as createUser above.
        body: JSON.stringify({ ...editForm, department_id: editForm.department_id || null }),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
      setUsers(prev => prev.map(u => u.id === editModal.id ? {
        ...u, ...editForm,
        department_id: editForm.department_id || null,
        departments: departments.find(d => d.id === editForm.department_id) || null,
      } : u))
      setEditModal(null)
      toast.success('User updated')
    } catch (e: any) { toast.error(e.message || 'Failed') }
    finally { setLoading(false) }
  }

  const openReset = (u: User) => {
    setResetModal(u); setNewPassword(''); setIssued(null); setCopied(false); setShowNew(false)
  }

  const resetPassword = async () => {
    if (!resetModal) return
    if (newPassword && newPassword.length < 8) { toast.error('Password must be at least 8 characters'); return }
    setLoading(true)
    try {
      const res = await fetch(`/api/v1/admin/users/${resetModal.id}/password`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        // Blank field = "generate one for me"; the server returns what it set.
        body: JSON.stringify(newPassword ? { password: newPassword } : {}),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
      const { data } = await res.json()
      setIssued(data.password)
      toast.success(`Password reset for ${resetModal.full_name}`)
    } catch (e: any) { toast.error(e.message || 'Failed to reset password') }
    finally { setLoading(false) }
  }

  const copyIssued = async () => {
    if (!issued) return
    try {
      await navigator.clipboard.writeText(issued)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { toast.error('Could not copy — select the password and copy it manually') }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setLoading(true)
    try {
      const res = await fetch(`/api/v1/admin/users/${deleteTarget.id}`, { method: 'DELETE' })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
      setUsers(prev => prev.filter(u => u.id !== deleteTarget.id))
      toast.success(`${deleteTarget.full_name} deleted`)
      setDeleteTarget(null)
    } catch (e: any) { toast.error(e.message || 'Failed to delete user') }
    finally { setLoading(false) }
  }

  const toggleActive = async (u: User) => {
    try {
      const res = await fetch(`/api/v1/admin/users/${u.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !u.is_active }),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
      setUsers(prev => prev.map(x => x.id === u.id ? { ...x, is_active: !u.is_active } : x))
      toast.success(u.is_active ? 'User deactivated' : 'User activated')
    } catch (e: any) { toast.error(e.message || 'Failed') }
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-2.5 md:gap-4">
        {[
          { label: 'Total Users',    value: users.length,   icon: Users,     color: 'var(--color-accent)' },
          { label: 'Active',         value: activeCount,    icon: UserCheck, color: 'var(--color-success)' },
          { label: 'Inactive',       value: inactiveCount,  icon: UserX,     color: 'var(--color-text-muted)' },
        ].map(s => (
          // Three cards on a 360px screen leave ~105px each — the icon and the
          // label cannot sit side by side there, so they stack below md.
          <div key={s.label} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-3 md:p-4 flex flex-col md:flex-row items-start md:items-center gap-2 md:gap-3">
            <div className="w-9 h-9 md:w-10 md:h-10 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: `color-mix(in srgb, ${s.color} 12%, transparent)` }}>
              <s.icon size={18} style={{ color: s.color }} />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-[var(--color-text-muted)] truncate">{s.label}</p>
              <p className="text-lg md:text-xl font-bold text-[var(--color-text-primary)]">{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <Toolbar
        search={{ value: search, onChange: setSearch, placeholder: 'Search by name, email, employee code…' }}
        actions={
          <button onClick={() => setNewModal(true)}
            className="flex items-center justify-center gap-1.5 px-4 h-11 md:h-9 rounded-md bg-[var(--color-accent)] text-[var(--color-on-accent)] text-sm font-medium hover:bg-[var(--color-accent-hover)] transition-colors">
            <Plus size={15} /> New User
          </button>
        }
      />

      {/* Users list — 12-col table at xl, condensed at md, cards below */}
      <DataList
        rows={filtered}
        columns={USER_COLUMNS(
          u => {
            setEditModal(u)
            // Was hardcoded to '' — so every save silently cleared the user's
            // department. Prefill from the row instead.
            setEditForm({ full_name: u.full_name, employee_code: u.employee_code || '', app_role: u.app_role, department_id: u.department_id || '', mobile: u.mobile || '' })
          },
          toggleActive,
          isSuperadmin ? openReset : null,
          // Never offer "delete" on your own row — locking yourself out of the
          // system you administer has no undo from inside the app.
          canDelete ? (u: User) => { if (u.id === currentUserId) { toast.error('You cannot delete your own account'); return } setDeleteTarget(u) } : null,
          roles,
        )}
        getRowId={u => u.id}
        rowClassName={u => (!u.is_active ? 'opacity-50' : undefined)}
        striped
        empty={
          <div className="p-12 text-center">
            <Users size={28} className="text-[var(--color-text-muted)] opacity-30 mx-auto mb-2" />
            <p className="text-sm text-[var(--color-text-muted)]">{search ? 'No users found' : 'No users yet'}</p>
          </div>
        }
      />

      {/* New User Modal */}
      <Modal open={newModal} onClose={() => setNewModal(false)} title="Create New User" size="md"
        footer={
          <>
            <button onClick={() => setNewModal(false)} className="px-4 h-11 md:h-9 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">Cancel</button>
            <button onClick={createUser} disabled={loading || !newForm.full_name || !newForm.email}
              className="flex items-center gap-2 px-4 h-11 md:h-9 rounded-md bg-[var(--color-accent)] text-[var(--color-on-accent)] text-sm font-medium hover:bg-[var(--color-accent-hover)] disabled:opacity-50 transition-colors">
              <Users size={14} /> {loading ? 'Creating…' : 'Create User'}
            </button>
          </>
        }>
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2 space-y-1.5">
              <label htmlFor="usersclient-1" className="text-sm font-medium text-[var(--color-text-primary)]">Full Name <span className="text-[var(--color-danger)]">*</span></label>
              <input id="usersclient-1" className={inputCls} value={newForm.full_name} onChange={e => setNewForm(p => ({ ...p, full_name: e.target.value }))} placeholder="Muhammad Ahmed" />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="usersclient-2" className="text-sm font-medium text-[var(--color-text-primary)]">Email <span className="text-[var(--color-danger)]">*</span></label>
              <input id="usersclient-2" type="email" className={inputCls} value={newForm.email} onChange={e => setNewForm(p => ({ ...p, email: e.target.value }))} placeholder="user@jafson.com" />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="usersclient-3" className="text-sm font-medium text-[var(--color-text-primary)]">Password <span className="text-[var(--color-danger)]">*</span></label>
              <input id="usersclient-3" type="password" className={inputCls} value={newForm.password} onChange={e => setNewForm(p => ({ ...p, password: e.target.value }))} placeholder="Min 8 characters" />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="usersclient-4" className="text-sm font-medium text-[var(--color-text-primary)]">Employee Code</label>
              <input id="usersclient-4" className={inputCls} value={newForm.employee_code} onChange={e => setNewForm(p => ({ ...p, employee_code: e.target.value }))} placeholder="EMP-001" />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="usersclient-5" className="text-sm font-medium text-[var(--color-text-primary)]">Mobile</label>
              <input id="usersclient-5" className={inputCls} value={newForm.mobile} onChange={e => setNewForm(p => ({ ...p, mobile: e.target.value }))} placeholder="+92 300 0000000" />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="usersclient-6" className="text-sm font-medium text-[var(--color-text-primary)]">Role <span className="text-[var(--color-danger)]">*</span></label>
              <select id="usersclient-6" className={inputCls} value={newForm.app_role} onChange={e => setNewForm(p => ({ ...p, app_role: e.target.value }))}>
                {optionsWith(newForm.app_role).map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="usersclient-7" className="text-sm font-medium text-[var(--color-text-primary)]">Department</label>
              <select id="usersclient-7" className={inputCls} value={newForm.department_id} onChange={e => setNewForm(p => ({ ...p, department_id: e.target.value }))}>
                <option value="">No department</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
          </div>
          <div className="rounded-lg bg-[var(--color-bg-elevated)] border border-[var(--color-border)] p-3 text-xs text-[var(--color-text-muted)]">
            The user will be able to log in immediately with the email and password you set.
          </div>
        </div>
      </Modal>

      {/* Edit User Modal */}
      {editModal && (
        <Modal open={true} onClose={() => setEditModal(null)} title={`Edit — ${editModal.full_name}`} size="md"
          footer={
            <>
              <button onClick={() => setEditModal(null)} className="px-4 h-11 md:h-9 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">Cancel</button>
              <button onClick={updateUser} disabled={loading}
                className="px-4 h-11 md:h-9 rounded-md bg-[var(--color-accent)] text-[var(--color-on-accent)] text-sm font-medium hover:bg-[var(--color-accent-hover)] disabled:opacity-50 transition-colors">
                {loading ? 'Saving…' : 'Save Changes'}
              </button>
            </>
          }>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2 space-y-1.5">
              <label htmlFor="usersclient-8" className="text-sm font-medium text-[var(--color-text-primary)]">Full Name</label>
              <input id="usersclient-8" className={inputCls} value={editForm.full_name} onChange={e => setEditForm(p => ({ ...p, full_name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="usersclient-9" className="text-sm font-medium text-[var(--color-text-primary)]">Employee Code</label>
              <input id="usersclient-9" className={inputCls} value={editForm.employee_code} onChange={e => setEditForm(p => ({ ...p, employee_code: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="usersclient-10" className="text-sm font-medium text-[var(--color-text-primary)]">Mobile</label>
              <input id="usersclient-10" className={inputCls} value={editForm.mobile} onChange={e => setEditForm(p => ({ ...p, mobile: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="usersclient-11" className="text-sm font-medium text-[var(--color-text-primary)]">Role</label>
              <select id="usersclient-11" className={inputCls} value={editForm.app_role} onChange={e => setEditForm(p => ({ ...p, app_role: e.target.value }))}>
                {optionsWith(editForm.app_role).map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="usersclient-12" className="text-sm font-medium text-[var(--color-text-primary)]">Department</label>
              <select id="usersclient-12" className={inputCls} value={editForm.department_id} onChange={e => setEditForm(p => ({ ...p, department_id: e.target.value }))}>
                <option value="">No department</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
          </div>
        </Modal>
      )}

      {/* Reset Password Modal — superadmin only */}
      {resetModal && (
        <Modal open={true} onClose={() => setResetModal(null)} title={`Reset Password — ${resetModal.full_name}`} size="md"
          footer={
            issued ? (
              <button onClick={() => setResetModal(null)}
                className="px-4 h-11 md:h-9 rounded-md bg-[var(--color-accent)] text-[var(--color-on-accent)] text-sm font-medium hover:bg-[var(--color-accent-hover)] transition-colors">
                Done
              </button>
            ) : (
              <>
                <button onClick={() => setResetModal(null)} className="px-4 h-11 md:h-9 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">Cancel</button>
                <button onClick={resetPassword} disabled={loading}
                  className="flex items-center gap-2 px-4 h-11 md:h-9 rounded-md bg-[var(--color-warning)] text-[var(--color-on-warning)] text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity">
                  <Key size={14} /> {loading ? 'Resetting…' : newPassword ? 'Set This Password' : 'Generate & Reset'}
                </button>
              </>
            )
          }>
          {issued ? (
            <div className="space-y-4">
              <p className="text-sm text-[var(--color-text-secondary)]">
                Password for <span className="font-medium text-[var(--color-text-primary)]">{resetModal.email}</span> has been changed. Copy it now — it cannot be shown again.
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 px-3 py-2.5 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] text-base font-mono tracking-wider text-[var(--color-text-primary)] break-all select-all">
                  {issued}
                </code>
                <button onClick={copyIssued} aria-label="Copy password"
                  className="w-11 h-11 md:w-10 md:h-10 flex items-center justify-center rounded-md border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-accent)] hover:border-[color:color-mix(in_srgb,var(--color-accent)_30%,transparent)] transition-colors flex-shrink-0">
                  {copied ? <Check size={16} className="text-[var(--color-success)]" /> : <Copy size={16} />}
                </button>
              </div>
              <div className="rounded-lg border p-3 text-xs
                bg-[color:color-mix(in_srgb,var(--color-warning)_10%,transparent)]
                border-[color:color-mix(in_srgb,var(--color-warning)_25%,transparent)]
                text-[var(--color-text-secondary)]">
                Hand this over on WhatsApp or in person, then ask them to change it themselves from
                the account menu → Change Password.
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="usersclient-reset-pw" className="text-sm font-medium text-[var(--color-text-primary)]">New Password</label>
                <div className="relative">
                  <input id="usersclient-reset-pw" type={showNew ? 'text' : 'password'} className={cn(inputCls, 'pr-11')}
                    value={newPassword} onChange={e => setNewPassword(e.target.value)}
                    placeholder="Leave blank to generate a strong one" autoComplete="new-password" />
                  <button type="button" onClick={() => setShowNew(v => !v)} aria-label={showNew ? 'Hide password' : 'Show password'}
                    className="absolute right-1 top-1/2 -translate-y-1/2 w-9 h-9 md:w-7 md:h-7 flex items-center justify-center rounded text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors">
                    {showNew ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                <p className="text-xs text-[var(--color-text-muted)]">Minimum 8 characters if you type your own.</p>
              </div>
              <div className="rounded-lg bg-[var(--color-bg-elevated)] border border-[var(--color-border)] p-3 text-xs text-[var(--color-text-muted)] space-y-1.5">
                <p>
                  The existing password cannot be displayed — logins are stored as a one-way hash,
                  so nobody, including this system, can read it back. Setting a new one is the only
                  way in.
                </p>
                <p>Any active session this user has will keep working until it expires.</p>
              </div>
            </div>
          )}
        </Modal>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Delete User"
        message={`Delete ${deleteTarget?.full_name} (${deleteTarget?.email})? They will lose access immediately and disappear from this list. Everything they created — jobs, quotations, approvals — stays intact and still shows their name. If you only want to stop them logging in for now, use Deactivate instead; that one can be undone from here.`}
        confirmLabel="Delete User"
        loading={loading}
      />
    </div>
  )
}
