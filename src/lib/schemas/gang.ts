import { z } from 'zod'

/**
 * Creating a gang run (migration 126).
 *
 * The ups split is REQUIRED per member and never defaulted server-side: the
 * layout is bounded by the die the shop owns, which the ERP has no way to know
 * (`jobs.die_number` is free text). `suggestSplit()` gives the screen a
 * starting point; what reaches this route is what the planner decided.
 */
export const gangMemberSchema = z.object({
  job_id: z.string().uuid('job_id must be a valid id'),
  ups_on_layout: z.coerce.number().int().min(1, 'Each job needs at least 1 up'),
})

export const gangSchema = z.object({
  /** How many ups the DIE holds on this sheet — typed by the planner. */
  layout_ups: z.coerce.number().int().min(2, 'A gang layout needs at least 2 ups'),
  members: z.array(gangMemberSchema).min(2, 'A gang needs at least two jobs'),
  notes: z.string().trim().max(500).optional().nullable(),

  /**
   * Acknowledges the overage. The client has to agree that 10,000 becomes
   * 12,000 BEFORE the Sales Order is rewritten, so the route refuses to
   * proceed without this when any member over-produces. Not a formality: the
   * SO change is what dispatch and invoicing will act on.
   */
  overage_agreed: z.boolean().optional(),
})

export const gangUpdateSchema = z.object({
  notes: z.string().trim().max(500).optional().nullable(),
  status: z.enum(['planned', 'in_progress', 'completed', 'cancelled']).optional(),
})

export default gangSchema
