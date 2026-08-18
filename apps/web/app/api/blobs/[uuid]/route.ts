/**
 * `PUT /api/blobs/:uuid?token=…` — subida firmada (15 min) del snapshot gzip o del
 * thumbnail. `GET /api/blobs/:uuid` — lectura pública si conoces el UUID (PRD §4.1
 * «Dónde vive el blob»).
 *
 * El `PUT` acepta:
 *   · snapshot:  `Content-Type: application/json` + `Content-Encoding: gzip`
 *   · thumbnail: `Content-Type: image/webp` o `image/jpeg`
 *
 * El content-type (y el encoding) se guardan junto al blob para poder devolverlos en
 * el `GET`: con `Content-Encoding: gzip` el browser descomprime solo y el viewer puede
 * hacer `fetch(snapshotUrl).json()`. Dónde acaba el binario —Cloudflare R2 o el disco
 * local— lo decide `lib/api/blob-store.ts`; esta ruta no se entera.
 *
 * Runtime Node.js (default en Next 16): el backend de disco toca el filesystem.
 *
 * | Estado | Cuándo |
 * | ------ | ------ |
 * | 200    | `GET` con el blob, o `PUT` guardado |
 * | 400    | uuid mal formado, body vacío o content-type no soportado |
 * | 401    | `?token=` ausente, mal firmado o caducado |
 * | 404    | no hay blob con ese uuid |
 * | 413    | body > 5 MB |
 */
import {
  ALLOWED_CONTENT_TYPES,
  isBlobId,
  MAX_BLOB_BYTES,
  normalizeContentType,
  readBlob,
  readLimitedBody,
  writeBlob,
} from '@/lib/api/blob-store'
import { corsHeaders, jsonResponse, preflight, type HttpMethod } from '@/lib/api/cors'
import { ApiError } from '@/lib/api/errors'
import { handle } from '@/lib/api/handler'
import { verifyUploadToken } from '@/lib/blob-token'

const METHODS: readonly HttpMethod[] = ['GET', 'HEAD', 'PUT', 'OPTIONS']

type Context = { params: Promise<{ uuid: string }> }

export function OPTIONS(request: Request): Response {
  return preflight(request, METHODS)
}

export async function PUT(request: Request, context: Context): Promise<Response> {
  return handle(request, METHODS, async () => {
    const uuid = await requireUuid(context)

    const token = new URL(request.url).searchParams.get('token')
    if (!(await verifyUploadToken(uuid, token))) {
      throw new ApiError(
        'invalid_upload_token',
        'La URL de subida no es válida o ya caducó. Repite el POST con la misma Idempotency-Key.',
      )
    }

    const contentType = normalizeContentType(request.headers.get('content-type'))
    if (!contentType || !isAllowedContentType(contentType)) {
      throw new ApiError(
        'invalid_request',
        `Content-Type no soportado (${contentType ?? 'ausente'}). Se esperaba ${ALLOWED_CONTENT_TYPES.join(', ')}.`,
      )
    }

    const contentEncoding = request.headers.get('content-encoding')?.trim().toLowerCase() || null
    if (contentEncoding !== null && contentEncoding !== 'gzip') {
      throw new ApiError('invalid_request', `Content-Encoding no soportado (${contentEncoding}). Solo gzip.`)
    }

    const data = await readLimitedBody(request, MAX_BLOB_BYTES)
    if (data.byteLength === 0) throw new ApiError('invalid_request', 'El body de la subida viene vacío.')

    const meta = await writeBlob(uuid, data, { contentType, contentEncoding })
    return jsonResponse(request, METHODS, { uuid, size: meta.size, contentType: meta.contentType })
  })
}

export async function GET(request: Request, context: Context): Promise<Response> {
  return handle(request, METHODS, async () => {
    const uuid = await requireUuid(context)
    const blob = await readBlob(uuid)
    if (!blob) throw new ApiError('not_found', `No existe el blob ${uuid}.`)

    const headers = corsHeaders(request, METHODS)
    headers.set('Content-Type', blob.meta.contentType)
    if (blob.meta.contentEncoding) headers.set('Content-Encoding', blob.meta.contentEncoding)
    headers.set('Content-Length', String(blob.data.byteLength))
    // El uuid es el identificador del contenido: nunca cambia bajo la misma URL.
    headers.set('Cache-Control', 'public, max-age=31536000, immutable')

    return new Response(new Uint8Array(blob.data), { status: 200, headers })
  })
}

export async function HEAD(request: Request, context: Context): Promise<Response> {
  const response = await GET(request, context)
  return new Response(null, { status: response.status, headers: response.headers })
}

async function requireUuid(context: Context): Promise<string> {
  const { uuid } = await context.params
  if (!isBlobId(uuid)) throw new ApiError('invalid_request', 'El identificador del blob no es un UUID válido.')
  return uuid
}

function isAllowedContentType(value: string): boolean {
  return (ALLOWED_CONTENT_TYPES as readonly string[]).includes(value)
}
