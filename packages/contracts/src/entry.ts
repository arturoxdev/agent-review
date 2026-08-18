import { z } from 'zod'

import { annotationSchema } from './annotation'

export const viewportSchema = z.object({
  width: z.number(),
  height: z.number(),
  dpr: z.number(),
})

export type Viewport = z.infer<typeof viewportSchema>

export const snapshotStatusSchema = z.enum(['ready', 'pending', 'failed'])

export type SnapshotStatus = z.infer<typeof snapshotStatusSchema>

// ---------- Una pantalla capturada = un "Enviar" ----------

export const entrySchema = z.object({
  id: z.string(),
  order: z.number(),
  /** URL completa donde se capturó. */
  url: z.string(),
  /** Título del documento en el momento de la captura. */
  pageTitle: z.string(),
  viewport: viewportSchema,
  /** URL pública del snapshot rrweb gzip. null mientras sube o si falló. */
  snapshotUrl: z.string().nullable(),
  /** URL pública del JPEG/WebP de índice. null si no se pudo generar. */
  thumbnailUrl: z.string().nullable(),
  snapshotStatus: snapshotStatusSchema,
  /** ISO */
  capturedAt: z.string(),
  annotations: z.array(annotationSchema),
})

export type Entry = z.infer<typeof entrySchema>
