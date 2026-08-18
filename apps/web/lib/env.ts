/**
 * Validación de variables de entorno (PRD §4.1, §9).
 *
 * **Cada variable se valida sola, y solo cuando alguien la lee.** Eso importa: las
 * rutas de blobs (`/api/blobs/:uuid`) no tocan la base de datos, así que no pueden
 * morir porque falte `DATABASE_URL`. Antes se validaba todo el entorno de golpe y un
 * `.env` sin Neon dejaba caído el `PUT`/`GET` de blobs.
 *
 * El mensaje de error sigue siendo explícito: dice qué variable falta, qué se esperaba
 * y de dónde sacarla.
 *
 * Variables (documentadas también en `.env.example` en la raíz del repo):
 *
 * | Variable                     | Req. | Quién la lee                                                  |
 * | ---------------------------- | ---- | ------------------------------------------------------------- |
 * | `DATABASE_URL`               | sí   | `lib/db/index.ts` (solo las rutas que tocan Postgres)          |
 * | `PUNTO_ORIGIN`               | sí   | `blobReadUrl`, `signedUploadUrl`, `sessionDocumentUrl`, seed   |
 * | `BLOB_UPLOAD_SECRET`         | sí   | `lib/blob-token.ts` (firma/verifica los PUT de 15 min)         |
 * | `SESSION_SECRET`             | sí   | `lib/access-token.ts` (firma/verifica el Acceso del Panel)     |
 * | `BLOB_DIR`                   | no   | `lib/api/blob-store.ts`. Default `.data/blobs`                 |
 * | `PORT`                       | no   | scripts de `next dev`/`next start`. Default `3003`             |
 * | `NEXT_PUBLIC_PUNTO_ORIGIN`   | no   | cliente. Default = `PUNTO_ORIGIN`                              |
 * | `NEXT_PUBLIC_PUNTO_DEV_KEY`  | no   | `/dev/host`. Default `pk_dev_armot_local` (la del seed)     |
 * | `R2_ACCOUNT_ID`              | (*)  | `lib/api/blob-store.ts` (backend R2)                          |
 * | `R2_BUCKET`                  | (*)  | `lib/api/blob-store.ts` (backend R2)                          |
 * | `R2_ACCESS_KEY_ID`           | (*)  | `lib/api/blob-store.ts` (backend R2)                          |
 * | `R2_SECRET_ACCESS_KEY`       | (*)  | `lib/api/blob-store.ts` (backend R2)                          |
 *
 * (*) Las cuatro `R2_*` van juntas o no van: si están las cuatro, los blobs viven en
 * Cloudflare R2 (producción); si falta alguna, `blob-store` cae al filesystem y no se
 * valida ninguna. Ese «están o no están» lo decide `hasR2()`, que mira `process.env`
 * en crudo justamente para no disparar la validación de las que sí estén puestas.
 *
 * NOTA: el archivo `.env` vive en la RAÍZ del monorepo. `next dev` solo lee `.env`
 * desde `apps/web`, por eso existe el symlink `apps/web/.env -> ../../.env`.
 * Los scripts de Node/Bun (seed, drizzle-kit) cargan la raíz con `dotenv`.
 */
import { z } from 'zod'

// ---------------------------------------------------------------------------
// Esquema por variable. Nada de un `z.object` monolítico: cada entrada se parsea
// de forma independiente para que una ausencia solo afecte a quien la usa.
// ---------------------------------------------------------------------------

const databaseUrl = z
  .string()
  .min(
    1,
    'Falta DATABASE_URL. Neon dashboard → tu proyecto → Connect → Connection string (pooled), termina en ?sslmode=require',
  )
  .refine(
    (value) => value.startsWith('postgres://') || value.startsWith('postgresql://'),
    'DATABASE_URL debe empezar con postgres:// o postgresql://',
  )

const puntoOrigin = z
  .string()
  .min(1, 'Falta PUNTO_ORIGIN (p.ej. http://localhost:3003)')
  .refine(
    (value) => /^https?:\/\//.test(value),
    'PUNTO_ORIGIN debe ser un origen absoluto, p.ej. http://localhost:3003',
  )
  // sin barra final: siempre se concatena como `${origin}/api/...`
  .transform((value) => value.replace(/\/+$/, ''))

const blobUploadSecret = z
  .string()
  .min(16, 'Falta BLOB_UPLOAD_SECRET (mínimo 16 chars). Genera uno con: openssl rand -hex 32')

const sessionSecret = z
  .string()
  .min(32, 'Falta SESSION_SECRET (mínimo 32 chars). Genera uno con: openssl rand -base64 32')

const blobDir = z.string().min(1).default('.data/blobs')

const port = z.coerce.number().int().positive().default(3003)

const r2AccountId = z
  .string()
  .min(
    1,
    'Falta R2_ACCOUNT_ID. dash.cloudflare.com → R2 → Account ID (barra lateral)',
  )

const r2Bucket = z
  .string()
  .min(1, 'Falta R2_BUCKET. Es el nombre del bucket de R2, p.ej. punto-blobs')

const r2AccessKeyId = z
  .string()
  .min(
    1,
    'Falta R2_ACCESS_KEY_ID. R2 → Manage API tokens → Create API token (Object Read & Write)',
  )

const r2SecretAccessKey = z
  .string()
  .min(
    1,
    'Falta R2_SECRET_ACCESS_KEY. Sale junto al Access Key ID y Cloudflare solo lo muestra una vez',
  )

export type Env = {
  DATABASE_URL: string
  PUNTO_ORIGIN: string
  BLOB_UPLOAD_SECRET: string
  SESSION_SECRET: string
  BLOB_DIR: string
  PORT: number
  /** Origen que el cliente puede usar. Cae a `PUNTO_ORIGIN` si no se definió. */
  NEXT_PUBLIC_PUNTO_ORIGIN: string
  /** API key que `/dev/host` le pasa al embed. Default: la que crea `db:seed`. */
  NEXT_PUBLIC_PUNTO_DEV_KEY: string
  /** Account ID de Cloudflare. Solo lo lee el backend R2 de `blob-store`. */
  R2_ACCOUNT_ID: string
  /** Bucket de R2 donde viven los blobs en producción. */
  R2_BUCKET: string
  /** Access Key ID del token de R2 (permiso Object Read & Write). */
  R2_ACCESS_KEY_ID: string
  /** Secret Access Key del token de R2. */
  R2_SECRET_ACCESS_KEY: string
}

type Reader<K extends keyof Env> = () => Env[K]

function read<T>(name: string, schema: z.ZodType<T>, raw: string | undefined): T {
  const parsed = schema.safeParse(raw ?? '')
  if (parsed.success) return parsed.data

  const detail = parsed.error.issues.map((issue) => issue.message).join('; ')
  throw new Error(
    [
      `Configuración de entorno inválida: ${name}.`,
      `  · ${detail}`,
      'Revisa el `.env` de la raíz del repo (cópialo de `.env.example` si no existe).',
    ].join('\n'),
  )
}

/** Cachea el valor tras la primera lectura correcta; un fallo se vuelve a lanzar. */
function memo<K extends keyof Env>(fn: Reader<K>): Reader<K> {
  let cached: { value: Env[K] } | null = null
  return () => {
    cached ??= { value: fn() }
    return cached.value
  }
}

const readers: { [K in keyof Env]: Reader<K> } = {
  DATABASE_URL: memo(() => read('DATABASE_URL', databaseUrl, process.env.DATABASE_URL)),
  PUNTO_ORIGIN: memo(() => read('PUNTO_ORIGIN', puntoOrigin, process.env.PUNTO_ORIGIN)),
  BLOB_UPLOAD_SECRET: memo(() =>
    read('BLOB_UPLOAD_SECRET', blobUploadSecret, process.env.BLOB_UPLOAD_SECRET),
  ),
  SESSION_SECRET: memo(() =>
    read('SESSION_SECRET', sessionSecret, process.env.SESSION_SECRET),
  ),
  // Las opcionales tienen `.default()`: `''` no es válido, `undefined` sí.
  BLOB_DIR: memo(() => read('BLOB_DIR', blobDir, process.env.BLOB_DIR || undefined)),
  PORT: memo(() => read('PORT', port, process.env.PORT || undefined)),
  NEXT_PUBLIC_PUNTO_ORIGIN: memo(() => {
    const explicit = process.env.NEXT_PUBLIC_PUNTO_ORIGIN
    if (explicit) return read('NEXT_PUBLIC_PUNTO_ORIGIN', puntoOrigin, explicit)
    return readers.PUNTO_ORIGIN()
  }),
  NEXT_PUBLIC_PUNTO_DEV_KEY: memo(() => process.env.NEXT_PUBLIC_PUNTO_DEV_KEY || 'pk_dev_armot_local'),
  R2_ACCOUNT_ID: memo(() => read('R2_ACCOUNT_ID', r2AccountId, process.env.R2_ACCOUNT_ID)),
  R2_BUCKET: memo(() => read('R2_BUCKET', r2Bucket, process.env.R2_BUCKET)),
  R2_ACCESS_KEY_ID: memo(() =>
    read('R2_ACCESS_KEY_ID', r2AccessKeyId, process.env.R2_ACCESS_KEY_ID),
  ),
  R2_SECRET_ACCESS_KEY: memo(() =>
    read('R2_SECRET_ACCESS_KEY', r2SecretAccessKey, process.env.R2_SECRET_ACCESS_KEY),
  ),
}

const ENV_KEYS = Object.keys(readers) as (keyof Env)[]

/**
 * Env perezoso: `getEnv().BLOB_DIR` valida **solo** `BLOB_DIR`.
 *
 * Se mantiene la forma de función (y no un objeto plano) para que ningún import
 * dispare validación al cargar el módulo.
 */
export function getEnv(): Env {
  return env
}

/** Azúcar: `env.DATABASE_URL`. Valida esa variable, y solo esa, al leerla. */
export const env: Env = new Proxy({} as Env, {
  get(_target, prop: string | symbol) {
    if (typeof prop !== 'string' || !(prop in readers)) return undefined
    return readers[prop as keyof Env]()
  },
  has(_target, prop) {
    return typeof prop === 'string' && prop in readers
  },
  ownKeys() {
    return [...ENV_KEYS]
  },
  getOwnPropertyDescriptor(_target, prop) {
    if (typeof prop !== 'string' || !(prop in readers)) return undefined
    return { configurable: true, enumerable: true, get: () => readers[prop as keyof Env]() }
  },
})

/**
 * ¿Hay credenciales de R2 en el entorno? Decide el backend de `lib/api/blob-store.ts`.
 *
 * Lee `process.env` en crudo **a propósito**: preguntar por `env.R2_BUCKET` validaría
 * la variable y lanzaría en local, que es justo donde no hay R2 y no debe haberlo.
 * Aquí solo se mira si las cuatro están puestas; el valor lo valida quien lo use.
 */
export function hasR2(): boolean {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
      process.env.R2_BUCKET &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY,
  )
}

/** URL pública de lectura de un blob: `${PUNTO_ORIGIN}/api/blobs/{uuid}` (PRD §4.1). */
export function blobReadUrl(uuid: string): string {
  return `${env.PUNTO_ORIGIN}/api/blobs/${uuid}`
}

/** URL pública del documento de una sesión: `${PUNTO_ORIGIN}/s/{publicId}` (PRD §8). */
export function sessionDocumentUrl(publicId: string): string {
  return `${env.PUNTO_ORIGIN}/s/${publicId}`
}
