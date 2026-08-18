/**
 * §5 · Marcador de anotación — elemento firma del producto.
 * Idéntico al del viewer: círculo de 24px, `bg-signal`, mono, tabular.
 */

import type { JSX } from 'preact'

import { cx } from '../util'

export interface MarkerProps {
  number: number
  active?: boolean
  label?: string
  onClick?: () => void
  onFocus?: () => void
  onBlur?: () => void
  class?: string
}

export function AnnotationMarker({
  number,
  active = false,
  label,
  onClick,
  onFocus,
  onBlur,
  class: className,
}: MarkerProps): JSX.Element {
  return (
    <button
      type="button"
      aria-label={label ?? `Comentario ${number}`}
      aria-pressed={active}
      onClick={onClick}
      onFocus={onFocus}
      onBlur={onBlur}
      class={cx(
        'flex h-6 w-6 items-center justify-center rounded-full bg-signal text-signal-foreground',
        'font-mono text-xs font-semibold tabular-nums ring-2 ring-background',
        'transition-[transform,box-shadow] outline-none',
        'focus-visible:ring-4 focus-visible:ring-ring',
        active && 'ring-4 ring-signal-muted motion-safe:scale-110',
        onClick ? 'pointer-events-auto cursor-pointer' : 'pointer-events-none',
        className,
      )}
    >
      {number}
    </button>
  )
}
