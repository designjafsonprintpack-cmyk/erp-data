'use client'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils/cn'
import { useCanSeeMoney, type MoneyScope } from '@/modules/settings/permissions/hooks/usePermission'

/**
 * Hides rupee amounts from anyone without `money::view` (migration 119).
 *
 * WHY A WRAPPER AND NOT A <Money value={n} /> COMPONENT
 *   Amounts in this codebase are not one shape. They are inline JSX text, they
 *   are template strings inside export columns, they are `<input>` fields on
 *   the quotation and PO forms, they are whole stat cards and whole table
 *   columns. A per-number component would have fitted maybe half of them and
 *   would have left the other half — including the Excel export, which is where
 *   a leak actually matters — untouched.
 *
 *   So the gate wraps a REGION: a cell, a column, a totals block, a form field.
 *   Wrapping is also what makes hiding a rate INPUT work: someone who may not
 *   see a rate must not be able to type one either.
 *
 * TWO SHAPES
 *   <MoneyGate>            masks — renders `•••` in place of the amount.
 *                          Use where the row still has to line up: a table
 *                          cell, a total, anything in a grid.
 *   <MoneyGate hide>       removes — renders nothing at all.
 *                          Use for whole cards, columns, and rate inputs,
 *                          where a `•••` would just be a puzzle.
 *
 * NOT a security boundary. The figure is still in the API response; this stops
 * it being drawn. See useCanSeeMoney for why that is the deliberate scope.
 */
interface MoneyGateProps {
  children: ReactNode
  /**
   * WHICH money this is (migration 120). Defaults to 'cost' — the strictest —
   * so a money site nobody remembered to scope stays hidden from Sales and
   * Purchase rather than being accidentally shown to them. Same reasoning as
   * the hook failing closed: the safe direction is tighter, not looser.
   *
   *   'sales'    quotation / sales-order prices, and the estimator's calculator
   *   'purchase' PO rates, board unit cost, Stock In rate
   *   'cost'     job costing, margin, invoices, ledgers, Reports
   */
  scope?: MoneyScope
  /** Render nothing instead of a mask when the user may not see money. */
  hide?: boolean
  /** Replaces the default `•••` mask. Ignored when `hide` is set. */
  fallback?: ReactNode
  className?: string
}

export function MoneyGate({ children, hide, fallback, className, scope = 'cost' }: MoneyGateProps) {
  const { canSeeMoney } = useCanSeeMoney(scope)

  if (canSeeMoney) return <>{children}</>
  if (hide) return null
  if (fallback !== undefined) return <>{fallback}</>

  return (
    <span
      title="Restricted — you do not have permission to see amounts"
      aria-label="Amount hidden"
      className={cn('tabular-nums text-[var(--color-text-muted)] select-none', className)}
    >
      •••
    </span>
  )
}

/**
 * The same decision as a boolean, for the places a wrapper cannot reach:
 * building an export row, a `title` attribute, a chart series, a string sent to
 * a toast. Fails closed exactly as MoneyGate does, and defaults to the same
 * strictest scope.
 */
export function useMoneyVisible(scope: MoneyScope = 'cost'): boolean {
  return useCanSeeMoney(scope).canSeeMoney
}

/** Mask a value inside a string that is being built, not rendered. */
export const MONEY_MASK = '•••'

export function maskMoney<T>(canSee: boolean, value: T): T | string {
  return canSee ? value : MONEY_MASK
}

export default MoneyGate
