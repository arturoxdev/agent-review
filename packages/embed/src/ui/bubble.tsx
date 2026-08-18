/**
 * §7·A1 — Bolita en reposo.
 *
 * 48×48, `rounded-full`, `bg-primary`, borde 1px, sombra discreta, icono de
 * punto relleno dentro de un círculo. Arrastrable; al soltar se imanta a la
 * esquina más cercana y la esquina se persiste en `localStorage`.
 * Con sesión abierta, badge `bg-signal` con el número de pantallas enviadas.
 */

import type { JSX } from 'preact'
import { useRef, useState } from 'preact/hooks'

import type { BubbleCorner } from '../storage'
import { APP_LABEL } from '../strings'
import { clamp, cx, plural } from '../util'

export const BUBBLE_SIZE = 48
export const BUBBLE_MARGIN = 24

export interface BubblePosition {
  top: number
  left: number
}

export function cornerPosition(corner: BubbleCorner): BubblePosition {
  const maxLeft = Math.max(0, window.innerWidth - BUBBLE_SIZE - BUBBLE_MARGIN)
  const maxTop = Math.max(0, window.innerHeight - BUBBLE_SIZE - BUBBLE_MARGIN)
  return {
    top: corner === 'tl' || corner === 'tr' ? BUBBLE_MARGIN : maxTop,
    left: corner === 'tl' || corner === 'bl' ? BUBBLE_MARGIN : maxLeft,
  }
}

function nearestCorner(position: BubblePosition): BubbleCorner {
  const cx0 = position.left + BUBBLE_SIZE / 2
  const cy0 = position.top + BUBBLE_SIZE / 2
  const right = cx0 > window.innerWidth / 2
  const bottom = cy0 > window.innerHeight / 2
  return bottom ? (right ? 'br' : 'bl') : right ? 'tr' : 'tl'
}

export interface BubbleProps {
  corner: BubbleCorner
  entryCount: number
  hasSession: boolean
  active: boolean
  onActivate: () => void
  onPanel: () => void
  onCornerChange: (corner: BubbleCorner) => void
  buttonRef?: (el: HTMLButtonElement | null) => void
}

export function Bubble({
  corner,
  entryCount,
  hasSession,
  active,
  onActivate,
  onPanel,
  onCornerChange,
  buttonRef,
}: BubbleProps): JSX.Element {
  const [drag, setDrag] = useState<BubblePosition | null>(null)
  const origin = useRef<{ x: number; y: number; top: number; left: number } | null>(null)
  const moved = useRef(false)

  const resting = cornerPosition(corner)
  const position = drag ?? resting

  // El arrastre se maneja con captura de puntero en el propio nodo: registrar
  // los listeners en un efecto llegaría tarde para un click sintético rápido.
  const endDrag = (): void => {
    const current = origin.current
    origin.current = null
    setDrag((position) => {
      if (position && current) onCornerChange(nearestCorner(position))
      return null
    })
  }

  const label = hasSession
    ? `${APP_LABEL} — ${plural(entryCount, 'pantalla', 'pantallas')} en la sesión`
    : `${APP_LABEL} — anotar esta pantalla`

  return (
    <button
      type="button"
      ref={buttonRef}
      aria-label={label}
      aria-pressed={active}
      title={label}
      style={{ top: `${position.top}px`, left: `${position.left}px` }}
      onPointerDown={(event: JSX.TargetedPointerEvent<HTMLButtonElement>) => {
        if (event.button !== 0) return
        moved.current = false
        origin.current = {
          x: event.clientX,
          y: event.clientY,
          top: position.top,
          left: position.left,
        }
        event.currentTarget.setPointerCapture(event.pointerId)
        setDrag(position)
      }}
      onPointerMove={(event: JSX.TargetedPointerEvent<HTMLButtonElement>) => {
        const start = origin.current
        if (!start) return
        const dx = event.clientX - start.x
        const dy = event.clientY - start.y
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved.current = true
        setDrag({
          top: clamp(start.top + dy, 0, window.innerHeight - BUBBLE_SIZE),
          left: clamp(start.left + dx, 0, window.innerWidth - BUBBLE_SIZE),
        })
      }}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onLostPointerCapture={endDrag}
      onClick={() => {
        if (moved.current) return
        if (active) onPanel()
        else onActivate()
      }}
      onContextMenu={(event: JSX.TargetedMouseEvent<HTMLButtonElement>) => {
        event.preventDefault()
        onPanel()
      }}
      class={cx(
        'pointer-events-auto absolute flex h-12 w-12 touch-none items-center justify-center',
        'rounded-full border border-border bg-primary text-primary-foreground',
        'shadow-[0_1px_3px_rgb(0_0_0/0.18)] transition-[border-color,box-shadow,transform]',
        'outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        drag ? 'cursor-grabbing' : 'cursor-grab',
        'motion-safe:hover:scale-105 motion-reduce:hover:border-signal',
        active && 'border-signal',
      )}
    >
      {/* Icono: punto relleno dentro de un círculo. */}
      <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true" fill="none">
        <circle cx="11" cy="11" r="9" stroke="currentColor" stroke-width="1.5" opacity="0.55" />
        <circle cx="11" cy="11" r="4" fill="currentColor" />
      </svg>

      {hasSession ? (
        <span
          class={cx(
            'absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full',
            'bg-signal px-1 font-mono text-[11px] font-semibold tabular-nums text-signal-foreground',
            'ring-2 ring-background',
          )}
        >
          {entryCount}
        </span>
      ) : null}
    </button>
  )
}
