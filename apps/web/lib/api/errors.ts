/**
 * Forma única de error del API (PRD §4.1, §7 A7).
 *
 *     { "error": { "code": "invalid_api_key", "message": "…" } }
 *
 * Los `code` son los que el embed distingue para elegir su banda de error:
 * clave inválida, sesión cerrada, payload muy pesado y no encontrado.
 * El `message` ya viene en español y es el que se puede mostrar tal cual.
 */
import type { ZodError } from 'zod'

export type ApiErrorCode =
  /** Body que no cuadra con el esquema Zod, o parámetro inválido. */
  | 'invalid_request'
  /** Falta o no existe `x-api-key`. Embed: «La clave de este sitio no es válida.» */
  | 'invalid_api_key'
  /** Falta el header `Idempotency-Key` en un POST de captura. */
  | 'missing_idempotency_key'
  /** Sesión, entry, proyecto o blob inexistente. */
  | 'not_found'
  /** La sesión ya se finalizó (PRD §4.1: 409). */
  | 'session_closed'
  /** Body > 5 MB en `PUT /api/blobs/:uuid` (PRD §4.1). */
  | 'payload_too_large'
  /** `?token=` ausente, mal firmado o caducado. */
  | 'invalid_upload_token'
  /** Falta configuración (típicamente `DATABASE_URL`) o la base no responde. */
  | 'service_unavailable'
  | 'internal_error'

const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  invalid_request: 400,
  invalid_api_key: 401,
  missing_idempotency_key: 400,
  not_found: 404,
  session_closed: 409,
  payload_too_large: 413,
  invalid_upload_token: 401,
  service_unavailable: 503,
  internal_error: 500,
}

/** Mensaje exacto que el embed muestra como «La clave de este sitio no es válida.» */
export const INVALID_API_KEY_MESSAGE = 'La clave de este sitio no es válida.'

export type ApiErrorBody = { error: { code: ApiErrorCode; message: string } }

export class ApiError extends Error {
  readonly code: ApiErrorCode
  readonly status: number

  constructor(code: ApiErrorCode, message: string) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = STATUS_BY_CODE[code]
  }

  toBody(): ApiErrorBody {
    return { error: { code: this.code, message: this.message } }
  }
}

/** `annotations.0.target.selector: Required` — legible, sin volcar el árbol de Zod. */
export function formatZodError(error: ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join('.') || '(raíz)'}: ${issue.message}`)
    .join('; ')
}

/**
 * ¿El fallo es «no hay base de datos configurada» en vez de un bug?
 *
 * `lib/env.ts` lanza al primer acceso si falta `DATABASE_URL`, y el driver de Neon
 * lanza al construir el cliente. En ambos casos la respuesta honesta es 503, no 500.
 */
const CONFIGURATION_PATTERN =
  /Configuración de entorno inválida|DATABASE_URL|connection string|Error connecting to database|NeonDbError|fetch failed|ECONNREFUSED|ENOTFOUND|getaddrinfo/i

export function isConfigurationError(error: unknown): boolean {
  // Drizzle envuelve el fallo del driver: hay que recorrer la cadena de `cause`.
  let current: unknown = error
  for (let depth = 0; depth < 5 && current instanceof Error; depth += 1) {
    if (CONFIGURATION_PATTERN.test(`${current.name}: ${current.message}`)) return true
    current = current.cause
  }
  return false
}
