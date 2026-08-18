import { z } from 'zod'

import { entrySchema } from './entry'

export const sessionStatusSchema = z.enum(['open', 'closed'])

export type SessionStatus = z.infer<typeof sessionStatusSchema>

// ---------- La sesión = el documento ----------

export const sessionSchema = z.object({
  id: z.string(),
  /** El id secreto de la URL pública, ~22 chars. */
  publicId: z.string(),
  projectName: z.string(),
  title: z.string(),
  status: sessionStatusSchema,
  createdAt: z.string(),
  closedAt: z.string().nullable(),
  entries: z.array(entrySchema),
})

export type Session = z.infer<typeof sessionSchema>

export const sessionSummarySchema = z.object({
  publicId: z.string(),
  title: z.string(),
  status: sessionStatusSchema,
  createdAt: z.string(),
  closedAt: z.string().nullable(),
  entryCount: z.number(),
  annotationCount: z.number(),
})

export type SessionSummary = z.infer<typeof sessionSummarySchema>
