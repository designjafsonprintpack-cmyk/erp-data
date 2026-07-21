import { z } from 'zod'

// `entity` is checked against a fixed allowlist in the route itself
// (ENTITIES) — this just ensures a string was actually sent.
export const customReportSchema = z.object({
  entity: z.string().trim().min(1, 'entity is required'),
  date_from: z.string().optional().nullable(),
  date_to: z.string().optional().nullable(),
  status: z.string().optional().nullable(),
})

// Mirrors the route's own existing manual check — report_type, frequency,
// and at least one recipient are all required.
export const reportScheduleSchema = z.object({
  report_type: z.string().trim().min(1, 'report_type is required'),
  frequency: z.string().trim().min(1, 'frequency is required'),
  recipients: z.array(z.string()).min(1, 'At least one recipient is required'),
})
