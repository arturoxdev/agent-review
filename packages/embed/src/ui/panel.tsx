/**
 * §7·A4 — Panel de la pantalla actual (320px, máx 60vh, anclado sobre la bolita)
 * §7·A5 — Estados de envío
 * §7·A7 — Banda de error dentro del panel
 */

import type { JSX } from 'preact'

import type { StoredAnnotation } from '../storage'
import type { ErrorCode } from '../api'
import { ERRORS } from '../strings'
import { cx, plural } from '../util'
import { AnnotationMarker } from './marker'
import { Button, Surface } from './primitives'

export type SendPhase = 'idle' | 'capturing' | 'uploading'

export interface PanelProps {
  annotations: StoredAnnotation[]
  entryCount: number
  hasSession: boolean
  phase: SendPhase
  /** 0..1, progreso REAL del PUT del snapshot. */
  progress: number
  error: ErrorCode | null
  reducedMotion: boolean
  style: JSX.CSSProperties
  onHover: (id: string | null) => void
  onEdit: (id: string) => void
  onDelete: (id: string) => void
  onSend: () => void
  onFinish: () => void
  onErrorAction: (code: ErrorCode) => void
  onClose: () => void
}

function firstTwoLines(body: string): string {
  return body.split('\n').slice(0, 2).join(' ')
}

function ErrorBand({
  code,
  onAction,
}: {
  code: ErrorCode
  onAction: () => void
}): JSX.Element {
  const copy = ERRORS[code]
  return (
    <div
      role="alert"
      class="mx-3 mb-2 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive"
    >
      <p>{copy.message}</p>
      {copy.action !== undefined ? (
        <div class="mt-1.5">
          {copy.href !== undefined ? (
            <a
              href={copy.href}
              target="_blank"
              rel="noreferrer noopener"
              class="font-medium underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {copy.action}
            </a>
          ) : (
            <Button variant="outline" size="sm" onClick={onAction}>
              {copy.action}
            </Button>
          )}
        </div>
      ) : null}
    </div>
  )
}

function SendingState({
  phase,
  progress,
  reducedMotion,
}: {
  phase: Exclude<SendPhase, 'idle'>
  progress: number
  reducedMotion: boolean
}): JSX.Element {
  const percent = Math.round(progress * 100)
  const text = phase === 'capturing' ? 'Capturando pantalla…' : `Subiendo… ${percent}%`

  return (
    <div class="w-full" aria-live="polite">
      <div class="flex h-8 items-center justify-center gap-2 rounded-md bg-primary text-sm font-medium text-primary-foreground">
        {phase === 'capturing' && !reducedMotion ? (
          <svg class="h-3.5 w-3.5 animate-spin" viewBox="0 0 16 16" aria-hidden="true">
            <circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="2" fill="none" opacity="0.3" />
            <path d="M8 2a6 6 0 0 1 6 6" stroke="currentColor" stroke-width="2" fill="none" />
          </svg>
        ) : null}
        <span>{text}</span>
      </div>
      <div class="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-muted">
        <div
          class="h-full bg-signal transition-[width]"
          style={{
            width:
              phase === 'uploading'
                ? `${percent}%`
                : reducedMotion
                  ? '100%'
                  : '35%',
            opacity: phase === 'capturing' && reducedMotion ? 0.4 : 1,
          }}
        />
      </div>
    </div>
  )
}

export function Panel(props: PanelProps): JSX.Element {
  const {
    annotations,
    entryCount,
    hasSession,
    phase,
    progress,
    error,
    reducedMotion,
    style,
    onHover,
    onEdit,
    onDelete,
    onSend,
    onFinish,
    onErrorAction,
    onClose,
  } = props

  return (
    <Surface
      role="dialog"
      aria-label="Panel de la pantalla actual"
      style={style}
      class="absolute flex w-80 max-w-[calc(100vw-16px)] flex-col overflow-hidden"
      onKeyDown={(event: JSX.TargetedKeyboardEvent<HTMLDivElement>) => {
        if (event.key === 'Escape') {
          event.stopPropagation()
          onClose()
        }
      }}
    >
      <header class="flex items-baseline justify-between gap-2 border-b border-border px-3 py-2">
        <h2 class="text-sm font-medium">Pantalla actual</h2>
        <span class="font-mono text-xs text-muted-foreground tabular-nums">
          {plural(annotations.length, 'comentario', 'comentarios')}
        </span>
      </header>

      <div class="max-h-[calc(60vh-116px)] min-h-0 flex-1 overflow-y-auto">
        {annotations.length === 0 ? (
          <p class="px-3 py-6 text-center text-xs text-muted-foreground">
            Todavía no hay comentarios en esta pantalla.
            <br />
            Señala un elemento para empezar.
          </p>
        ) : (
          <ul>
            {annotations.map((annotation) => (
              <li
                key={annotation.id}
                class="group flex items-start gap-2 border-b border-border/60 px-3 py-2 last:border-b-0 hover:bg-accent"
                onMouseEnter={() => onHover(annotation.id)}
                onMouseLeave={() => onHover(null)}
                onFocusIn={() => onHover(annotation.id)}
                onFocusOut={() => onHover(null)}
              >
                <AnnotationMarker
                  number={annotation.number}
                  label={`Comentario ${annotation.number}: ${annotation.body.slice(0, 60)}`}
                  onClick={() => onHover(annotation.id)}
                  class="mt-0.5 shrink-0"
                />
                <div class="min-w-0 flex-1">
                  <p class="line-clamp-2 text-xs leading-snug text-foreground">
                    {firstTwoLines(annotation.body)}
                  </p>
                  <p class="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
                    {annotation.target.selector}
                  </p>
                </div>
                <div class="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Editar comentario ${annotation.number}`}
                    onClick={() => onEdit(annotation.id)}
                  >
                    Editar
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Eliminar comentario ${annotation.number}`}
                    class="text-destructive"
                    onClick={() => onDelete(annotation.id)}
                  >
                    Eliminar
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error !== null ? <ErrorBand code={error} onAction={() => onErrorAction(error)} /> : null}

      <footer class="border-t border-border p-3">
        {phase === 'idle' ? (
          <Button block disabled={annotations.length === 0} onClick={onSend}>
            Enviar pantalla
          </Button>
        ) : (
          <SendingState phase={phase} progress={progress} reducedMotion={reducedMotion} />
        )}

        <div class="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span class={cx('font-mono tabular-nums', !hasSession && 'opacity-60')}>
            {hasSession
              ? `Sesión: ${plural(entryCount, 'pantalla enviada', 'pantallas enviadas')}`
              : 'Sesión: sin pantallas aún'}
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={!hasSession}
            onClick={onFinish}
            class="underline underline-offset-2"
          >
            Finalizar sesión
          </Button>
        </div>
      </footer>
    </Surface>
  )
}
