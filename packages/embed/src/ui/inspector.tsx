/**
 * §7·A2 — Modo inspección.
 *
 * Capa a pantalla completa con `cursor: crosshair` que intercepta el puntero
 * (así un click no navega la página anfitriona) y resuelve el elemento de
 * debajo con `elementsFromPoint`, ignorando los nodos del propio embed.
 *
 * `Esc` sale. `Tab` / `Shift+Tab` recorren elementos anotables sin mouse —
 * requisito de accesibilidad del §11, no opcional.
 */

import type { JSX } from 'preact'

import { cx } from '../util'
import type { ViewportRect } from '../measure'

export interface InspectorLayerProps {
  onMove: (x: number, y: number) => void
  onPick: (x: number, y: number) => void
  frozen: boolean
}

export function InspectorLayer({ onMove, onPick, frozen }: InspectorLayerProps): JSX.Element {
  return (
    <div
      class={cx('punto-layer', frozen ? '' : 'pointer-events-auto cursor-crosshair')}
      onMouseMove={(event: JSX.TargetedMouseEvent<HTMLDivElement>) => {
        onMove(event.clientX, event.clientY)
      }}
      onClick={(event: JSX.TargetedMouseEvent<HTMLDivElement>) => {
        event.preventDefault()
        event.stopPropagation()
        onPick(event.clientX, event.clientY)
      }}
    />
  )
}

export interface InspectorLabelProps {
  rect: ViewportRect
  text: string
}

/** Etiqueta flotante: `button.px-4 · PrimaryButton · 96 × 40`. */
export function InspectorLabel({ rect, text }: InspectorLabelProps): JSX.Element {
  const above = rect.top >= 26
  const top = above ? rect.top - 24 : Math.min(rect.top + rect.height + 4, window.innerHeight - 24)
  const left = Math.max(4, Math.min(rect.left, window.innerWidth - 8))

  return (
    <div
      style={{ top: `${top}px`, left: `${left}px`, maxWidth: `${window.innerWidth - 16}px` }}
      class={cx(
        'absolute z-10 truncate rounded-md bg-primary px-1.5 py-0.5',
        'font-mono text-xs whitespace-pre text-primary-foreground',
      )}
    >
      {text}
    </div>
  )
}

/** Barra de ayuda del modo inspección, centrada abajo. */
export function InspectorHint(): JSX.Element {
  return (
    <div
      class={cx(
        'absolute bottom-6 left-1/2 -translate-x-1/2 rounded-md border border-border',
        'bg-card/95 px-2.5 py-1.5 font-mono text-xs text-muted-foreground shadow-lg',
      )}
    >
      Click para comentar · Tab recorre · Esc sale
    </div>
  )
}
