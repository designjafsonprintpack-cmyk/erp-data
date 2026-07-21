import { z } from 'zod'

// Mirrors webhook_endpoints columns (migration 077). event_types is an
// array of plain strings, not a DB enum, so new event names can be added
// later without a migration — the schema here just requires at least one.
export const webhookEndpointSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  url: z.string().trim().url('Must be a valid URL'),
  event_types: z.array(z.string()).min(1, 'Select at least one event'),
  is_active: z.boolean().optional(),
})

export const webhookEndpointUpdateSchema = z.object({
  id: z.string().uuid('id is required'),
  name: z.string().trim().min(1).optional(),
  url: z.string().trim().url().optional(),
  event_types: z.array(z.string()).min(1).optional(),
  is_active: z.boolean().optional(),
})
