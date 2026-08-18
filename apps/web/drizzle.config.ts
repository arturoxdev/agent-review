/**
 * drizzle-kit — generación y aplicación de migraciones.
 *
 * `bun run db:generate` solo lee el schema (no necesita DB): si `DATABASE_URL`
 * está vacío se usa una URL dummy para no bloquear la generación del SQL.
 * `bun run db:migrate` sí necesita la connection string real de Neon.
 */
import { config } from 'dotenv'
import { defineConfig } from 'drizzle-kit'

// El .env vive en la raíz del monorepo.
config({ path: new URL('../../.env', import.meta.url).pathname, quiet: true })

const url = process.env.DATABASE_URL ?? 'postgresql://user:pass@localhost:5432/punto'

export default defineConfig({
  schema: './lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  casing: 'snake_case',
  strict: true,
  verbose: true,
  dbCredentials: { url },
})
