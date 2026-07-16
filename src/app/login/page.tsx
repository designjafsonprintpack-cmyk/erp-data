import { Suspense } from 'react'
import LoginForm from './LoginForm'
import { ToastContainer } from '@/components/ui/Toast'

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-[var(--color-accent)] flex items-center justify-center mb-4 shadow-lg shadow-[var(--color-accent)]/20">
            <span className="text-white text-xl font-bold">JP</span>
          </div>
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Jafson Print ERP</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">Sign in to your account</p>
        </div>
        <Suspense fallback={<div className="h-64 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] animate-pulse" />}>
          <LoginForm />
        </Suspense>
        <p className="text-center text-xs text-[var(--color-text-muted)] mt-6">
          Jafson Print Pack © {new Date().getFullYear()}
        </p>
      </div>
      <ToastContainer />
    </div>
  )
}
