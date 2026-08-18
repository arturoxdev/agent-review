/**
 * `GET /api/sessions/:publicId` — la `Session` completa (PRD §4).
 * Es lo mismo que pinta el viewer y lo que jala el agente, por eso es público
 * (el secreto es el `publicId`) y cross-origin.
 *
 * `PATCH /api/sessions/:publicId` — el embed finaliza la sesión (§7 A6). Acepta
 * `{ title? }`, devuelve la `Session` cerrada y el link del documento.
 *
 * | Estado | Cuándo |
 * | ------ | ------ |
 * | 200    | ok |
 * | 400    | body inválido |
 * | 401    | `PATCH` sin `x-api-key` válida |
 * | 404    | no existe esa sesión |
 * | 503    | sin base de datos configurada |
 */
import { z } from 'zod'

import { jsonResponse, preflight, type HttpMethod } from '@/lib/api/cors'
import { ApiError } from '@/lib/api/errors'
import { handle, parseJsonBody, requireProjectOwningSession } from '@/lib/api/handler'
import { closeSession } from '@/lib/db/queries'
import { sessionDocumentUrl } from '@/lib/env'
import { getSession } from '@/lib/get-session'

const METHODS: readonly HttpMethod[] = ['GET', 'PATCH', 'OPTIONS']

/** §7 A6: el diálogo de cierre manda el título del documento. */
const closeSessionRequestSchema = z.object({
  title: z.string().optional(),
})

type Context = { params: Promise<{ publicId: string }> }

export function OPTIONS(request: Request): Response {
  return preflight(request, METHODS)
}

export async function GET(request: Request, context: Context): Promise<Response> {
  return handle(request, METHODS, async () => {
    const { publicId } = await context.params
    const session = await getSession(publicId)
    if (!session) throw notFound(publicId)
    return jsonResponse(request, METHODS, session)
  })
}

export async function PATCH(request: Request, context: Context): Promise<Response> {
  return handle(request, METHODS, async () => {
    const { publicId } = await context.params
    await requireProjectOwningSession(request, publicId)

    const body = await parseJsonBody(request, closeSessionRequestSchema)
    const session = await closeSession(publicId, body.title)
    if (!session) throw notFound(publicId)

    return jsonResponse(request, METHODS, {
      session,
      /** Link que el embed copia al portapapeles (§7 A6). */
      url: sessionDocumentUrl(session.publicId),
    })
  })
}

function notFound(publicId: string): ApiError {
  return new ApiError('not_found', `No existe la sesión ${publicId}.`)
}
