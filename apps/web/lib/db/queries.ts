/**
 * Consultas que consume el API (PRD §4 «Endpoints que la UI consume» y §4.1).
 *
 * Todo lo que sale de aquí ya tiene la forma de los tipos de `@punto/contracts`:
 * fechas en ISO, `entries` ordenadas por `order`, `annotations` por `number`.
 * Las rutas no deberían tener que reordenar ni remapear nada.
 */
import type { Annotation, AnnotationTarget, Entry, Project, Session, SessionSummary, SnapshotStatus, Viewport } from '@punto/contracts'
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'

import { db } from './index'
import { accountId as newAccountId, annotationId as newAnnotationId, entryId as newEntryId, projectId as newProjectId, publicId as newPublicId, publicKey as newPublicKey, sessionId as newSessionId } from './ids'
import { accounts, annotations, entries, projects, sessions, type AccountRow, type AnnotationRow, type EntryRow } from './schema'

// ---------- errores de dominio ----------

/** La sesión del `publicId` no existe. El API responde 404. */
export class SessionNotFoundError extends Error {
  constructor(publicId: string) {
    super(`No existe la sesión ${publicId}`)
    this.name = 'SessionNotFoundError'
  }
}

/** La sesión ya se finalizó. El API responde 409 (PRD §4.1). */
export class SessionClosedError extends Error {
  constructor(publicId: string) {
    super(`La sesión ${publicId} ya se finalizó`)
    this.name = 'SessionClosedError'
  }
}

// ---------- helpers ----------

const UNIQUE_VIOLATION = '23505'

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === UNIQUE_VIOLATION
  )
}

/**
 * `timestamptz` en modo string llega como `2026-08-17 15:02:00+00`.
 * §4 pide ISO (`2026-08-17T15:02:00.000Z`), así que se normaliza aquí.
 */
function toIso(value: string): string {
  const normalized = value.includes('T') ? value : value.replace(' ', 'T')
  const withOffset = /([+-]\d{2})$/.test(normalized) ? `${normalized}:00` : normalized
  const parsed = new Date(withOffset)
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString()
}

function toIsoOrNull(value: string | null): string | null {
  return value === null ? null : toIso(value)
}

function nowIso(): string {
  return new Date().toISOString()
}

function toAnnotation(row: AnnotationRow): Annotation {
  return {
    id: row.id,
    number: row.number,
    body: row.body,
    target: row.target,
    createdAt: toIso(row.createdAt),
  }
}

function toEntry(row: EntryRow, entryAnnotations: Annotation[]): Entry {
  return {
    id: row.id,
    order: row.order,
    url: row.url,
    pageTitle: row.pageTitle,
    viewport: row.viewport,
    snapshotUrl: row.snapshotUrl,
    thumbnailUrl: row.thumbnailUrl,
    snapshotStatus: row.snapshotStatus,
    capturedAt: toIso(row.capturedAt),
    annotations: entryAnnotations,
  }
}

/** Carga las anotaciones de varias entries en una sola query y las agrupa. */
async function annotationsByEntry(entryIds: string[]): Promise<Map<string, Annotation[]>> {
  const grouped = new Map<string, Annotation[]>()
  if (entryIds.length === 0) return grouped

  const rows = await db
    .select()
    .from(annotations)
    .where(inArray(annotations.entryId, entryIds))
    .orderBy(asc(annotations.entryId), asc(annotations.number))

  for (const row of rows) {
    const bucket = grouped.get(row.entryId)
    if (bucket) bucket.push(toAnnotation(row))
    else grouped.set(row.entryId, [toAnnotation(row)])
  }
  return grouped
}

async function loadEntries(sessionRowId: string): Promise<Entry[]> {
  const rows = await db
    .select()
    .from(entries)
    .where(eq(entries.sessionId, sessionRowId))
    .orderBy(asc(entries.order))

  const grouped = await annotationsByEntry(rows.map((row) => row.id))
  return rows.map((row) => toEntry(row, grouped.get(row.id) ?? []))
}

async function loadEntry(id: string): Promise<Entry | null> {
  const [row] = await db.select().from(entries).where(eq(entries.id, id)).limit(1)
  if (!row) return null
  const grouped = await annotationsByEntry([row.id])
  return toEntry(row, grouped.get(row.id) ?? [])
}

// ---------- proyectos ----------

// ---------- cuentas ----------

export async function createAccount(email: string, passwordHash: string): Promise<AccountRow> {
  const [row] = await db
    .insert(accounts)
    .values({ id: newAccountId(), email, passwordHash, createdAt: nowIso() })
    .returning()

  if (!row) throw new Error('No se pudo crear la cuenta')
  return row
}

export async function getAccountByEmail(email: string): Promise<AccountRow | null> {
  const [row] = await db.select().from(accounts).where(eq(accounts.email, email)).limit(1)
  return row ?? null
}

export async function getAccountById(id: string): Promise<AccountRow | null> {
  const [row] = await db.select().from(accounts).where(eq(accounts.id, id)).limit(1)
  return row ?? null
}

export async function updateAccountPassword(id: string, passwordHash: string): Promise<boolean> {
  const [row] = await db
    .update(accounts)
    .set({ passwordHash })
    .where(eq(accounts.id, id))
    .returning({ id: accounts.id })
  return row !== undefined
}

/**
 * Subconsulta correlacionada para `Project['sessionCount']`.
 *
 * Los nombres van literales a propósito: al interpolar columnas dentro de `sql`
 * Drizzle las imprime SIN calificar con su tabla, y en una correlacionada eso
 * resuelve a la tabla equivocada. Si se renombra una tabla, ajustar aquí.
 */
const sessionCountExpr = sql<number>`(select count(*)::int from "sessions" where "sessions"."project_id" = "projects"."id")`

/** Proyectos de una Cuenta, ordenados por fecha de creación descendente. */
export async function listProjects(ownerId: string): Promise<Project[]> {
  const rows = await db
    .select({
      id: projects.id,
      name: projects.name,
      publicKey: projects.publicKey,
      createdAt: projects.createdAt,
      sessionCount: sessionCountExpr,
    })
    .from(projects)
    .where(eq(projects.ownerId, ownerId))
    .orderBy(desc(projects.createdAt))

  return rows.map((row) => ({ ...row, createdAt: toIso(row.createdAt) }))
}

/** El filtro doble evita confirmar que exista un proyecto de otra Cuenta. */
export async function getProjectById(id: string, ownerId: string): Promise<Project | null> {
  const [row] = await db
    .select({
      id: projects.id,
      name: projects.name,
      publicKey: projects.publicKey,
      createdAt: projects.createdAt,
      sessionCount: sessionCountExpr,
    })
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.ownerId, ownerId)))
    .limit(1)

  return row ? { ...row, createdAt: toIso(row.createdAt) } : null
}

/** Autenticación del embed: `x-api-key: pk_live_…` (PRD §4.1). */
export async function getProjectByPublicKey(key: string): Promise<Project | null> {
  const [row] = await db
    .select({
      id: projects.id,
      name: projects.name,
      publicKey: projects.publicKey,
      createdAt: projects.createdAt,
      sessionCount: sessionCountExpr,
    })
    .from(projects)
    .where(eq(projects.publicKey, key))
    .limit(1)

  return row ? { ...row, createdAt: toIso(row.createdAt) } : null
}

/** Creación desde la Server Action del Panel. */
export async function createProject(
  ownerId: string,
  name: string,
  options: { keyEnv?: 'live' | 'dev'; id?: string; publicKey?: string } = {},
): Promise<Project> {
  const [row] = await db
    .insert(projects)
    .values({
      id: options.id ?? newProjectId(),
      ownerId,
      name,
      publicKey: options.publicKey ?? newPublicKey(options.keyEnv ?? 'live'),
      createdAt: nowIso(),
    })
    .returning()

  if (!row) throw new Error('No se pudo crear el proyecto')
  return { id: row.id, name: row.name, publicKey: row.publicKey, createdAt: toIso(row.createdAt), sessionCount: 0 }
}

// ---------- sesiones ----------

/** `GET /api/sessions/:publicId` — el documento y, con `Accept: json`, la fuente del agente. */
export async function getSessionByPublicId(publicId: string): Promise<Session | null> {
  const [row] = await db
    .select({
      id: sessions.id,
      publicId: sessions.publicId,
      projectName: projects.name,
      title: sessions.title,
      status: sessions.status,
      createdAt: sessions.createdAt,
      closedAt: sessions.closedAt,
    })
    .from(sessions)
    .innerJoin(projects, eq(projects.id, sessions.projectId))
    .where(eq(sessions.publicId, publicId))
    .limit(1)

  if (!row) return null

  return {
    ...row,
    createdAt: toIso(row.createdAt),
    closedAt: toIsoOrNull(row.closedAt),
    entries: await loadEntries(row.id),
  }
}

/** Sesiones del detalle del Panel. Fecha descendente. */
export async function listSessionSummaries(projectId: string): Promise<SessionSummary[]> {
  const rows = await db
    .select({
      publicId: sessions.publicId,
      title: sessions.title,
      status: sessions.status,
      createdAt: sessions.createdAt,
      closedAt: sessions.closedAt,
      // Nombres literales por lo mismo que en `sessionCountExpr`.
      entryCount: sql<number>`(select count(*)::int from "entries" where "entries"."session_id" = "sessions"."id")`,
      annotationCount: sql<number>`(
        select count(*)::int
        from "annotations"
        join "entries" on "annotations"."entry_id" = "entries"."id"
        where "entries"."session_id" = "sessions"."id"
      )`,
    })
    .from(sessions)
    .where(eq(sessions.projectId, projectId))
    .orderBy(desc(sessions.createdAt))

  return rows.map((row) => ({
    ...row,
    createdAt: toIso(row.createdAt),
    closedAt: toIsoOrNull(row.closedAt),
  }))
}

// ---------- captura (PRD §4.1) ----------

/** Anotación tal como llega del embed: sin id de servidor. */
export type AnnotationInput = {
  /** Si no viene, se numera 1..n en el orden recibido. */
  number?: number
  body: string
  target: AnnotationTarget
  createdAt?: string
}

/** Lo que trae un `POST /api/sessions` o `POST /api/sessions/:publicId/entries`. */
export type EntryInput = {
  url: string
  pageTitle: string
  viewport: Viewport
  annotations: AnnotationInput[]
  /** URLs de lectura ya asignadas (UUID) por la ruta; el blob todavía no existe. */
  snapshotUrl?: string | null
  thumbnailUrl?: string | null
  /** Header `Idempotency-Key` de esta pantalla. */
  idempotencyKey?: string | null
  capturedAt?: string
}

/** `created: false` = se reusó lo que ya existía por `Idempotency-Key` (solo re-firmar). */
export type EntryResult = { entry: Entry; created: boolean }
export type SessionWithEntryResult = { session: Session; entry: Entry; created: boolean }

async function insertAnnotations(entryRowId: string, inputs: AnnotationInput[]): Promise<Annotation[]> {
  if (inputs.length === 0) return []

  const rows = await db
    .insert(annotations)
    .values(
      inputs.map((input, position) => ({
        id: newAnnotationId(),
        entryId: entryRowId,
        number: input.number ?? position + 1,
        body: input.body,
        target: input.target,
        createdAt: input.createdAt ?? nowIso(),
      })),
    )
    .returning()

  return rows.map(toAnnotation).sort((a, b) => a.number - b.number)
}

async function insertEntry(sessionRowId: string, order: number, input: EntryInput): Promise<Entry> {
  const [row] = await db
    .insert(entries)
    .values({
      id: newEntryId(),
      sessionId: sessionRowId,
      order,
      url: input.url,
      pageTitle: input.pageTitle,
      viewport: input.viewport,
      snapshotUrl: input.snapshotUrl ?? null,
      thumbnailUrl: input.thumbnailUrl ?? null,
      snapshotStatus: 'pending',
      idempotencyKey: input.idempotencyKey ?? null,
      capturedAt: input.capturedAt ?? nowIso(),
    })
    .returning()

  if (!row) throw new Error('No se pudo crear la entry')
  return toEntry(row, await insertAnnotations(row.id, input.annotations))
}

async function findEntryByIdempotencyKey(sessionRowId: string, key: string): Promise<Entry | null> {
  const [row] = await db
    .select()
    .from(entries)
    .where(and(eq(entries.sessionId, sessionRowId), eq(entries.idempotencyKey, key)))
    .limit(1)

  if (!row) return null
  const grouped = await annotationsByEntry([row.id])
  return toEntry(row, grouped.get(row.id) ?? [])
}

async function findSessionByIdempotencyKey(projectId: string, key: string): Promise<Session | null> {
  const [row] = await db
    .select({ publicId: sessions.publicId })
    .from(sessions)
    .where(and(eq(sessions.projectId, projectId), eq(sessions.idempotencyKey, key)))
    .limit(1)

  return row ? await getSessionByPublicId(row.publicId) : null
}

/**
 * `POST /api/sessions`: crea la sesión `open` y su primera entry (`pending`).
 *
 * Con la misma `Idempotency-Key` devuelve lo ya creado (`created: false`) para que
 * la ruta solo re-firme las URLs de subida caducadas, sin duplicar nada (§4.1).
 */
export async function createSessionWithEntry(params: {
  projectId: string
  title?: string
  entry: EntryInput
  /** Default: la `Idempotency-Key` de la primera pantalla. */
  idempotencyKey?: string | null
}): Promise<SessionWithEntryResult> {
  const idempotencyKey = params.idempotencyKey ?? params.entry.idempotencyKey ?? null

  if (idempotencyKey) {
    const existing = await findSessionByIdempotencyKey(params.projectId, idempotencyKey)
    const firstEntry = existing?.entries[0]
    if (existing && firstEntry) return { session: existing, entry: firstEntry, created: false }
  }

  const title = params.title?.trim() || params.entry.pageTitle || 'Review sin título'
  const values = {
    id: newSessionId(),
    projectId: params.projectId,
    publicId: newPublicId(),
    title,
    status: 'open' as const,
    idempotencyKey,
    createdAt: nowIso(),
  }

  try {
    const [row] = await db.insert(sessions).values(values).returning()
    if (!row) throw new Error('No se pudo crear la sesión')

    const entry = await insertEntry(row.id, 1, params.entry)
    const session = await getSessionByPublicId(row.publicId)
    if (!session) throw new Error('No se pudo leer la sesión recién creada')
    return { session, entry, created: true }
  } catch (error) {
    // Carrera con otro POST que traía la misma Idempotency-Key.
    if (idempotencyKey && isUniqueViolation(error)) {
      const existing = await findSessionByIdempotencyKey(params.projectId, idempotencyKey)
      const firstEntry = existing?.entries[0]
      if (existing && firstEntry) return { session: existing, entry: firstEntry, created: false }
    }
    throw error
  }
}

/**
 * `POST /api/sessions/:publicId/entries`: pantallas siguientes.
 *
 * Lanza `SessionNotFoundError` (404) o `SessionClosedError` (409). Con una
 * `Idempotency-Key` ya vista devuelve la misma entry con `created: false`.
 */
export async function addEntry(publicId: string, input: EntryInput): Promise<EntryResult> {
  const [session] = await db
    .select({ id: sessions.id, status: sessions.status })
    .from(sessions)
    .where(eq(sessions.publicId, publicId))
    .limit(1)

  if (!session) throw new SessionNotFoundError(publicId)
  if (session.status === 'closed') throw new SessionClosedError(publicId)

  if (input.idempotencyKey) {
    const existing = await findEntryByIdempotencyKey(session.id, input.idempotencyKey)
    if (existing) return { entry: existing, created: false }
  }

  const [{ maxOrder = 0 } = { maxOrder: 0 }] = await db
    .select({ maxOrder: sql<number>`coalesce(max("entries"."order"), 0)::int` })
    .from(entries)
    .where(eq(entries.sessionId, session.id))

  try {
    return { entry: await insertEntry(session.id, maxOrder + 1, input), created: true }
  } catch (error) {
    if (input.idempotencyKey && isUniqueViolation(error)) {
      const existing = await findEntryByIdempotencyKey(session.id, input.idempotencyKey)
      if (existing) return { entry: existing, created: false }
    }
    throw error
  }
}

/**
 * Proyecto dueño de una sesión.
 *
 * Los writes del embed llegan con `x-api-key` (= un proyecto) y un `publicId`. Sin
 * este cruce, cualquier clave válida podría escribir en la sesión de otro proyecto
 * con solo conocer su `publicId`.
 *
 * @returns el `projectId` dueño, o `null` si no existe la sesión.
 */
export async function getSessionOwnerProjectId(publicId: string): Promise<string | null> {
  const [row] = await db
    .select({ projectId: sessions.projectId })
    .from(sessions)
    .where(eq(sessions.publicId, publicId))
    .limit(1)

  return row?.projectId ?? null
}

/**
 * Reasigna los UUID de blob de una entry.
 *
 * Se usa al re-firmar un POST idempotente cuya entry perdió el `snapshotUrl` en un
 * `PATCH failed`: el reintento sube a un UUID nuevo, y ese UUID tiene que quedar
 * persistido o el `PATCH ready` posterior dejaría la entry `ready` sin snapshot.
 */
export async function setEntryBlobUrls(
  entryId: string,
  urls: { snapshotUrl?: string; thumbnailUrl?: string },
): Promise<void> {
  if (urls.snapshotUrl === undefined && urls.thumbnailUrl === undefined) return
  await db.update(entries).set(urls).where(eq(entries.id, entryId))
}

/**
 * `PATCH /api/sessions/:publicId/entries/:entryId` — `ready` / `failed` (§4.1).
 *
 * `failed` limpia `snapshotUrl` (el blob no llegó). Si el thumbnail falló, la ruta
 * pasa `thumbnailUrl: null` y la entry queda `ready` igual.
 * Devuelve `null` si la entry no pertenece a esa sesión.
 */
export async function patchEntryStatus(
  publicId: string,
  entryId: string,
  snapshotStatus: SnapshotStatus,
  options: { thumbnailUrl?: string | null } = {},
): Promise<Entry | null> {
  const [session] = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(eq(sessions.publicId, publicId))
    .limit(1)

  if (!session) throw new SessionNotFoundError(publicId)

  const patch: { snapshotStatus: SnapshotStatus; snapshotUrl?: null; thumbnailUrl?: string | null } = { snapshotStatus }
  if (snapshotStatus === 'failed') patch.snapshotUrl = null
  if ('thumbnailUrl' in options) patch.thumbnailUrl = options.thumbnailUrl ?? null

  const [row] = await db
    .update(entries)
    .set(patch)
    .where(and(eq(entries.id, entryId), eq(entries.sessionId, session.id)))
    .returning({ id: entries.id })

  return row ? await loadEntry(row.id) : null
}

/**
 * `PATCH /api/sessions/:publicId` — finalizar sesión (PRD §7 A6).
 * Idempotente: cerrar una sesión ya cerrada no mueve `closedAt`.
 */
export async function closeSession(publicId: string, title?: string): Promise<Session | null> {
  const [row] = await db
    .update(sessions)
    .set({
      status: 'closed',
      closedAt: sql`coalesce(${sessions.closedAt}, now())`,
      ...(title?.trim() ? { title: title.trim() } : {}),
    })
    .where(eq(sessions.publicId, publicId))
    .returning({ publicId: sessions.publicId })

  return row ? await getSessionByPublicId(row.publicId) : null
}
