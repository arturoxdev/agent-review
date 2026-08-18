'use client'

import * as React from 'react'

import { cn } from '@/lib/utils'

/** Primeras palabras del comentario para el `aria-label` (PRD §11). */
function firstWords(body: string, max = 6): string {
  const words = body.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return ''
  const head = words.slice(0, max).join(' ')
  return words.length > max ? `${head}…` : head
}

export type AnnotationMarkerProps = Omit<
  React.ComponentProps<'button'>,
  'children'
> & {
  /** El número que se pinta dentro del círculo. */
  number: number
  /** Estado activo: `scale-110` + halo. */
  active?: boolean
  /** Cuerpo del comentario; alimenta el `aria-label` accesible. */
  body?: string
}

/**
 * Marcador numerado de una anotación (PRD §5, elemento firma del producto).
 *
 * Círculo de 24px, `bg-signal`, número mono tabular. Es siempre un `<button>` con
 * `aria-label="Comentario N: …"`. Con `prefers-reduced-motion` no escala.
 */
export function AnnotationMarker({
  number,
  active = false,
  body,
  className,
  type = 'button',
  'aria-label': ariaLabel,
  ...props
}: AnnotationMarkerProps) {
  const summary = body === undefined ? '' : firstWords(body)
  const label =
    ariaLabel ?? (summary === '' ? `Comentario ${number}` : `Comentario ${number}: ${summary}`)

  return (
    <button
      type={type}
      data-slot="annotation-marker"
      data-active={active ? '' : undefined}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        'flex h-6 w-6 shrink-0 items-center justify-center rounded-full',
        'bg-signal text-signal-foreground font-mono text-xs font-semibold tabular-nums',
        'ring-2 ring-background transition-all duration-150 ease-out',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none',
        active && 'ring-4 ring-signal-muted motion-safe:scale-110',
        className,
      )}
      {...props}
    >
      {number}
    </button>
  )
}
