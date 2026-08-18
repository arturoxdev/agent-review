/**
 * Blobs en disco (PRD §4.1 «Dónde vive el blob», v1 sin R2).
 *
 * Cada blob son dos archivos dentro de `BLOB_DIR` (default `apps/web/.data/blobs`):
 *
 *     {uuid}            el binario tal cual llegó (snapshot gzip o imagen)
 *     {uuid}.meta.json  { contentType, contentEncoding, size, createdAt }
 *
 * El sidecar existe porque el `GET` tiene que devolver el mismo `Content-Type` y,
 * en el snapshot, el `Content-Encoding: gzip` para que el browser descomprima solo.
 * El día que entre R2 este módulo se cambia por una firma de PUT al bucket y nada
 * más se mueve.
 *
 * Solo se puede usar desde el runtime Node.js: toca el filesystem.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { getEnv } from '../env'
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

export async function writeBlob(
  uuid: string,
  data: Uint8Array,
  meta: Omit<BlobMeta, 'size' | 'createdAt'>,
): Promise<BlobMeta> {
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
}

function isNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === 'ENOENT'
}

export async function readBlob(uuid: string): Promise<{ data: Buffer; meta: BlobMeta } | null> {
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
}
