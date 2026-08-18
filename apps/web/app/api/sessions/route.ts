/**
 * `POST /api/sessions` — primer «Enviar» del embed (PRD §4, §4.1).
 *
 * Crea la sesión `open` **y** su primera entry (`pending`) y devuelve el
 * `CreateEntryResponse`: `publicId`, la entry con `snapshotUrl`/`thumbnailUrl` ya
 * asignados por UUID, y las dos URLs de subida firmadas por 15 minutos.
 *
 * Repetir el POST con la misma `Idempotency-Key` **re-firma** las URLs sin duplicar
 * sesión ni entry (`created: false` de `lib/db/queries.ts`).
 *
 * | Estado | Cuándo |
 * | ------ | ------ |
 * | 201    | sesión y entry nuevas |
 * | 200    | misma `Idempotency-Key`: solo se re-firmó |
 * | 400    | body inválido o falta `Idempotency-Key` |
 * | 401    | `x-api-key` ausente o desconocida |
 * | 503    | sin base de datos configurada |
 */
import { createSessionRequestSchema } from '@punto/contracts'

import { buildCreateEntryResponse, toEntryInput } from '@/lib/api/capture'
import { jsonResponse, preflight, type HttpMethod } from '@/lib/api/cors'
import { handle, parseJsonBody, requireIdempotencyKey, requireProject } from '@/lib/api/handler'
import { createSessionWithEntry } from '@/lib/db/queries'

const METHODS: readonly HttpMethod[] = ['POST', 'OPTIONS']

export function OPTIONS(request: Request): Response {
  return preflight(request, METHODS)
}

export async function POST(request: Request): Promise<Response> {
  return handle(request, METHODS, async () => {
    const project = await requireProject(request)
    const idempotencyKey = requireIdempotencyKey(request)
    const body = await parseJsonBody(request, createSessionRequestSchema)

    const { session, entry, created } = await createSessionWithEntry({
      projectId: project.id,
      title: body.title,
      entry: toEntryInput(body, idempotencyKey),
    })

    const payload = await buildCreateEntryResponse(session.publicId, entry)
    return jsonResponse(request, METHODS, payload, created ? 201 : 200)
  })
}
