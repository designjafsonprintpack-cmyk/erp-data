import { z } from 'zod'

export const createUserSchema = z.object({
  email: z.string().email('A valid email is required'),
  password: z.string().optional(),
  full_name: z.string().trim().min(1, 'full_name is required'),
  employee_code: z.string().optional().nullable(),
  app_role: z.string().optional(),
  department_id: z.string().uuid().optional().nullable(),
  mobile: z.string().optional().nullable(),
})

// Already explicitly allowlisted in the route itself (if body.x !== undefined
// pattern) — this schema mainly adds type-correctness, not a new allowlist.
export const updateUserSchema = z.object({
  full_name: z.string().optional(),
  employee_code: z.string().optional().nullable(),
  app_role: z.string().optional(),
  department_id: z.string().uuid().optional().nullable(),
  mobile: z.string().optional().nullable(),
  is_active: z.boolean().optional(),
})

// system_settings key->value upsert body — keys are dynamic setting names,
// not a fixed shape, so this is a record schema rather than an object one.
// Still rejects non-object bodies and non-primitive values (nested objects/
// arrays), which `String(value)` would previously have silently turned
// into the literal string "[object Object]" instead of failing loudly.
export const systemSettingsSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean(), z.null()])
)
