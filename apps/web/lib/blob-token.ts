/**
 * Firma de las URLs de subida de blobs (PRD §4.1).
 *
 * El API devuelve `snapshotUploadUrl` / `thumbnailUploadUrl` con forma:
 *
 *     {PUNTO_ORIGIN}/api/blobs/{uuid}?token={exp}.{hmac}
 *
 * `token` = `exp` (epoch en segundos) + HMAC-SHA256 de `"{uuid}.{exp}"` con
 * `BLOB_UPLOAD_SECRET`. Ventana de 15 minutos. Si caducó, el mismo POST con la
 * misma `Idempotency-Key` re-firma sin duplicar sesión ni entry.
 *
 * Se usa Web Crypto (`crypto.subtle`), disponible en Node 18+, Bun y el runtime edge,
 * así que estos helpers sirven igual en Route Handlers node/edge y en scripts.
 * Por eso son `async`.
 */
import { getEnv } from './env'

/** Ventana de validez de una URL de subida, en segundos (PRD §4.1: 15 min). */
export const UPLOAD_TOKEN_TTL_SECONDS = 15 * 60

let keyPromise: Promise<CryptoKey> | null = null
let keyForSecret: string | null = null

function hmacKey(): Promise<CryptoKey> {
  const secret = getEnv().BLOB_UPLOAD_SECRET
  if (!keyPromise || keyForSecret !== secret) {
    keyForSecret = secret
    keyPromise = crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    )
  }
  return keyPromise
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

async function sign(uuid: string, exp: number): Promise<string> {
  const key = await hmacKey()
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${uuid}.${exp}`))
  return toHex(signature)
}

/** Comparación en tiempo constante (evita filtrar el HMAC por timing). */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

/**
 * Firma un token de subida para `uuid`.
 *
 * @param uuid uuid del blob (`apps/web/.data/blobs/{uuid}`)
 * @param exp  epoch en **segundos** de expiración. Default: ahora + 15 min.
 * @returns    `"{exp}.{hmac}"`, listo para meter como `?token=`
 */
export async function signUploadToken(
  uuid: string,
  exp: number = Math.floor(Date.now() / 1000) + UPLOAD_TOKEN_TTL_SECONDS,
): Promise<string> {
  return `${exp}.${await sign(uuid, exp)}`
}

/** `true` solo si el token es de este `uuid`, la firma cuadra y no caducó. */
export async function verifyUploadToken(uuid: string, token: string | null | undefined): Promise<boolean> {
  if (!token) return false

  const separator = token.indexOf('.')
  if (separator <= 0) return false

  const exp = Number(token.slice(0, separator))
  const signature = token.slice(separator + 1)
  if (!Number.isInteger(exp) || signature.length === 0) return false
  if (exp * 1000 <= Date.now()) return false

  return timingSafeEqual(signature, await sign(uuid, exp))
}

/** URL completa de subida, firmada por 15 min: `{origin}/api/blobs/{uuid}?token=…`. */
export async function signedUploadUrl(uuid: string): Promise<string> {
  const token = await signUploadToken(uuid)
  return `${getEnv().PUNTO_ORIGIN}/api/blobs/${uuid}?token=${token}`
}
