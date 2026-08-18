/**
 * CORS del API (PRD §4.1).
 *
 * El embed vive en el sitio del cliente y el agente hace `fetch` desde donde sea,
 * así que todo el API es cross-origin: se refleja el `Origin` cuando viene (y se
 * marca `Vary: Origin`), y se cae a `*` cuando no. No hay cookies ni credenciales:
 * la autenticación es la API key pública en `x-api-key`.
 */

export type HttpMethod = 'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS'

/** Headers que el embed manda en sus writes (§4.1 «Requests»). */
const ALLOWED_HEADERS = ['Content-Type', 'Content-Encoding', 'x-api-key', 'Idempotency-Key', 'Accept'].join(', ')

const MAX_AGE_SECONDS = 86_400

export function corsHeaders(request: Request, methods: readonly HttpMethod[]): Headers {
  const headers = new Headers()
  const origin = request.headers.get('origin')

  if (origin) {
    headers.set('Access-Control-Allow-Origin', origin)
    headers.append('Vary', 'Origin')
  } else {
    headers.set('Access-Control-Allow-Origin', '*')
  }

  const allowed = methods.includes('OPTIONS') ? methods : [...methods, 'OPTIONS']
  headers.set('Access-Control-Allow-Methods', allowed.join(', '))
  headers.set('Access-Control-Allow-Headers', ALLOWED_HEADERS)
  headers.set('Access-Control-Max-Age', String(MAX_AGE_SECONDS))
  return headers
}

/** Respuesta del preflight `OPTIONS` de cualquier ruta del API. */
export function preflight(request: Request, methods: readonly HttpMethod[]): Response {
  return new Response(null, { status: 204, headers: corsHeaders(request, methods) })
}

/** JSON + CORS. Las respuestas del API nunca se cachean: siempre son de request. */
export function jsonResponse(
  request: Request,
  methods: readonly HttpMethod[],
  data: unknown,
  status = 200,
): Response {
  const headers = corsHeaders(request, methods)
  headers.set('Content-Type', 'application/json; charset=utf-8')
  headers.set('Cache-Control', 'no-store')
  return new Response(JSON.stringify(data), { status, headers })
}
