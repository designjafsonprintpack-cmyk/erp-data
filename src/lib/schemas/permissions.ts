import { z } from 'zod'

export const grantPermissionSchema = z.object({
  role_id: z.string().uuid(),
  permission_id: z.string().uuid(),
  grant: z.boolean(),
})
