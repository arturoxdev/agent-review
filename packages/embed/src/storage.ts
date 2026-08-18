/**
 * Persistencia local (§4.1, §7·A7).
 *
 * «Las anotaciones NUNCA se pierden ante un error»: viven en `localStorage`
 * por URL junto con la `Idempotency-Key` de esa pantalla, y se rehidratan al
 * recargar. La sesión (publicId + conteos) vive aparte porque cruza pantallas.
 */

import type { ResolvedBy } from '@punto/contracts'

import { uuid } from './util'

const NS = 'punto:v1'

/**
 * Parte del `AnnotationTarget` que se conoce al anotar. `nodeId`, `rect` y
 * `boxModel` NO se guardan: se miden sobre el árbol del snapshot al enviar (§4.1·3).
 */
export interface StoredTarget {
  selector: string
  tag: string
  text: string
  component?: string
  componentStack?: string[]
  source?: string
  resolvedBy: ResolvedBy
}

export interface StoredAnnotation {
  id: string
  number: number
  body: string
  createdAt: string
  target: StoredTarget
}

export interface ScreenState {
  /** Un uuid por pantalla. Se reusa en los reintentos: no duplica entry. */
  idempotencyKey: string
  annotations: StoredAnnotation[]
}

export interface SessionState {
  publicId: string
  /** Pantallas ya enviadas. Alimenta el badge de la bolita (§7·A1). */
  entryCount: number
  /** Comentarios ya enviados. Alimenta el resumen del diálogo (§7·A6). */
  annotationCount: number
}

export type BubbleCorner = 'tl' | 'tr' | 'bl' | 'br'

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw === null ? null : (JSON.parse(raw) as T)
  } catch {
    return null
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* modo privado o cuota llena: seguimos en memoria. */
  }
}

function drop(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    /* noop */
  }
}

/** Una pantalla = una URL (sin query ni hash: el mismo formulario es la misma pantalla). */
function screenKey(): string {
  return `${NS}:screen:${location.origin}${location.pathname}`
}

export function loadScreen(): ScreenState {
  const stored = read<Partial<ScreenState>>(screenKey())
  const annotations = Array.isArray(stored?.annotations) ? stored.annotations : []
  const idempotencyKey =
    typeof stored?.idempotencyKey === 'string' && stored.idempotencyKey !== ''
      ? stored.idempotencyKey
      : uuid()
  return { idempotencyKey, annotations }
}

export function saveScreen(state: ScreenState): void {
  write(screenKey(), state)
}

/** Tras un envío exitoso: se limpian las anotaciones y se estrena Idempotency-Key. */
export function resetScreen(): ScreenState {
  const fresh: ScreenState = { idempotencyKey: uuid(), annotations: [] }
  saveScreen(fresh)
  return fresh
}

export function loadSession(): SessionState | null {
  const stored = read<Partial<SessionState>>(`${NS}:session`)
  if (!stored || typeof stored.publicId !== 'string' || stored.publicId === '') return null
  return {
    publicId: stored.publicId,
    entryCount: typeof stored.entryCount === 'number' ? stored.entryCount : 0,
    annotationCount: typeof stored.annotationCount === 'number' ? stored.annotationCount : 0,
  }
}

export function saveSession(state: SessionState | null): void {
  if (state === null) drop(`${NS}:session`)
  else write(`${NS}:session`, state)
}

export function loadCorner(): BubbleCorner {
  const stored = read<BubbleCorner>(`${NS}:bubble`)
  return stored === 'tl' || stored === 'tr' || stored === 'bl' || stored === 'br' ? stored : 'br'
}

export function saveCorner(corner: BubbleCorner): void {
  write(`${NS}:bubble`, corner)
}
