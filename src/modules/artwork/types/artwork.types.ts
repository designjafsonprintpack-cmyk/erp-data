export type ArtworkStatus =
  | 'draft' | 'internal_review' | 'waiting_customer_approval'
  | 'changes_requested' | 'approved' | 'rejected' | 'archived'

export const ARTWORK_STATUS_CONFIG: Record<ArtworkStatus, { label: string; color: string; dot: string }> = {
  draft:                     { label: 'Draft',                     color: 'text-[var(--color-text-muted)] bg-[var(--color-bg-elevated)] border-[var(--color-border)]',           dot: 'bg-[var(--color-text-muted)]' },
  internal_review:           { label: 'Internal Review',           color: 'text-[var(--color-accent)] bg-[var(--color-accent)]/10 border-[var(--color-accent)]/30',            dot: 'bg-[var(--color-accent)]' },
  waiting_customer_approval: { label: 'Waiting Customer Approval', color: 'text-[var(--color-warning)] bg-[var(--color-warning)]/10 border-[var(--color-warning)]/30',         dot: 'bg-[var(--color-warning)]' },
  changes_requested:         { label: 'Changes Requested',         color: 'text-[var(--color-danger)] bg-[var(--color-danger)]/10 border-[var(--color-danger)]/30',            dot: 'bg-[var(--color-danger)]' },
  approved:                  { label: 'Approved',                  color: 'text-[var(--color-success)] bg-[var(--color-success)]/10 border-[var(--color-success)]/30',         dot: 'bg-[var(--color-success)]' },
  rejected:                  { label: 'Rejected',                  color: 'text-[var(--color-danger)] bg-[var(--color-danger)]/10 border-[var(--color-danger)]/30',            dot: 'bg-[var(--color-danger)]' },
  archived:                  { label: 'Archived',                  color: 'text-[var(--color-text-muted)] bg-[var(--color-bg-elevated)] border-[var(--color-border)]',         dot: 'bg-[var(--color-text-muted)]' },
}

// Which statuses a version can move to FROM its current status — used to
// build the action menu so the UI never offers an invalid/nonsensical jump
// (e.g. straight from Draft to Archived). The server doesn't enforce this
// transition graph in Phase 1 (any authorized user can PATCH any valid
// status), only the UI does — worth tightening server-side in a later
// phase once the full approval workflow (with customer-driven transitions)
// is in place and the full set of legitimate transitions is finalized.
export const ARTWORK_STATUS_TRANSITIONS: Record<ArtworkStatus, ArtworkStatus[]> = {
  draft:                     ['internal_review', 'archived'],
  internal_review:           ['waiting_customer_approval', 'draft', 'archived'],
  waiting_customer_approval: ['approved', 'rejected', 'changes_requested'],
  changes_requested:         ['draft', 'internal_review'],
  approved:                  ['archived'],
  rejected:                  ['draft', 'archived'],
  archived:                  [],
}
