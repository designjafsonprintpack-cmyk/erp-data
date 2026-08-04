export type ArtworkStatus =
  | 'draft' | 'internal_review' | 'waiting_customer_approval'
  | 'changes_requested' | 'approved' | 'rejected' | 'archived'

export const ARTWORK_STATUS_CONFIG: Record<ArtworkStatus, { label: string; color: string; dot: string }> = {
  draft:                     { label: 'Draft',                     color: 'text-[var(--color-text-muted)] bg-[var(--color-bg-elevated)] border-[var(--color-border)]',           dot: 'bg-[var(--color-text-muted)]' },
  internal_review:           { label: 'Internal Review',           color: 'text-[var(--color-accent)] bg-[color:color-mix(in_srgb,var(--color-accent)_10%,transparent)] border-[color:color-mix(in_srgb,var(--color-accent)_30%,transparent)]',            dot: 'bg-[var(--color-accent)]' },
  waiting_customer_approval: { label: 'Waiting Customer Approval', color: 'text-[var(--color-warning)] bg-[color:color-mix(in_srgb,var(--color-warning)_10%,transparent)] border-[color:color-mix(in_srgb,var(--color-warning)_30%,transparent)]',         dot: 'bg-[var(--color-warning)]' },
  changes_requested:         { label: 'Changes Requested',         color: 'text-[var(--color-danger)] bg-[color:color-mix(in_srgb,var(--color-danger)_10%,transparent)] border-[color:color-mix(in_srgb,var(--color-danger)_30%,transparent)]',            dot: 'bg-[var(--color-danger)]' },
  approved:                  { label: 'Approved',                  color: 'text-[var(--color-success)] bg-[color:color-mix(in_srgb,var(--color-success)_10%,transparent)] border-[color:color-mix(in_srgb,var(--color-success)_30%,transparent)]',         dot: 'bg-[var(--color-success)]' },
  rejected:                  { label: 'Rejected',                  color: 'text-[var(--color-danger)] bg-[color:color-mix(in_srgb,var(--color-danger)_10%,transparent)] border-[color:color-mix(in_srgb,var(--color-danger)_30%,transparent)]',            dot: 'bg-[var(--color-danger)]' },
  archived:                  { label: 'Archived',                  color: 'text-[var(--color-text-muted)] bg-[var(--color-bg-elevated)] border-[var(--color-border)]',         dot: 'bg-[var(--color-text-muted)]' },
}

/**
 * Which statuses a version can move to FROM its current status — used to build
 * the "Move to…" menu. The server does not enforce this graph (any authorized
 * user can PATCH any valid status); only the UI does.
 *
 * FLATTENED, because the ladder it modelled no longer exists.
 *   It used to walk draft → internal review → waiting customer approval →
 *   approved, which mirrored the customer approval LINK. That link is retired:
 *   the customer approves on WhatsApp and staff upload the file that was
 *   already signed off, so a new row lands `approved` and never passes through
 *   the middle rungs.
 *
 *   Leaving the ladder in place stranded every row uploaded before that change.
 *   A `draft` row could only reach Approved through THREE separate status
 *   changes, and the workflow's artwork gate refuses to complete the Artwork
 *   stage until it gets there — which is exactly the wall Mehboob hit on the
 *   jobs already in flight ("no approved artwork version exists for this job
 *   yet"). The four legacy statuses are kept so those old rows still render
 *   with their real history; they simply can't be moved INTO any more.
 *
 * Two moves are all that are left, and both are real:
 *   → approved   the only forward move. One click to correct a legacy row.
 *   → archived   the undo for a wrong file.
 */
const LEGACY_ROW_MOVES: ArtworkStatus[] = ['approved', 'archived']

export const ARTWORK_STATUS_TRANSITIONS: Record<ArtworkStatus, ArtworkStatus[]> = {
  draft:                     LEGACY_ROW_MOVES,
  internal_review:           LEGACY_ROW_MOVES,
  waiting_customer_approval: LEGACY_ROW_MOVES,
  changes_requested:         LEGACY_ROW_MOVES,
  rejected:                  LEGACY_ROW_MOVES,
  // An approved row can only be taken back out; re-approving it is a no-op.
  approved:                  ['archived'],
  // Archived is the end. Re-approving means uploading the file again, which
  // is one action and leaves a correct audit trail.
  archived:                  [],
}
