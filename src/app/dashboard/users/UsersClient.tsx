'use client'
import { useState } from 'react'
import { Users, Plus, Shield, UserCheck, UserX, Search, Edit2, Key } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { toast } from '@/components/ui/Toast'
import { Modal } from '@/components/ui/Modal'
import { formatDate, formatTimeAgo } from '@/lib/utils/format'
import { DataList, type DataListColumn } from '@/components/ui/DataList'
import { Toolbar } from '@/components/ui/Toolbar'

interface User {
  id: string; full_name: string; email: string; employee_code: string | null
  app_role: string; is_active: boolean; mobile: string | null; created_at: string
  departments?: { name: string } | null
}
interface Department { id: string; name: string }
interface Role { id: string; name: string; description: string | null }

const ROLE_CFG: Record<string, { label: string; color: string }> = {
  superadmin:    { label: 'Super Admin',    color: 'text-[var(--color-danger)] bg-[var(--color-danger)]/10 border-[var(--color-danger)]/20' },
  super_admin:   { label: 'Super Admin',    color: 'text-[var(--color-danger)] bg-[var(--color-danger)]/10 border-[var(--color-danger)]/20' },
  admin:         { label: 'Admin',          color: 'text-[var(--color-warning)] bg-[var(--color-warning)]/10 border-[var(--color-warning)]/20' },
  manager:       { label: 'Manager',        color: 'text-[var(--color-accent)] bg-[var(--color-accent)]/10 border-[var(--color-accent)]/20' },
  production:    { label: 'Production',     color: 'text-[var(--color-info)] bg-[var(--color-info)]/10 border-[var(--color-info)]/20' },
  sales:         { label: 'Sales',          color: 'text-[var(--color-success)] bg-[var(--color-success)]/10 border-[var(--color-success)]/20' },
  accounts:      { label: 'Accounts',       color: 'text-purple-400 bg-purple-400/10 border-purple-400/20' },
  staff:         { label: 'Staff',          color: 'text-[var(--color-text-muted)] bg-[var(--color-bg-elevated)] border-[var(--color-border)]' },
  readonly:      { label: 'Read Only',      color: 'text-[var(--color-text-muted)] bg-[var(--color-bg-elevated)] border-[var(--color-border)]' },
}

const APP_ROLES = ['admin','manager','production','sales','accounts','staff','readonly']
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
    key: 'email', header: 'Email', span: 3, role: 'title',
    render: u => <span className="text-sm text-[var(--color-text-secondary)] truncate block">{u.email}</span>,
  },
  {
    key: 'role', header: 'Role', span: 2, role: 'status',
    render: u => {
      const cfg = ROLE_CFG[u.app_role] || ROLE_CFG.staff
      return <span className={cn('text-xs px-2 py-0.5 rounded-full border font-medium whitespace-nowrap', cfg.color)}>{cfg.label}</span>
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
    key: 'actions', header: 'Actions', span: 1, role: 'actions', align: 'right',
    render: u => (
      <div className="flex items-center gap-1.5 justify-end">
        <button onClick={() => onEdit(u)} aria-label={`Edit ${u.full_name}`}
          className="w-9 h-9 md:w-7 md:h-7 flex items-center justify-center rounded border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-accent)] hover:border-[var(--color-accent)]/30 transition-colors">
          <Edit2 size={13} />
        </button>
        <button onClick={() => onToggleActive(u)} aria-label={u.is_active ? `Deactivate ${u.full_name}` : `Activate ${u.full_name}`}
          className={cn('w-9 h-9 md:w-7 md:h-7 flex items-center justify-center rounded border transition-colors',
            u.is_active
              ? 'border-[var(--color-danger)]/30 text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10'
              : 'border-[var(--color-success)]/30 text-[var(--color-success)] hover:bg-[var(--color-success)]/10')}>
          {u.is_active ? <UserX size={13} /> : <UserCheck size={13} />}
        </button>
      </div>
    ),
  },
]

export default function UsersClient({ initialUsers, departments, roles }: {
  initialUsers: User[]; departments: Department[]; roles: Role[]
}) {
  const [users, setUsers] = useState(initialUsers)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)

  // New user modal
  const [newModal, setNewModal] = useState(false)
  const [newForm, setNewForm] = useState({ full_name: '', email: '', password: '', employee_code: '', app_role: 'staff', department_id: '', mobile: '' })

  // Edit modal
  const [editModal, setEditModal] = useState<User | null>(null)
  const [editForm, setEditForm] = useState({ full_name: '', employee_code: '', app_role: '', department_id: '', mobile: '' })

  // Reset password modal
  const [resetModal, setResetModal] = useState<User | null>(null)
  const [newPassword, setNewPassword] = useState('')

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
        body: JSON.stringify(newForm),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
      const { data } = await res.json()
      setUsers(prev => [...prev, { ...data, departments: departments.find(d => d.id === newForm.department_id) || null }].sort((a, b) => a.full_name.localeCompare(b.full_name)))
      setNewModal(false)
      setNewForm({ full_name: '', email: '', password: '', employee_code: '', app_role: 'staff', department_id: '', mobile: '' })
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
        body: JSON.stringify(editForm),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
      setUsers(prev => prev.map(u => u.id === editModal.id ? {
        ...u, ...editForm,
        departments: departments.find(d => d.id === editForm.department_id) || u.departments,
      } : u))
      setEditModal(null)
      toast.success('User updated')
    } catch (e: any) { toast.error(e.message || 'Failed') }
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
            className="flex items-center justify-center gap-1.5 px-4 h-11 md:h-9 rounded-md bg-[var(--color-accent)] text-white text-sm font-medium hover:bg-[var(--color-accent-hover)] transition-colors">
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
            setEditForm({ full_name: u.full_name, employee_code: u.employee_code || '', app_role: u.app_role, department_id: '', mobile: u.mobile || '' })
          },
          toggleActive,
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
              className="flex items-center gap-2 px-4 h-11 md:h-9 rounded-md bg-[var(--color-accent)] text-white text-sm font-medium hover:bg-[var(--color-accent-hover)] disabled:opacity-50 transition-colors">
              <Users size={14} /> {loading ? 'Creating…' : 'Create User'}
            </button>
          </>
        }>
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2 space-y-1.5">
              <label className="text-sm font-medium text-[var(--color-text-primary)]">Full Name <span className="text-[var(--color-danger)]">*</span></label>
              <input className={inputCls} value={newForm.full_name} onChange={e => setNewForm(p => ({ ...p, full_name: e.target.value }))} placeholder="Muhammad Ahmed" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[var(--color-text-primary)]">Email <span className="text-[var(--color-danger)]">*</span></label>
              <input type="email" className={inputCls} value={newForm.email} onChange={e => setNewForm(p => ({ ...p, email: e.target.value }))} placeholder="user@jafson.com" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[var(--color-text-primary)]">Password <span className="text-[var(--color-danger)]">*</span></label>
              <input type="password" className={inputCls} value={newForm.password} onChange={e => setNewForm(p => ({ ...p, password: e.target.value }))} placeholder="Min 8 characters" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[var(--color-text-primary)]">Employee Code</label>
              <input className={inputCls} value={newForm.employee_code} onChange={e => setNewForm(p => ({ ...p, employee_code: e.target.value }))} placeholder="EMP-001" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[var(--color-text-primary)]">Mobile</label>
              <input className={inputCls} value={newForm.mobile} onChange={e => setNewForm(p => ({ ...p, mobile: e.target.value }))} placeholder="+92 300 0000000" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[var(--color-text-primary)]">Role <span className="text-[var(--color-danger)]">*</span></label>
              <select className={inputCls} value={newForm.app_role} onChange={e => setNewForm(p => ({ ...p, app_role: e.target.value }))}>
                {APP_ROLES.map(r => <option key={r} value={r} className="capitalize">{ROLE_CFG[r]?.label || r}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[var(--color-text-primary)]">Department</label>
              <select className={inputCls} value={newForm.department_id} onChange={e => setNewForm(p => ({ ...p, department_id: e.target.value }))}>
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
                className="px-4 h-11 md:h-9 rounded-md bg-[var(--color-accent)] text-white text-sm font-medium hover:bg-[var(--color-accent-hover)] disabled:opacity-50 transition-colors">
                {loading ? 'Saving…' : 'Save Changes'}
              </button>
            </>
          }>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2 space-y-1.5">
              <label className="text-sm font-medium text-[var(--color-text-primary)]">Full Name</label>
              <input className={inputCls} value={editForm.full_name} onChange={e => setEditForm(p => ({ ...p, full_name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[var(--color-text-primary)]">Employee Code</label>
              <input className={inputCls} value={editForm.employee_code} onChange={e => setEditForm(p => ({ ...p, employee_code: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[var(--color-text-primary)]">Mobile</label>
              <input className={inputCls} value={editForm.mobile} onChange={e => setEditForm(p => ({ ...p, mobile: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[var(--color-text-primary)]">Role</label>
              <select className={inputCls} value={editForm.app_role} onChange={e => setEditForm(p => ({ ...p, app_role: e.target.value }))}>
                {APP_ROLES.map(r => <option key={r} value={r}>{ROLE_CFG[r]?.label || r}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[var(--color-text-primary)]">Department</label>
              <select className={inputCls} value={editForm.department_id} onChange={e => setEditForm(p => ({ ...p, department_id: e.target.value }))}>
                <option value="">No department</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
