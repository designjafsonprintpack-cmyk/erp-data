'use client'
import { useState, type FormEvent } from 'react'
import { useSearchParams } from 'next/navigation'
import { Eye, EyeOff, LogIn } from 'lucide-react'
import { signIn } from '@/modules/auth/services/authService'
import { cn } from '@/lib/utils/cn'

export default function LoginForm() {
  const searchParams = useSearchParams()
  const redirect = searchParams.get('redirect') || '/dashboard'
  const idleTimeout = searchParams.get('reason') === 'idle'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!email || !password) { setError('Please fill in all fields.'); return }
    setLoading(true)
    setError('')
    try {
      await signIn({ email, password })
      // Full navigation (not router.push) — the session was established via
      // a server-side fetch() call, not the browser Supabase client's own
      // signInWithPassword, so the browser client's in-memory auth state
      // doesn't know about it yet. A hard navigation re-reads everything
      // from the now-set cookies instead of relying on client-side state
      // that was never told a login happened.
      window.location.href = redirect
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid email or password.')
    } finally {
      setLoading(false)
    }
  }

  const inputCls = cn(
    'w-full h-10 px-3 rounded-md border text-sm',
    'bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)]',
    'border-[var(--color-border)] placeholder:text-[var(--color-text-muted)]',
    'focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)]',
    'transition-colors duration-150'
  )

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-6 shadow-2xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        {idleTimeout && !error && (
          <div className="rounded-md bg-[var(--color-warning)]/10 border border-[var(--color-warning)]/30 px-3 py-2">
            <p className="text-sm text-[var(--color-warning)]">You were signed out due to inactivity. Please sign in again.</p>
          </div>
        )}
        {error && (
          <div className="rounded-md bg-[var(--color-danger)]/10 border border-[var(--color-danger)]/30 px-3 py-2">
            <p className="text-sm text-[var(--color-danger)]">{error}</p>
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-[var(--color-text-primary)]">Email address</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" autoComplete="email" className={inputCls} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-[var(--color-text-primary)]">Password</label>
          <div className="relative">
            <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter your password" autoComplete="current-password" className={cn(inputCls, 'pr-10')} />
            <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]">
              {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </div>
        <button type="submit" disabled={loading} className={cn(
          'w-full h-10 flex items-center justify-center gap-2 rounded-md text-sm font-medium',
          'bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)]',
          'transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed'
        )}>
          {loading ? (
            <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : <LogIn size={16} />}
          {loading ? 'Signing in…' : 'Sign In'}
        </button>
      </form>
    </div>
  )
}
