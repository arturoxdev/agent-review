/**
 * Cliente del contrato del §4.1. No inventa endpoints ni formas: se ciñe a
 *
 *   POST  /api/sessions                        → CreateEntryResponse
 *   POST  /api/sessions/:publicId/entries      → CreateEntryResponse
 *   PUT   snapshotUploadUrl                    (blob gzip)
 *   PUT   thumbnailUploadUrl                   (imagen; si falla, se sigue)
 *   PATCH /api/sessions/:publicId/entries/:id  { snapshotStatus }
 *   PATCH /api/sessions/:publicId              (cierra sesión)
 *
 * Headers en todo write: `x-api-key`, `Idempotency-Key`, `Content-Type`.
 */

import type {
  CreateEntryRequest,
  CreateEntryResponse,
  PatchEntryRequest,
  SnapshotStatus,
} from '@punto/contracts'

import type { EmbedConfig } from './config'

/** Cada caso del §7·A7 tiene su código. `too-heavy` es el >5 MB del §4.1·5. */
export type ErrorCode = 'offline' | 'invalid-key' | 'heavy' | 'too-heavy' | 'capture' | 'csp' | 'closed'

export interface ApiFailure {
  code: ErrorCode
  status?: number
}

export function isApiFailure(value: unknown): value is ApiFailure {
  return typeof value === 'object' && value !== null && 'code' in value
}

function fail(code: ErrorCode, status?: number): ApiFailure {
  return status === undefined ? { code } : { code, status }
}

/** Un fallo de red se lee como "sin conexión" o como "el CSP lo bloqueó". */
function networkFailure(): ApiFailure {
  return fail(navigator.onLine === false ? 'offline' : 'csp')
}

function writeHeaders(config: EmbedConfig, idempotencyKey: string): HeadersInit {
  return {
    'x-api-key': config.apiKey,
    'Idempotency-Key': idempotencyKey,
    'Content-Type': 'application/json',
  }
}

async function writeJson<T>(
  config: EmbedConfig,
  method: 'POST' | 'PATCH',
  path: string,
  idempotencyKey: string,
  body: unknown,
): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${config.apiBase}${path}`, {
      method,
      mode: 'cors',
      credentials: 'omit',
      headers: writeHeaders(config, idempotencyKey),
      body: JSON.stringify(body),
    })
  } catch {
    throw networkFailure()
  }

  if (response.status === 401 || response.status === 403) throw fail('invalid-key', response.status)
  if (response.status === 409) throw fail('closed', 409)
  // Hubo respuesta, así que no es un bloqueo de CSP ni falta de red: es un
  // fallo del servidor. Se ofrece reintentar sin perder las anotaciones.
  if (!response.ok) throw fail('capture', response.status)

  try {
    return (await response.json()) as T
  } catch {
    throw fail('capture', response.status)
  }
}

export function createSession(
  config: EmbedConfig,
  idempotencyKey: string,
  body: CreateEntryRequest,
): Promise<CreateEntryResponse> {
  return writeJson<CreateEntryResponse>(config, 'POST', '/api/sessions', idempotencyKey, body)
}

export function createEntry(
  config: EmbedConfig,
  publicId: string,
  idempotencyKey: string,
  body: CreateEntryRequest,
): Promise<CreateEntryResponse> {
  return writeJson<CreateEntryResponse>(
    config,
    'POST',
    `/api/sessions/${encodeURIComponent(publicId)}/entries`,
    idempotencyKey,
    body,
  )
}

export function patchEntry(
  config: EmbedConfig,
  publicId: string,
  entryId: string,
  idempotencyKey: string,
  snapshotStatus: Exclude<SnapshotStatus, 'pending'>,
  /** `true` cuando la subida del thumb falló: el índice cae a path + badge. */
  thumbnailFailed = false,
): Promise<unknown> {
  const body: PatchEntryRequest & { thumbnailUrl?: null } = { snapshotStatus }
  if (thumbnailFailed) body.thumbnailUrl = null
  return writeJson<unknown>(
    config,
    'PATCH',
    `/api/sessions/${encodeURIComponent(publicId)}/entries/${encodeURIComponent(entryId)}`,
    idempotencyKey,
    body,
  )
}

/** Respuesta del cierre: la sesión y el link del documento (§7·A6). */
export interface CloseSessionResponse {
  url?: string
}

export function closeSession(
  config: EmbedConfig,
  publicId: string,
  idempotencyKey: string,
  title: string,
): Promise<CloseSessionResponse> {
  return writeJson<CloseSessionResponse>(
    config,
    'PATCH',
    `/api/sessions/${encodeURIComponent(publicId)}`,
    idempotencyKey,
    { title },
  )
}

/** Las URLs de subida pueden venir absolutas o como path; ambas valen. */
export function resolveUrl(config: EmbedConfig, url: string): string {
  if (/^https?:\/\//i.test(url)) return url
  return `${config.apiBase}${url.startsWith('/') ? '' : '/'}${url}`
}

/**
 * PUT del blob con progreso REAL (§7·A5·2). `fetch` no expone progreso de
 * subida en navegadores actuales, así que este es el único punto con XHR.
 */
export function putBlob(
  url: string,
  blob: Blob,
  contentType: string,
  contentEncoding: string | null,
  onProgress: (fraction: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url, true)
    xhr.setRequestHeader('Content-Type', contentType)
    if (contentEncoding !== null) xhr.setRequestHeader('Content-Encoding', contentEncoding)

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) onProgress(event.loaded / event.total)
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(1)
        resolve()
        return
      }
      // Ojo: el 401 de un PUT de blob NO es «clave inválida» — la subida se
      // autentica con el `?token=` de 15 min, no con la API key. Caducado, lo que
      // toca es reintentar (el POST idempotente re-firma), no decirle al usuario
      // que su clave está mal.
      if (xhr.status === 401 || xhr.status === 403) reject(fail('capture', xhr.status))
      else if (xhr.status === 409) reject(fail('closed', 409))
      else if (xhr.status === 0) reject(networkFailure())
      else reject(fail('capture', xhr.status))
    }
    xhr.onerror = () => reject(networkFailure())
    xhr.ontimeout = () => reject(fail('capture'))
    xhr.timeout = 60_000
    xhr.send(blob)
  })
}
