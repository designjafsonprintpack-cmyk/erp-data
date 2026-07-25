import type { ReactNode } from 'react'
import { cn } from '@/lib/utils/cn'

type Cols = 1 | 2 | 3 | 4 | 6

interface FormGridProps {
  children: ReactNode
  /** Columns per tier. Defaults to 1 / 2 / declared-desktop. */
  cols?: { base?: Cols; md?: Cols; xl?: Cols }
  gap?: 'sm' | 'md' | 'lg'
  className?: string
}

/**
 * Tailwind's JIT scans source text, so every class it might emit has to appear
 * literally somewhere. These lookups exist for that reason — building
 * `md:grid-cols-${n}` at runtime silently produces nothing.
 */
const BASE: Record<Cols, string> = {
  1: 'grid-cols-1', 2: 'grid-cols-2', 3: 'grid-cols-3', 4: 'grid-cols-4', 6: 'grid-cols-6',
}
const MD: Record<Cols, string> = {
  1: 'md:grid-cols-1', 2: 'md:grid-cols-2', 3: 'md:grid-cols-3', 4: 'md:grid-cols-4', 6: 'md:grid-cols-6',
}
const XL: Record<Cols, string> = {
  1: 'xl:grid-cols-1', 2: 'xl:grid-cols-2', 3: 'xl:grid-cols-3', 4: 'xl:grid-cols-4', 6: 'xl:grid-cols-6',
}
const GAP = { sm: 'gap-2', md: 'gap-4', lg: 'gap-6' }

/**
 * Replaces the ~173 hardcoded `grid grid-cols-3` / `grid-cols-4` field rows.
 *
 * Those collapse rather than reflow: a 4-column row on a 375px screen gives
 * each field about 72px — narrower than its own label — so labels wrap to
 * three lines and the inputs become unusable stubs.
 *
 * Default is 1 column on mobile, 2 on tablet, and whatever the desktop layout
 * declared at xl, so adopting it is usually a one-line change:
 *
 *   <div className="grid grid-cols-4 gap-4">  →  <FormGrid cols={{ xl: 4 }}>
 *
 * The desktop result at 1280px+ is identical to what was there before.
 */
export function FormGrid({ children, cols, gap = 'md', className }: FormGridProps) {
  const base = cols?.base ?? 1
  const md = cols?.md ?? 2
  const xl = cols?.xl ?? md

  return (
    <div className={cn('grid', BASE[base], MD[md], XL[xl], GAP[gap], className)}>
      {children}
    </div>
  )
}

interface FormFieldProps {
  children: ReactNode
  /** Make a field span the full row — long text, addresses, notes. */
  full?: boolean
  className?: string
}

/** Optional wrapper for a field that should occupy the whole row. */
export function FormField({ children, full, className }: FormFieldProps) {
  return (
    <div className={cn('min-w-0', full && 'col-span-full', className)}>
      {children}
    </div>
  )
}

export default FormGrid
