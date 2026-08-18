/**
 * `POST /api/sessions/:publicId/entries` — pantallas siguientes del embed (PRD §4.1).
 *
 * Mismo body y misma respuesta que `POST /api/sessions`. Con la misma
 * `Idempotency-Key` solo re-firma las URLs de subida caducadas.
 *
 * | Estado | Cuándo |
 * | ------ | ------ |
 * | 201    | entry nueva |
 * | 200    | misma `Idempotency-Key`: solo se re-firmó |
 * | 400    | body inválido o falta `Idempotency-Key` |
 * | 401    | `x-api-key` ausente o desconocida |
 * | 404    | no existe esa sesión |
 * | 409    | la sesión ya se finalizó |
 * | 503    | sin base de datos configurada |
 */
import { createEntryRequestSchema } from '@punto/contracts'

import { buildCreateEntryResponse, toEntryInput } from '@/lib/api/capture'
import { jsonResponse, preflight, type HttpMethod } from '@/lib/api/cors'
import { handle, parseJsonBody, requireIdempotencyKey, requireProjectOwningSession } from '@/lib/api/handler'
import { addEntry } from '@/lib/db/queries'

const METHODS: readonly HttpMethod[] = ['POST', 'OPTIONS']

type Context = { params: Promise<{ publicId: string }> }

export function OPTIONS(request: Request): Response {
  return preflight(request, METHODS)
}

export async function POST(request: Request, context: Context): Promise<Response> {
  return handle(request, METHODS, async () => {
    const { publicId } = await context.params
    await requireProjectOwningSession(request, publicId)
    const idempotencyKey = requireIdempotencyKey(request)
    const body = await parseJsonBody(request, createEntryRequestSchema)

    // `addEntry` lanza SessionNotFoundError (404) y SessionClosedError (409).
    const { entry, created } = await addEntry(publicId, toEntryInput(body, idempotencyKey))

    const payload = await buildCreateEntryResponse(publicId, entry)
    return jsonResponse(request, METHODS, payload, created ? 201 : 200)
  })
}
