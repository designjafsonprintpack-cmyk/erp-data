'use client'
import { useState } from 'react'
import { KeyRound, Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { Modal } from '@/components/ui/Modal'
import { toast } from '@/components/ui/Toast'

const inputCls = 'w-full h-11 md:h-9 px-3 pr-11 rounded-md border text-sm bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border-[var(--color-border)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] transition-colors'

const MIN_LENGTH = 8

/**
 * Lets any signed-in user change their own password, from the account menu.
 * Posts to /api/v1/auth/change-password, which re-verifies the current password
 * server-side before changing anything.
 */
export function ChangePasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [loading, setLoading] = useState(false)

  const close = () => {
    setCurrent(''); setNext(''); setConfirm(''); setShow(false)
    onClose()
  }

  // Checked here for an instant message, and again on the server — the client
  // check is convenience, the server check is the rule.
  const problem =
    !current ? 'Enter your current password'
    : next.length < MIN_LENGTH ? `New password must be at least ${MIN_LENGTH} characters`
    : next !== confirm ? 'The two new passwords do not match'
    : next === current ? 'The new password must be different from the current one'
    : null

  const submit = async () => {
    if (problem) { toast.error(problem); return }
    setLoading(true)
    try {
      const res = await fetch('/api/v1/auth/change-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_password: current, new_password: next }),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
      toast.success('Password changed')
      close()
    } catch (e: any) { toast.error(e.message || 'Could not change password') }
    finally { setLoading(false) }
  }

  const field = (
    id: string, label: string, value: string, onChange: (v: string) => void, placeholder: string
  ) => (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium text-[var(--color-text-primary)]">{label}</label>
      <input
        id={id}
        type={show ? 'text' : 'password'}
        className={inputCls}
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && !problem && !loading) submit() }}
        placeholder={placeholder}
        autoComplete={id === 'cpw-current' ? 'current-password' : 'new-password'}
      />
    </div>
  )

  return (
    <Modal open={open} onClose={close} title="Change Password" size="md"
      footer={
        <>
          <button onClick={close} className="px-4 h-11 md:h-9 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">Cancel</button>
          <button onClick={submit} disabled={loading || !!problem}
            className="flex items-center gap-2 px-4 h-11 md:h-9 rounded-md bg-[var(--color-accent)] text-[var(--color-on-accent)] text-sm font-medium hover:bg-[var(--color-accent-hover)] disabled:opacity-50 transition-colors">
            <KeyRound size={14} /> {loading ? 'Saving…' : 'Change Password'}
          </button>
        </>
      }>
      <div className="space-y-4">
        <div className="flex justify-end">
          <button type="button" onClick={() => setShow(v => !v)}
            className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors">
            {show ? <EyeOff size={13} /> : <Eye size={13} />} {show ? 'Hide' : 'Show'} passwords
          </button>
        </div>

        {field('cpw-current', 'Current Password', current, setCurrent, 'Your password right now')}
        {field('cpw-new',     'New Password',     next,    setNext,    `Minimum ${MIN_LENGTH} characters`)}
        {field('cpw-confirm', 'Confirm New Password', confirm, setConfirm, 'Type it again')}

        {problem && (current || next || confirm) && (
          <p className={cn('text-xs text-[var(--color-danger)]')}>{problem}</p>
        )}

        <div className="rounded-lg bg-[var(--color-bg-elevated)] border border-[var(--color-border)] p-3 text-xs text-[var(--color-text-muted)]">
          Forgotten your current password? A superadmin can set a new one for you from
          Settings → Users.
        </div>
      </div>
    </Modal>
  )
}

export default ChangePasswordModal
