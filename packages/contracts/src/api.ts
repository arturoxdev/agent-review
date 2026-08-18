import { z } from 'zod'

import { annotationSchema } from './annotation'
import { entrySchema, snapshotStatusSchema, viewportSchema } from './entry'

// ---------- §4.1 · Pipeline de captura ----------

export const createSessionRequestSchema = z.object({
  title: z.string().optional(),
  url: z.string(),
  pageTitle: z.string(),
  viewport: viewportSchema,
  annotations: z.array(annotationSchema),
})

export type CreateSessionRequest = z.infer<typeof createSessionRequestSchema>

/** Idéntico a CreateSessionRequest: las pantallas siguientes mandan lo mismo. */
export const createEntryRequestSchema = createSessionRequestSchema

export type CreateEntryRequest = z.infer<typeof createEntryRequestSchema>

export const createEntryResponseSchema = z.object({
  publicId: z.string(),
  /** snapshotStatus: 'pending', snapshotUrl y thumbnailUrl ya asignados (UUID). */
  entry: entrySchema,
  /** PUT, 15 min. */
  snapshotUploadUrl: z.string(),
  thumbnailUploadUrl: z.string(),
})

export type CreateEntryResponse = z.infer<typeof createEntryResponseSchema>

export const patchEntryRequestSchema = z.object({
  snapshotStatus: snapshotStatusSchema.exclude(['pending']),
})

export type PatchEntryRequest = z.infer<typeof patchEntryRequestSchema>
