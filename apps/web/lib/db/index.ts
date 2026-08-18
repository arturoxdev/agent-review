/**
 * Cliente Drizzle sobre Neon (HTTP).
 *
 * `@neondatabase/serverless` habla HTTP, así que el mismo cliente funciona en
 * Route Handlers (runtime node o edge) y en scripts de Node/Bun (seed, backfills):
 * no hay sockets ni pool que cerrar.
 *
 * Se crea perezosamente para que importar este módulo no exija `DATABASE_URL`
 * (typecheck, build de páginas estáticas, tests).
 */
import { neon } from '@neondatabase/serverless'
import { drizzle, type NeonHttpDatabase } from 'drizzle-orm/neon-http'

import { getEnv } from '../env'
import { schema } from './schema'

export type Database = NeonHttpDatabase<typeof schema>

let instance: Database | null = null

export function getDb(): Database {
  instance ??= drizzle(neon(getEnv().DATABASE_URL), { schema })
  return instance
}

/** Azúcar: `db.select()…`. Resuelve el cliente en el primer uso. */
export const db: Database = new Proxy({} as Database, {
  get(_target, prop) {
    const value = getDb()[prop as keyof Database]
    return typeof value === 'function' ? value.bind(getDb()) : value
  },
})

export * from './schema'
export * from './ids'
