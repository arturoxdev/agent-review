/**
 * Blobs: Cloudflare R2 en producción, filesystem en local (PRD §4.1 «Dónde vive el blob»).
 *
 * El backend se elige **por llamada** según `hasR2()` (las cuatro `R2_*` puestas):
 *
 *   · `r2Backend`  — un `PUT`/`GET` firmado con SigV4 contra el bucket. El objeto se
 *     guarda con la key `{uuid}` y su metadata viaja con él, así que **no hay sidecar**:
 *     una escritura en vez de dos.
 *
 *     El `Content-Type` va como metadata nativa. El `Content-Encoding` **no**: va en
 *     `x-amz-meta-content-encoding`. Si se guardara como `Content-Encoding` nativo, el
 *     `GET` de R2 respondería con ese header y el `fetch` de Node/undici gunzipearía
 *     los bytes por su cuenta (está comprobado: lo hace en Node 24 y en Bun) mientras
 *     el header sigue diciendo `gzip`. El route reenviaría bytes ya descomprimidos
 *     etiquetados como comprimidos y el viewer moriría en el `.json()`. Con el header
 *     custom, undici no toca nada y el gzip llega intacto al browser.
 *   · `fsBackend`  — dos archivos dentro de `BLOB_DIR` (default `apps/web/.data/blobs`):
 *
 *         {uuid}            el binario tal cual llegó (snapshot gzip o imagen)
 *         {uuid}.meta.json  { contentType, contentEncoding, size, createdAt }
 *
 *     Se mantiene para que `bun run db:seed` y `next dev` funcionen sin credenciales
 *     de Cloudflare y sin red.
 *
 * En ambos casos el `Content-Encoding: gzip` del snapshot tiene que sobrevivir el
 * viaje: sin él el viewer hace `.json()` sobre bytes comprimidos y falla.
 *
 * El contrato público no cambia: las URLs siguen siendo `{PUNTO_ORIGIN}/api/blobs/{uuid}`
 * y R2 vive **detrás** de esa ruta, no delante.
 *
 * Solo se puede usar desde el runtime Node.js: el backend de disco toca el filesystem.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { AwsClient } from 'aws4fetch'

import { getEnv, hasR2 } from '../env'
import { ApiError } from './errors'

/** Tope del body de una subida (PRD §4.1: 5 MB del snapshot comprimido). */
export const MAX_BLOB_BYTES = 5 * 1024 * 1024

/** Content-types que acepta el `PUT` (§4.1): snapshot gzip y thumbnail. */
export const ALLOWED_CONTENT_TYPES = ['application/json', 'image/webp', 'image/jpeg'] as const

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type BlobMeta = {
  contentType: string
  /** `'gzip'` en el snapshot; `null` en las imágenes. */
  contentEncoding: string | null
  size: number
  createdAt: string
}

type BlobBackend = {
  write(uuid: string, data: Uint8Array, meta: Omit<BlobMeta, 'size' | 'createdAt'>): Promise<BlobMeta>
  read(uuid: string): Promise<{ data: Buffer; meta: BlobMeta } | null>
}

/** Solo uuids canónicos: cierra cualquier `..` o `/` en el nombre del archivo. */
export function isBlobId(value: string): boolean {
  return UUID_PATTERN.test(value)
}

export function newBlobId(): string {
  return crypto.randomUUID()
}

/**
 * `uuid` del final de una URL de lectura (`{origin}/api/blobs/{uuid}`).
 * Sirve para re-firmar la subida de una entry que ya existía (idempotencia, §4.1).
 */
export function blobIdFromUrl(url: string | null | undefined): string | null {
  if (!url) return null
  const candidate = url.split('?')[0]?.split('/').pop() ?? ''
  return isBlobId(candidate) ? candidate : null
}

/** Normaliza `application/json; charset=utf-8` → `application/json`. */
export function normalizeContentType(value: string | null): string | null {
  const base = value?.split(';')[0]?.trim().toLowerCase()
  return base ? base : null
}

/**
 * Lee el body con el tope de 5 MB, sin materializar más de la cuenta:
 * corta en cuanto se pasa y lanza 413 (`payload_too_large`).
 */
export async function readLimitedBody(request: Request, limit = MAX_BLOB_BYTES): Promise<Uint8Array> {
  const declared = Number(request.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > limit) throw tooLarge(limit)

  const body = request.body
  if (!body) return new Uint8Array(0)

  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      total += value.byteLength
      if (total > limit) {
        await reader.cancel()
        throw tooLarge(limit)
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }

  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.byteLength
  }
  return out
}

function tooLarge(limit: number): ApiError {
  return new ApiError(
    'payload_too_large',
    `La pantalla es muy pesada: el archivo supera el tope de ${Math.round(limit / (1024 * 1024))} MB.`,
  )
}

// ---------------------------------------------------------------------------
// Backend: Cloudflare R2 (producción)
// ---------------------------------------------------------------------------

// Cliente perezoso y cacheado, igual que el `hmacKey()` de `lib/blob-token.ts`: crearlo
// al importar el módulo obligaría a tener credenciales para arrancar cualquier ruta.
let r2Client: AwsClient | null = null
let r2ClientForKey: string | null = null

function r2() {
  const env = getEnv()
  const accessKeyId = env.R2_ACCESS_KEY_ID
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY
  if (!r2Client || r2ClientForKey !== accessKeyId) {
    r2ClientForKey = accessKeyId
    // R2 es S3-compatible y no tiene regiones en la firma: `auto` es lo que espera.
    r2Client = new AwsClient({ accessKeyId, secretAccessKey, service: 's3', region: 'auto' })
  }
  return r2Client
}

/**
 * Metadata de usuario donde viaja el `Content-Encoding` del blob. S3 devuelve estos
 * headers tal cual en el `GET` y —a diferencia de un `Content-Encoding` nativo— ningún
 * cliente HTTP intenta descomprimir el body por verlos.
 */
const R2_ENCODING_META = 'x-amz-meta-content-encoding'

/**
 * Firma con SigV4 y envía. **No se usa `client.fetch()` a propósito.**
 *
 * `aws4fetch` hace internamente `fetch(await this.sign(...))`, es decir le pasa un
 * objeto `Request`. Si el runtime exige `duplex` al construir un `Request` con body
 * —undici lo hace en las versiones que corren en Vercel, pero no en la de local— ese
 * `new Request` lanza `TypeError` y la librería cae a un fallback:
 *
 *     new Request(signed.url.toString(), Object.assign({ duplex: 'half' }, signed))
 *
 * que rompe dos cosas a la vez: `duplex: 'half'` convierte el body en un stream y se
 * pierde el `Content-Length` —R2 lo exige en el `PUT` y si no responde
 * `411 MissingContentLength`— y el `Object.assign` sobre un `Request` no copia
 * absolutamente nada, porque sus propiedades están en el prototipo, así que la
 * petición sale además **sin firmar**.
 *
 * Firmando por un lado y enviando los bytes con un `fetch(url, init)` normal, undici
 * calcula el `Content-Length` a partir del `Uint8Array` y ese camino no se pisa nunca.
 * `Content-Length` no va en `SignedHeaders` (aws4fetch no lo firma), así que que lo
 * ponga la capa de transporte no invalida la firma.
 */
async function r2Fetch(
  url: string,
  init: { method: string; headers?: Headers; body?: Uint8Array },
): Promise<Response> {
  const signed = await r2().sign(url, init as RequestInit)
  return fetch(signed.url, {
    method: init.method,
    headers: signed.headers,
    body: init.body as BodyInit | undefined,
  })
}

function r2ObjectUrl(uuid: string): string {
  const env = getEnv()
  return `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${env.R2_BUCKET}/${uuid}`
}

/** El status y el body de R2 en el mensaje: un 403 por credenciales no puede parecer un 404. */
async function r2Failure(action: string, uuid: string, response: Response): Promise<Error> {
  const body = await response.text().catch(() => '')
  return new Error(
    `R2 ${action} de ${uuid} falló con ${response.status} ${response.statusText}: ${body.slice(0, 500)}`,
  )
}

const r2Backend: BlobBackend = {
  async write(uuid, data, meta) {
    // `Content-Length` no se pone a mano: fetch lo deriva del body.
    const headers = new Headers({ 'Content-Type': meta.contentType })
    // Deliberadamente `x-amz-meta-…` y no `Content-Encoding`: ver la cabecera del módulo.
    if (meta.contentEncoding) headers.set(R2_ENCODING_META, meta.contentEncoding)

    const response = await r2Fetch(r2ObjectUrl(uuid), { method: 'PUT', body: data, headers })
    if (!response.ok) throw await r2Failure('PUT', uuid, response)

    return {
      contentType: meta.contentType,
      contentEncoding: meta.contentEncoding,
      size: data.byteLength,
      createdAt: new Date().toISOString(),
    }
  },

  async read(uuid) {
    const response = await r2Fetch(r2ObjectUrl(uuid), { method: 'GET' })
    // El route traduce el `null` a su propio 404.
    if (response.status === 404) return null
    if (!response.ok) throw await r2Failure('GET', uuid, response)

    const data = Buffer.from(await response.arrayBuffer())
    const declaredSize = Number(response.headers.get('content-length'))
    const lastModified = response.headers.get('last-modified')
    const modifiedAt = lastModified ? new Date(lastModified) : null

    return {
      data,
      meta: {
        // Mismos defaults tolerantes que el backend de disco.
        contentType: response.headers.get('content-type') || 'application/octet-stream',
        contentEncoding: response.headers.get(R2_ENCODING_META) || null,
        size: Number.isFinite(declaredSize) && declaredSize > 0 ? declaredSize : data.byteLength,
        createdAt:
          modifiedAt && !Number.isNaN(modifiedAt.getTime())
            ? modifiedAt.toISOString()
            : new Date(0).toISOString(),
      },
    }
  },
}

// ---------------------------------------------------------------------------
// Backend: filesystem (desarrollo y `db:seed`)
// ---------------------------------------------------------------------------

function blobDir(): string {
  const configured = getEnv().BLOB_DIR
  // `turbopackIgnore`: la ruta es de configuración (BLOB_DIR), no un import — sin
  // esto Turbopack avisa de que no puede analizar el `path.resolve` dinámico.
  return path.isAbsolute(configured)
    ? configured
    : path.resolve(/* turbopackIgnore: true */ process.cwd(), configured)
}

function blobPath(uuid: string): string {
  return path.join(blobDir(), uuid)
}

function metaPath(uuid: string): string {
  return `${blobPath(uuid)}.meta.json`
}

function isNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === 'ENOENT'
}

const fsBackend: BlobBackend = {
  async write(uuid, data, meta) {
    const dir = blobDir()
    await mkdir(dir, { recursive: true })

    const full: BlobMeta = {
      contentType: meta.contentType,
      contentEncoding: meta.contentEncoding,
      size: data.byteLength,
      createdAt: new Date().toISOString(),
    }

    await writeFile(blobPath(uuid), data)
    await writeFile(metaPath(uuid), `${JSON.stringify(full, null, 2)}\n`, 'utf8')
    return full
  },

  async read(uuid) {
    let data: Buffer
    try {
      data = await readFile(blobPath(uuid))
    } catch (error) {
      if (isNotFound(error)) return null
      throw error
    }

    let meta: BlobMeta = {
      contentType: 'application/octet-stream',
      contentEncoding: null,
      size: data.byteLength,
      createdAt: new Date(0).toISOString(),
    }

    try {
      const parsed: unknown = JSON.parse(await readFile(metaPath(uuid), 'utf8'))
      if (typeof parsed === 'object' && parsed !== null) {
        const record = parsed as Partial<BlobMeta>
        meta = {
          contentType: typeof record.contentType === 'string' ? record.contentType : meta.contentType,
          contentEncoding: typeof record.contentEncoding === 'string' ? record.contentEncoding : null,
          size: typeof record.size === 'number' ? record.size : data.byteLength,
          createdAt: typeof record.createdAt === 'string' ? record.createdAt : meta.createdAt,
        }
      }
    } catch (error) {
      // Sidecar perdido: se sirve como binario opaco en vez de fallar.
      if (!isNotFound(error)) console.warn('[punto/api] meta de blob ilegible', uuid, error)
    }

    return { data, meta }
  },
}

// ---------------------------------------------------------------------------
// Interfaz pública: la misma de siempre. El route handler no se entera del backend.
// ---------------------------------------------------------------------------

/** Se evalúa por llamada, no al importar: el entorno puede no estar leído todavía. */
function backend(): BlobBackend {
  return hasR2() ? r2Backend : fsBackend
}

export async function writeBlob(
  uuid: string,
  data: Uint8Array,
  meta: Omit<BlobMeta, 'size' | 'createdAt'>,
): Promise<BlobMeta> {
  return backend().write(uuid, data, meta)
}

export async function readBlob(uuid: string): Promise<{ data: Buffer; meta: BlobMeta } | null> {
  return backend().read(uuid)
}
