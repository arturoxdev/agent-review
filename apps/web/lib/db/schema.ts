/**
 * Esquema Drizzle de Punto (PRD §4 y §4.1).
 *
 * Jerarquía: project → session → entry → annotation, con `onDelete: 'cascade'`
 * hacia abajo. Los timestamps son `timestamptz` en modo string; `queries.ts` los
 * normaliza a ISO antes de devolverlos, que es lo que pide §4.
 */
import type { AnnotationTarget, Viewport } from '@punto/contracts'
import { index, integer, jsonb, pgEnum, pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core'

// ---------- enums ----------

/** PRD §4: `Session['status']`. */
export const sessionStatusEnum = pgEnum('session_status', ['open', 'closed'])

/** PRD §4: `Entry['snapshotStatus']`. */
export const snapshotStatusEnum = pgEnum('snapshot_status', ['ready', 'pending', 'failed'])

// ---------- accounts ----------

/** Una cuenta es el único dueño de sus proyectos (spec acceso §2.1). */
export const accounts = pgTable('accounts', {
  /** `acc_…` */
  id: text('id').primaryKey(),
  /** Siempre normalizado con trim + minúsculas antes de persistir. */
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
})

// ---------- projects ----------

/** Un proyecto = un dueño y una API key pública (PRD §9 + spec acceso §2.1). */
export const projects = pgTable(
  'projects',
  {
    /** `prj_…` */
    id: text('id').primaryKey(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** `pk_live_…` en prod, `pk_dev_…` en local. Pública, no es un secreto. */
    publicKey: text('public_key').notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  },
  (table) => [index('projects_owner_id_created_at_idx').on(table.ownerId, table.createdAt)],
)

// ---------- sessions ----------

/** Una sesión = el documento público `/s/:publicId`. */
export const sessions = pgTable(
  'sessions',
  {
    /** `ses_…` */
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    /** Id secreto de la URL pública, 22 chars URL-safe. */
    publicId: text('public_id').notNull().unique(),
    title: text('title').notNull(),
    status: sessionStatusEnum('status').notNull().default('open'),
    /**
     * `Idempotency-Key` del primer `POST /api/sessions`. Con el unique de abajo,
     * repetir ese POST re-firma las URLs de subida sin crear una segunda sesión (§4.1).
     * NULL en sesiones creadas desde el panel (Postgres considera los NULL distintos).
     */
    idempotencyKey: text('idempotency_key'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
    closedAt: timestamp('closed_at', { withTimezone: true, mode: 'string' }),
  },
  (table) => [
    unique('sessions_project_id_idempotency_key_unique').on(table.projectId, table.idempotencyKey),
    index('sessions_public_id_idx').on(table.publicId),
    index('sessions_project_id_created_at_idx').on(table.projectId, table.createdAt),
  ],
)

// ---------- entries ----------

/** Una pantalla capturada = un "Enviar" del embed. */
export const entries = pgTable(
  'entries',
  {
    /** `ent_…` */
    id: text('id').primaryKey(),
    sessionId: text('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    /** 1, 2, 3… dentro de la sesión. */
    order: integer('order').notNull(),
    url: text('url').notNull(),
    pageTitle: text('page_title').notNull(),
    viewport: jsonb('viewport').$type<Viewport>().notNull(),
    /** URL de lectura del snapshot rrweb gzip. NULL mientras sube o si falló. */
    snapshotUrl: text('snapshot_url'),
    /** URL de lectura del thumbnail. NULL si no se pudo generar. */
    thumbnailUrl: text('thumbnail_url'),
    snapshotStatus: snapshotStatusEnum('snapshot_status').notNull().default('pending'),
    /** `Idempotency-Key` de esta pantalla: re-POST = re-firma, no duplica entry (§4.1). */
    idempotencyKey: text('idempotency_key'),
    capturedAt: timestamp('captured_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  },
  (table) => [
    unique('entries_session_id_idempotency_key_unique').on(table.sessionId, table.idempotencyKey),
    unique('entries_session_id_order_unique').on(table.sessionId, table.order),
    index('entries_session_id_order_idx').on(table.sessionId, table.order),
  ],
)

// ---------- annotations ----------

/** Un comentario anclado a un elemento de una pantalla. */
export const annotations = pgTable(
  'annotations',
  {
    /** `ann_…` */
    id: text('id').primaryKey(),
    entryId: text('entry_id')
      .notNull()
      .references(() => entries.id, { onDelete: 'cascade' }),
    /** 1, 2, 3… único dentro de la entry. Es lo que se pinta en el marcador. */
    number: integer('number').notNull(),
    body: text('body').notNull(),
    /** `AnnotationTarget` completo: selector, nodeId, rect, boxModel, fiber… (§4). */
    target: jsonb('target').$type<AnnotationTarget>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  },
  (table) => [
    unique('annotations_entry_id_number_unique').on(table.entryId, table.number),
    index('annotations_entry_id_number_idx').on(table.entryId, table.number),
  ],
)

// ---------- tipos de fila ----------

export type ProjectRow = typeof projects.$inferSelect
export type NewProjectRow = typeof projects.$inferInsert
export type AccountRow = typeof accounts.$inferSelect
export type NewAccountRow = typeof accounts.$inferInsert
export type SessionRow = typeof sessions.$inferSelect
export type NewSessionRow = typeof sessions.$inferInsert
export type EntryRow = typeof entries.$inferSelect
export type NewEntryRow = typeof entries.$inferInsert
export type AnnotationRow = typeof annotations.$inferSelect
export type NewAnnotationRow = typeof annotations.$inferInsert

export const schema = { accounts, projects, sessions, entries, annotations }
