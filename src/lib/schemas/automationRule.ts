import { z } from 'zod'

// Mirrors automation_rules columns (migration 079). config shape depends on
// rule_type — validated loosely here (any object) since the 3 rule types
// have different needs; the route/evaluator interpret it per type.
export const automationRuleUpsertSchema = z.object({
  rule_type: z.enum(['job_on_hold_duration', 'invoice_overdue', 'new_customer']),
  name: z.string().trim().min(1, 'Name is required'),
  is_active: z.boolean().optional(),
  config: z.record(z.string(), z.any()).optional(),
})
