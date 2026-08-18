/**
 * Envoltura común de los Route Handlers (PRD §4).
 *
 * Cada ruta declara qué métodos soporta y su cuerpo se ejecuta dentro de `handle`,
 * que se encarga de:
 *  · pegar los headers de CORS a la respuesta (incluidas las de error),
 *  · traducir `ApiError` y los errores de dominio de `lib/db/queries.ts`
 *    (`SessionNotFoundError` → 404, `SessionClosedError` → 409),
 *  · devolver 503 legible en vez de reventar el proceso cuando falta `DATABASE_URL`.
 */
import type { ZodType } from 'zod'

import { getProjectByPublicKey, SessionClosedError, SessionNotFoundError } from '../db/queries'
import { corsHeaders, jsonResponse, type HttpMethod } from './cors'
import { ApiError, formatZodError, INVALID_API_KEY_MESSAGE, isConfigurationError } from './errors'

export async function handle(
  request: Request,
  methods: readonly HttpMethod[],
  run: () => Promise<Response>,
): Promise<Response> {
  try {
    const response = await run()
    const headers = new Headers(response.headers)
    for (const [key, value] of corsHeaders(request, methods)) {
      if (key.toLowerCase() === 'vary') headers.append('Vary', value)
      else headers.set(key, value)
    }
    return new Response(response.body, { status: response.status, headers })
  } catch (error) {
    return errorResponse(request, methods, error)
  }
}

function errorResponse(request: Request, methods: readonly HttpMethod[], error: unknown): Response {
  if (error instanceof ApiError) {
    return jsonResponse(request, methods, error.toBody(), error.status)
  }

  if (error instanceof SessionNotFoundError) {
    return jsonResponse(
      request,
      methods,
      { error: { code: 'not_found', message: error.message } },
      404,
    )
  }

  if (error instanceof SessionClosedError) {
    return jsonResponse(
      request,
      methods,
      { error: { code: 'session_closed', message: 'Esta sesión ya se finalizó.' } },
      409,
    )
  }

  if (isConfigurationError(error)) {
    console.error('[punto/api] configuración o base de datos no disponible:', error)
    return jsonResponse(
      request,
      methods,
      {
        error: {
          code: 'service_unavailable',
          message:
            'El servicio no está configurado: falta o falla la conexión a la base de datos (DATABASE_URL).',
        },
      },
      503,
    )
  }

  console.error('[punto/api] error no controlado:', error)
  return jsonResponse(
    request,
    methods,
    { error: { code: 'internal_error', message: 'Error interno del servidor.' } },
    500,
  )
}

// ---------- autenticación del embed (§4.1) ----------

/**
 * Resuelve el proyecto a partir de `x-api-key: pk_…`.
 * Lanza 401 con el mensaje que el embed muestra tal cual.
 */
export async function requireProject(request: Request): Promise<{ id: string; name: string }> {
  const key = request.headers.get('x-api-key')?.trim()
  if (!key) throw new ApiError('invalid_api_key', INVALID_API_KEY_MESSAGE)

  const project = await getProjectByPublicKey(key)
  if (!project) throw new ApiError('invalid_api_key', INVALID_API_KEY_MESSAGE)

  // Solo lo que el API necesita: el embed nunca ve el id interno del proyecto.
  return { id: project.id, name: project.name }
}

/**
 * Igual que `requireProject`, pero además exige que la sesión del `publicId`
 * pertenezca a ese proyecto.
 *
 * Sin esto, cualquier `pk_…` válida podría escribir en la sesión de otro proyecto
 * con solo conocer su `publicId`. Se responde 404 (no 403) para no confirmarle a
 * quien prueba claves ajenas que ese `publicId` existe.
 */
export async function requireProjectOwningSession(
  request: Request,
  publicId: string,
): Promise<{ id: string; name: string }> {
  const project = await requireProject(request)
  const { getSessionOwnerProjectId } = await import('../db/queries')
  const ownerId = await getSessionOwnerProjectId(publicId)
  if (ownerId === null || ownerId !== project.id) {
    throw new ApiError('not_found', `No existe la sesión ${publicId}.`)
  }
  return project
}

/** `Idempotency-Key` es obligatorio en los POST de captura (§4.1). */
export function requireIdempotencyKey(request: Request): string {
  const key = request.headers.get('idempotency-key')?.trim()
  if (!key) {
    throw new ApiError(
      'missing_idempotency_key',
      'Falta el header Idempotency-Key (un uuid por pantalla).',
    )
  }
  return key
}

// ---------- validación (§11: sin `any`, todo body pasa por Zod) ----------

export async function parseJsonBody<T>(request: Request, schema: ZodType<T>): Promise<T> {
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    throw new ApiError('invalid_request', 'El body no es JSON válido.')
  }

  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    throw new ApiError('invalid_request', `Body inválido — ${formatZodError(parsed.error)}`)
  }
  return parsed.data
}
