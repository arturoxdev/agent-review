import { z } from 'zod'

export const projectSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** "pk_live_…" */
  publicKey: z.string(),
  createdAt: z.string(),
  sessionCount: z.number(),
})

export type Project = z.infer<typeof projectSchema>
