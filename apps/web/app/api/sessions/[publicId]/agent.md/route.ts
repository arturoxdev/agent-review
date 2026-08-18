/**
 * `GET /api/sessions/:publicId/agent.md` — Markdown listo para pegarle a un agente
 * (PRD §4, §8 «Para el agente»).
 *
 * El cuerpo lo arma `buildAgentMarkdown` de `@punto/contracts`, que nunca imprime
 * `undefined` en los campos opcionales de la anotación.
 *
 * | Estado | Cuándo |
 * | ------ | ------ |
 * | 200    | `text/markdown; charset=utf-8` |
 * | 404    | no existe esa sesión |
 * | 503    | sin base de datos configurada |
 */
import { buildAgentMarkdown } from '@punto/contracts'

import { preflight, type HttpMethod } from '@/lib/api/cors'
import { ApiError } from '@/lib/api/errors'
import { handle } from '@/lib/api/handler'
import { getEnv } from '@/lib/env'
import { getSession } from '@/lib/get-session'

const METHODS: readonly HttpMethod[] = ['GET', 'OPTIONS']

type Context = { params: Promise<{ publicId: string }> }

export function OPTIONS(request: Request): Response {
  return preflight(request, METHODS)
}

export async function GET(request: Request, context: Context): Promise<Response> {
  return handle(request, METHODS, async () => {
    const { publicId } = await context.params
    const session = await getSession(publicId)
    if (!session) throw new ApiError('not_found', `No existe la sesión ${publicId}.`)

    const markdown = buildAgentMarkdown(session, `${getEnv().PUNTO_ORIGIN}/api/sessions/${publicId}`)

    return new Response(markdown, {
      status: 200,
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        // `[Descargar .md]` del viewer (§8) quiere un nombre de archivo decente.
        'Content-Disposition': `inline; filename="${publicId}.md"`,
        'Cache-Control': 'no-store',
      },
    })
  })
}
