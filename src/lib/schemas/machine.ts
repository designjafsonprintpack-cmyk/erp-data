import { z } from 'zod'

// Mirrors machines columns (migration 006) — name, code, and machine_type
// are all NOT NULL.
export const machineSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  code: z.string().trim().min(1, 'Code is required'),
  machine_type: z.string().trim().min(1, 'machine_type is required'),
  capacity_per_hour: z.union([z.string(), z.number()]).optional().nullable(),
  status: z.string().optional(),
  current_operator_id: z.string().uuid().optional().nullable(),
  notes: z.string().optional().nullable(),
})

// PATCH reads `id` out of the body itself (flat /machines endpoint, no
// [id] segment) — declared here so parseBody doesn't strip the field the
// route depends on to target the update. Also closes a real mass-assignment
// gap: the route previously did `.update(fields)` with no allowlist at all.
export const machineUpdateSchema = z.object({
  id: z.string().uuid('id is required'),
  name: z.string().optional(),
  code: z.string().optional(),
  machine_type: z.string().optional(),
  capacity_per_hour: z.union([z.string(), z.number()]).optional().nullable(),
  status: z.string().optional(),
  current_operator_id: z.string().uuid().optional().nullable(),
  notes: z.string().optional().nullable(),
})

export const machineDowntimeSchema = z.object({
  category: z.string().trim().min(1, 'category is required'),
  reason: z.string().optional().nullable(),
})

export const machineMaintenanceSchema = z.object({
  maintenance_type: z.string().trim().min(1, 'maintenance_type is required'),
  status: z.string().optional(),
  scheduled_date: z.string().optional().nullable(),
  completed_date: z.string().optional().nullable(),
  description: z.string().trim().min(1, 'description is required'),
  performed_by: z.string().optional().nullable(),
  cost: z.union([z.string(), z.number()]).optional().nullable(),
  next_due_date: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
})

export const downtimeCloseSchema = z.object({
  resolution_notes: z.string().optional().nullable(),
  new_machine_status: z.string().optional(),
})
