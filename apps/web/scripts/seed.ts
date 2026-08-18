import { readFile } from 'node:fs/promises'
import { parseArgs } from 'node:util'
import { promisify } from 'node:util'
import { gzip } from 'node:zlib'
import { hash } from 'bcryptjs'
import { config } from 'dotenv'
import { z } from 'zod'

config({ path: new URL('../../../.env', import.meta.url).pathname, quiet: true })

import { writeBlob } from '../lib/api/blob-store'
import { db } from '../lib/db'
import { createAccount, createProject } from '../lib/db/queries'
import { accounts, annotations, entries, projects, sessions } from '../lib/db/schema'
import { getEnv } from '../lib/env'
import { demoSessionFixture } from '../lib/fixtures'

const gzipAsync = promisify(gzip)
const SEED_PUBLIC_KEY = 'pk_dev_armot_local'
const DEMO_PUBLIC_ID = 'demo'
const DEMO_PROJECT_ID = 'prj_demo_armot'

const blobIds = {
  desktopSnapshot: '11111111-1111-4111-8111-111111111111',
  desktopThumbnail: '11111111-1111-4111-8111-111111111112',
  mobileSnapshot: '33333333-3333-4333-8333-333333333331',
  mobileThumbnail: '33333333-3333-4333-8333-333333333332',
} as const

function fail(message: string): never {
  console.error(`\n✖ ${message}\n`)
  process.exit(1)
}

if (!process.env.DATABASE_URL) {
  fail('DATABASE_URL está vacío. Configura Neon y ejecuta primero `bun run db:migrate`.')
}

const parsedArgs = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    email: { type: 'string' },
    password: { type: 'string' },
  },
  strict: true,
})

const rawEmail = parsedArgs.values.email ?? (process.stdin.isTTY ? prompt('Correo de la Cuenta seed:') ?? '' : '')
const rawPassword = parsedArgs.values.password ?? (process.stdin.isTTY ? prompt('Contraseña de la Cuenta seed (mínimo 8):') ?? '' : '')
const credentials = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8),
}).safeParse({ email: rawEmail, password: rawPassword })

if (!credentials.success) {
  fail('Pasa `--email correo@ejemplo.com --password "mínimo-8"` o responde ambos prompts.')
}

const origin = getEnv().PUNTO_ORIGIN
const blobUrl = (uuid: string): string => `${origin}/api/blobs/${uuid}`

async function seedDemoBlobs(): Promise<void> {
  const desktopSnapshot = await readFile(new URL('../public/mock/snapshot-1.json', import.meta.url))
  const desktopThumbnail = await readFile(new URL('../public/mock/snapshot-1.webp', import.meta.url))
  const mobileSnapshot = await readFile(new URL('../public/mock/snapshot-3.json', import.meta.url))
  const mobileThumbnail = await readFile(new URL('../public/mock/snapshot-3.webp', import.meta.url))

  await Promise.all([
    writeBlob(blobIds.desktopSnapshot, await gzipAsync(desktopSnapshot), {
      contentType: 'application/json',
      contentEncoding: 'gzip',
    }),
    writeBlob(blobIds.desktopThumbnail, desktopThumbnail, {
      contentType: 'image/webp',
      contentEncoding: null,
    }),
    writeBlob(blobIds.mobileSnapshot, await gzipAsync(mobileSnapshot), {
      contentType: 'application/json',
      contentEncoding: 'gzip',
    }),
    writeBlob(blobIds.mobileThumbnail, mobileThumbnail, {
      contentType: 'image/webp',
      contentEncoding: null,
    }),
  ])
}

// La spec exige una base limpia. El orden respeta las FK incluso si la migración
// se aplicó sobre una base que ya tenía datos.
await db.delete(annotations)
await db.delete(entries)
await db.delete(sessions)
await db.delete(projects)
await db.delete(accounts)

const account = await createAccount(
  credentials.data.email,
  await hash(credentials.data.password, 10),
)
const armot = await createProject(account.id, 'Armot', {
  id: DEMO_PROJECT_ID,
  publicKey: SEED_PUBLIC_KEY,
})
await createProject(account.id, 'Punto Landing', {
  id: 'prj_seed_landing',
  publicKey: 'pk_dev_punto_landing',
})

await seedDemoBlobs()

await db.insert(sessions).values({
  id: 'ses_demo_review',
  projectId: armot.id,
  publicId: DEMO_PUBLIC_ID,
  title: demoSessionFixture.title,
  status: 'closed',
  createdAt: demoSessionFixture.createdAt,
  closedAt: demoSessionFixture.closedAt,
})

for (const entry of demoSessionFixture.entries) {
  const snapshotUrl = entry.order === 1
    ? blobUrl(blobIds.desktopSnapshot)
    : entry.order === 3
      ? blobUrl(blobIds.mobileSnapshot)
      : null
  const thumbnailUrl = entry.order === 1
    ? blobUrl(blobIds.desktopThumbnail)
    : entry.order === 3
      ? blobUrl(blobIds.mobileThumbnail)
      : null

  await db.insert(entries).values({
    id: entry.id,
    sessionId: 'ses_demo_review',
    order: entry.order,
    url: entry.url,
    pageTitle: entry.pageTitle,
    viewport: entry.viewport,
    snapshotUrl,
    thumbnailUrl,
    snapshotStatus: entry.snapshotStatus,
    capturedAt: entry.capturedAt,
  })

  if (entry.annotations.length > 0) {
    await db.insert(annotations).values(entry.annotations.map((annotation) => ({
      id: annotation.id,
      entryId: entry.id,
      number: annotation.number,
      body: annotation.body,
      target: annotation.target,
      createdAt: annotation.createdAt,
    })))
  }
}

console.log([
  '',
  '✓ Base limpia y seed completo.',
  `  Cuenta      ${account.email}`,
  `  Proyecto    ${armot.name} (${armot.id})`,
  `  publicKey   ${armot.publicKey}`,
  `  Demo        ${origin}/s/${DEMO_PUBLIC_ID}`,
  `  Panel       ${origin}/app/${armot.id}`,
  '',
].join('\n'))
