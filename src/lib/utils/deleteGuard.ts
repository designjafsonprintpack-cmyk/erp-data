/**
 * "What is attached to this record?" — checked before a delete, so nobody
 * removes a customer or a vendor without being told what hangs off it.
 *
 * WHY THIS EXISTS
 *   On 2026-07-31 the customer "Ags Molasses" was soft-deleted from the UI. It
 *   had **4 jobs** (JOB-2025-00406..409). Nothing warned, nothing blocked, and
 *   the Customers screen simply lost a row. The jobs survived — a customer
 *   soft-delete does not cascade — but they were left pointing at a record no
 *   screen would show, and the only way back was a hand-written database
 *   update.
 *
 * WARN, DON'T BLOCK — and why that is safe HERE
 *   CLAUDE.md's standing precedent is "warn, record, don't block" (board stock
 *   shortfall). A hard block would be wrong: a customer entered by mistake,
 *   with a job also entered by mistake, has to be removable.
 *
 *   The warning is only safe because delete is recoverable — these routes
 *   soft-delete, and Customers now has a Deleted tab with Restore. Do not
 *   reuse this helper to guard a HARD delete without adding a way back first.
 *
 * COUNT IN THE DATABASE, NEVER IN JAVASCRIPT
 *   Every check is `{ count: 'exact', head: true }`. Totalling a fetched array
 *   silently caps at PostgREST's 1000 rows — CLAUDE.md records that biting
 *   three times. A customer with 1,200 jobs must report 1,200.
 */
import { NextResponse } from 'next/server'

export interface DependentCheck {
  /** Table holding the reference, e.g. 'jobs'. */
  table: string
  /** Column pointing back at the record being deleted, e.g. 'customer_id'. */
  column: string
  /** What the user calls these, e.g. 'job'. Pluralised with a bare "s". */
  label: string
  /**
   * Skip rows already soft-deleted. Off by default because most child tables
   * in this schema have no `deleted_at` at all (CLAUDE.md §3) and asking for a
   * column that does not exist fails the whole count.
   */
  excludeDeleted?: boolean
}

export interface DependentCount {
  label: string
  count: number
}

/** Customers. Ordered by how much they matter when read out to a person. */
export const CUSTOMER_DEPENDENTS: DependentCheck[] = [
  { table: 'jobs',            column: 'customer_id', label: 'job' },
  { table: 'quotations',      column: 'customer_id', label: 'quotation' },
  { table: 'sales_orders',    column: 'customer_id', label: 'sales order' },
  { table: 'invoices',        column: 'customer_id', label: 'invoice' },
  { table: 'dispatch_orders', column: 'customer_id', label: 'dispatch' },
]

/** Vendors. Board stock carries the vendor since 113, hence the last two. */
export const VENDOR_DEPENDENTS: DependentCheck[] = [
  { table: 'purchase_orders',     column: 'vendor_id', label: 'purchase order' },
  { table: 'board_inventory',     column: 'vendor_id', label: 'board stock item' },
  { table: 'board_inventory_lots', column: 'vendor_id', label: 'board lot' },
]

/**
 * Runs every check concurrently and returns only the non-zero ones.
 *
 * A check that errors is skipped, not fatal — a guard must never be the reason
 * a legitimate delete fails. The error is logged so a wrong table or column
 * name is visible rather than silently reporting "nothing attached".
 */
export async function countDependents(
  supabase: any,
  recordId: string,
  checks: DependentCheck[],
): Promise<DependentCount[]> {
  const results = await Promise.all(
    checks.map(async (chk) => {
      let q = supabase
        .from(chk.table as any)
        .select('*', { count: 'exact', head: true })
        .eq(chk.column, recordId)
      if (chk.excludeDeleted) q = q.is('deleted_at', null)

      const { count, error } = await q
      if (error) {
        console.error(`[deleteGuard] ${chk.table}.${chk.column} count failed:`, error.message)
        return { label: chk.label, count: 0 }
      }
      return { label: chk.label, count: count ?? 0 }
    }),
  )
  return results.filter(r => r.count > 0)
}

/** "4 jobs and 2 invoices" — the phrase dropped into the warning. */
export function describeDependents(deps: DependentCount[]): string {
  const parts = deps.map(d => `${d.count} ${d.label}${d.count === 1 ? '' : 's'}`)
  if (parts.length === 1) return parts[0]
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}

/**
 * The 409 a DELETE route returns when something is attached, or null when the
 * record is free to remove. The caller resubmits with `?force=1` to proceed.
 */
export function dependentsResponse(
  deps: DependentCount[],
  noun: string,
): NextResponse | null {
  if (!deps.length) return null
  return NextResponse.json(
    {
      error:
        `This ${noun} has ${describeDependents(deps)} attached. ` +
        `Deleting it hides the ${noun} from every screen; the records themselves stay. ` +
        `Delete anyway?`,
      dependents: deps,
      code: 'HAS_DEPENDENTS',
    },
    { status: 409 },
  )
}

/** Convenience: count + respond. Returns null when nothing is attached. */
export async function guardDelete(
  supabase: any,
  recordId: string,
  checks: DependentCheck[],
  noun: string,
): Promise<NextResponse | null> {
  return dependentsResponse(await countDependents(supabase, recordId, checks), noun)
}

export default guardDelete
