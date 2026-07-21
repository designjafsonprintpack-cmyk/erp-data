import { z } from 'zod'

export const notificationUpdateSchema = z.object({
  all: z.boolean().optional(),
  id: z.string().uuid().optional(),
})
