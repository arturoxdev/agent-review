/**
 * §7·A5·3 — Toast propio del embed, encima de la bolita.
 * `✓ Pantalla 3 agregada a la sesión`. Se autodescarta a los 3 s.
 */

import type { JSX } from 'preact'

import { cx } from '../util'

export interface ToastProps {
  message: string
  style: JSX.CSSProperties
}

export function Toast({ message, style }: ToastProps): JSX.Element {
  return (
    <div
      role="status"
      aria-live="polite"
      style={style}
      class={cx(
        'pointer-events-none absolute flex items-center gap-1.5 rounded-md border border-border',
        'bg-card px-2.5 py-1.5 text-xs text-card-foreground shadow-lg',
      )}
    >
      <span class="text-signal">✓</span>
      <span>{message}</span>
    </div>
  )
}
