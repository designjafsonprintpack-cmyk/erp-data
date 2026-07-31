/**
 * One answer to "does this name already exist?", used by every route that
 * creates or renames a named record.
 *
 * WHY THIS EXISTS
 *   "Ags Molasses" and "AGS Molasses" were both live in `customers` at the
 *   same time — the same company entered twice, told apart only by capital
 *   letters. Trying to clean that up is what led to the real customer (and its
 *   4 jobs) being soft-deleted by hand on 2026-07-31.
 *
 *   The customers route DID have duplicate detection, but only on NTN and
 *   phone/mobile — never on the name. The duplicate row had all three blank
 *   (`''`), so `body.ntn?.trim()` was falsy and **not one check ran**. Every
 *   other named table — vendors, board/box/lamination/foil/coating types,
 *   units, machines, departments — had no check of any kind.
 *
 * WHY NAME IS A HARD BLOCK, UNLIKE PHONE AND NTN
 *   A phone number can legitimately be shared: two branches on one landline,
 *   an agent handling several accounts. That is why the NTN/phone check is a
 *   409 the caller can override with `force`.
 *
 *   An identical name cannot. Once two rows read "AGS Molasses" in a dropdown,
 *   no human can tell which is which, jobs land on whichever was clicked, and
 *   the customer's history is split in two with no way to say which half is
 *   right. The fix is free and makes the dropdown usable: give one of them a
 *   distinguishing name ("AGS Molasses — Kasur"). So `force` is deliberately
 *   NOT honoured here.
 *
 * SOFT-DELETED ROWS ARE INCLUDED ON PURPOSE
 *   A deleted row still holds the name, the code and all its history. Telling
 *   someone "that name exists but is deleted — restore it" is the right answer;
 *   letting them create a second one orphans the first for good. Callers
 *   surface this with `hit.deleted_at`.
 *
 * COMPARISON RULE
 *   Trim, collapse runs of whitespace to one space, lowercase. So
 *   "  AGS   Molasses " and "ags molasses" are the same name.
 *   Deliberately NOT fuzzy: "AGS Molasses" vs "AGS Molasses Pvt Ltd" are left
 *   alone, because a near-match block would stop legitimate entries and there
 *   is no safe threshold to guess at.
 */
import { NextResponse } from 'next/server'

/** Trim → collapse whitespace → lowercase. The single comparison rule. */
export function normalizeName(value: string | null | undefined): string {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
}

/**
 * `%` and `_` are LIKE wildcards. Without escaping them, a customer literally
 * named "50% Board" would match far more than itself. PostgREST binds the
 * value, so only the wildcards need handling — not quoting.
 */
function escapeLike(value: string): string {
  return value.replace(/([\\%_])/g, '\\$1')
}

export interface DuplicateNameHit {
  id: string
  name: string
  code: string | null
  deleted_at: string | null
  is_active: boolean | null
}

export interface FindDuplicateNameOptions {
  /** Table to search, e.g. 'customers'. */
  table: string
  companyId: string
  /** The name being created or saved. */
  name: string | null | undefined
  /** Column holding the name. Defaults to 'name'. */
  column?: string
  /** Code column to quote back in the message, e.g. 'customer_code'. */
  codeColumn?: string
  /** On rename, the row being edited must not count as its own duplicate. */
  excludeId?: string | null
}

/**
 * Returns every row whose name normalizes to the same string — including
 * soft-deleted ones. Empty array means the name is free.
 *
 * A query error returns [] rather than throwing: a duplicate check must never
 * be the reason a save fails. It is a guard, not the operation.
 */
export async function findDuplicateName(
  supabase: any,
  opts: FindDuplicateNameOptions,
): Promise<DuplicateNameHit[]> {
  const wanted = normalizeName(opts.name)
  if (!wanted) return []

  const column = opts.column ?? 'name'
  const codeColumn = opts.codeColumn ?? null
  const select = ['id', column, 'deleted_at', 'is_active', ...(codeColumn ? [codeColumn] : [])].join(',')

  // ilike narrows to candidates; the JS normalize below is what actually
  // decides. The pattern puts a wildcard BETWEEN each word rather than wrapping
  // the whole string, because ilike is case-insensitive but NOT
  // whitespace-insensitive: matching on the trimmed value as one piece meant
  // "AGS   Molasses" (two spaces) never found the stored "AGS Molasses" and
  // sailed straight past the check. Proved by a failing assertion, not guessed.
  //
  // The looser pattern also matches names with extra words in between
  // ("AGS Big Molasses") — harmless, because the exact normalize-compare
  // immediately discards them. Over-fetching candidates is safe; missing one
  // is not.
  const pattern = `%${wanted.split(' ').map(escapeLike).join('%')}%`
  const { data, error } = await supabase
    .from(opts.table as any)
    .select(select)
    .eq('company_id', opts.companyId)
    .ilike(column, pattern)
    .limit(50)

  // Checked, not swallowed into a silent pass — but a failure here must not
  // block the save, so it is logged and treated as "no duplicate found".
  if (error) {
    console.error(`[duplicateName] ${opts.table}.${column} check failed:`, error.message)
    return []
  }

  return ((data ?? []) as any[])
    .filter(row => row.id !== opts.excludeId)
    .filter(row => normalizeName(row[column]) === wanted)
    .map(row => ({
      id: row.id,
      name: row[column],
      code: codeColumn ? (row[codeColumn] ?? null) : null,
      deleted_at: row.deleted_at ?? null,
      is_active: row.is_active ?? null,
    }))
}

/**
 * Turns hits into the 409 the route should return, or null when the name is
 * free. `noun` is what the user calls the thing — "customer", "vendor",
 * "board type" — and appears verbatim in the message.
 */
export function duplicateNameResponse(
  hits: DuplicateNameHit[],
  noun: string,
): NextResponse | null {
  if (!hits.length) return null

  const hit = hits[0]
  const label = hit.code ? `${hit.name} (${hit.code})` : hit.name

  const message = hit.deleted_at
    ? `A deleted ${noun} named "${label}" already exists. Restore it instead of creating a new one.`
    : `A ${noun} named "${label}" already exists. Use a different name — capital letters and extra spaces do not make it a different ${noun}.`

  return NextResponse.json(
    {
      error: message,
      // `duplicate_of` is what a form uses to offer "Open it" / "Restore it".
      duplicate_of: hit,
      duplicates: hits,
      // Distinguishes this from the phone/NTN warning, which IS overridable.
      code: hit.deleted_at ? 'DUPLICATE_NAME_DELETED' : 'DUPLICATE_NAME',
    },
    { status: 409 },
  )
}

/** Convenience: find + respond in one call. Returns null when the name is free. */
export async function guardDuplicateName(
  supabase: any,
  noun: string,
  opts: FindDuplicateNameOptions,
): Promise<NextResponse | null> {
  return duplicateNameResponse(await findDuplicateName(supabase, opts), noun)
}

export default guardDuplicateName
