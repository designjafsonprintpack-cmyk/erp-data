import type { ReactNode } from 'react'
import { cn } from '@/lib/utils/cn'

interface PageHeaderProps {
  title: ReactNode
  subtitle?: ReactNode
  /** Buttons. Stack full-width on mobile so they clear the 44px minimum. */
  actions?: ReactNode
  className?: string
}

export function PageHeader({ title, subtitle, actions, className }: PageHeaderProps) {
  return (
    <div className={cn('flex flex-col md:flex-row md:items-center md:justify-between gap-3', className)}>
      <div className="min-w-0">
        <h1 className="text-xl md:text-2xl font-bold text-[var(--color-text-primary)] truncate">{title}</h1>
        {subtitle && (
          <p className="text-sm text-[var(--color-text-muted)] mt-0.5">{subtitle}</p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2 flex-shrink-0 [&>*]:flex-1 md:[&>*]:flex-none">
          {actions}
        </div>
      )}
    </div>
  )
}

export default PageHeader
