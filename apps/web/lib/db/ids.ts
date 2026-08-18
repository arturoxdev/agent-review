/**
 * Generación de ids (PRD §4).
 *
 * - Entidades: prefijo legible + 16 chars → `prj_…`, `ses_…`, `ent_…`, `ann_…`.
 * - `publicId` de sesión: 22 chars URL-safe, sin `-` ni `_` para que se pueda
 *   leer en voz alta y pegar sin escapes. Es el secreto del link (§8).
 * - `publicKey` de proyecto: `pk_live_…` en prod, `pk_dev_…` en local (§9).
 */
import { customAlphabet } from 'nanoid'

const ALPHANUMERIC = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
const LOWER_ALPHANUMERIC = '0123456789abcdefghijklmnopqrstuvwxyz'

const entityId = customAlphabet(LOWER_ALPHANUMERIC, 16)
const publicIdGenerator = customAlphabet(ALPHANUMERIC, 22)
const keyGenerator = customAlphabet(LOWER_ALPHANUMERIC, 24)

export const projectId = (): string => `prj_${entityId()}`
export const accountId = (): string => `acc_${entityId()}`
export const sessionId = (): string => `ses_${entityId()}`
export const entryId = (): string => `ent_${entityId()}`
export const annotationId = (): string => `ann_${entityId()}`

/** 22 chars URL-safe. ~131 bits de entropía: no se adivina. */
export const publicId = (): string => publicIdGenerator()

/** `pk_live_…` / `pk_dev_…`. Pública: se muestra completa en el panel (§9). */
export function publicKey(env: 'live' | 'dev' = 'live'): string {
  return `pk_${env}_${keyGenerator()}`
}
