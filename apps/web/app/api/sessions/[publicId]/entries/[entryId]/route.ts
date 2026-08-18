/**
 * `PATCH /api/sessions/:publicId/entries/:entryId` — cierre del ciclo de subida
 * (PRD §4.1: `ready` solo si el PUT del snapshot fue 2xx).
 *
 * Body: `{ snapshotStatus: 'ready' | 'failed' }`. Se acepta además
 * `thumbnailUrl: null` para el caso del §4.1 «si el thumb falla: `ready` igual,
 * `thumbnailUrl: null`»; sin ese campo el thumbnail no se toca.
 *
 * | Estado | Cuándo |
 * | ------ | ------ |
 * | 200    | la entry actualizada |
 * | 400    | body inválido |
 * | 401    | `x-api-key` ausente o desconocida |
 * | 404    | no existe la sesión, o la entry no es de esa sesión |
 * | 503    | sin base de datos configurada |
 */
import { patchEntryRequestSchema } from '@punto/contracts'
import { z } from 'zod'

import { jsonResponse, preflight, type HttpMethod } from '@/lib/api/cors'
import { ApiError } from '@/lib/api/errors'
import { handle, parseJsonBody, requireProjectOwningSession } from '@/lib/api/handler'
import { patchEntryStatus } from '@/lib/db/queries'

const METHODS: readonly HttpMethod[] = ['PATCH', 'OPTIONS']

const patchBodySchema = patchEntryRequestSchema.extend({
  /** Opcional: `null` borra el thumbnail cuando su subida falló. */
  thumbnailUrl: z.string().nullable().optional(),
})

type Context = { params: Promise<{ publicId: string; entryId: string }> }

export function OPTIONS(request: Request): Response {
  return preflight(request, METHODS)
}

export async function PATCH(request: Request, context: Context): Promise<Response> {
  return handle(request, METHODS, async () => {
    const { publicId, entryId } = await context.params
    await requireProjectOwningSession(request, publicId)

    const body = await parseJsonBody(request, patchBodySchema)

    const entry = await patchEntryStatus(
      publicId,
      entryId,
      body.snapshotStatus,
      'thumbnailUrl' in body ? { thumbnailUrl: body.thumbnailUrl ?? null } : {},
    )
    if (!entry) throw new ApiError('not_found', `No existe la pantalla ${entryId} en esta sesión.`)

    return jsonResponse(request, METHODS, entry)
  })
}
