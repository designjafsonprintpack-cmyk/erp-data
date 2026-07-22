import { Suspense } from 'react'
import LoginForm from './LoginForm'
import { ToastContainer } from '@/components/ui/Toast'
import { getPublicCompanyInfo } from '@/lib/utils/getPublicCompanyInfo'

// Without this, Next.js statically prerenders this page at build time (it has
// no cookies()/headers() call to auto-detect dynamic rendering), which would
// freeze the company name/logo fetched below as of the last deploy instead
// of reflecting live Company Settings changes.
export const dynamic = 'force-dynamic'

export default async function LoginPage() {
  const company = await getPublicCompanyInfo()
  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          {company.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element -- external Supabase Storage URL, not a local asset
            <img src={company.logo_url} alt={company.name} className="w-12 h-12 rounded-xl object-contain mb-4 shadow-lg shadow-[var(--color-accent)]/20" />
          ) : (
            <div className="w-12 h-12 rounded-xl bg-[var(--color-accent)] flex items-center justify-center mb-4 shadow-lg shadow-[var(--color-accent)]/20">
              <span className="text-white text-xl font-bold">JP</span>
            </div>
          )}
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">{company.name}</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">Sign in to your account</p>
        </div>
        <Suspense fallback={<div className="h-64 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] animate-pulse" />}>
          <LoginForm />
        </Suspense>
        <p className="text-center text-xs text-[var(--color-text-muted)] mt-6">
          {company.name} © {new Date().getFullYear()}
        </p>
      </div>
      <ToastContainer />
    </div>
  )
}
