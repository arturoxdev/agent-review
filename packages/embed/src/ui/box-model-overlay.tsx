/**
 * §7·A2 — las cuatro capas del box model con la convención de Chrome DevTools:
 * margen naranja hacia afuera, borde amarillo, padding verde, contenido azul.
 * Más un contorno de 1px sólido `--signal` alrededor del border-box.
 *
 * Se pinta en coordenadas de viewport: el overlay vive en un contenedor
 * `position: fixed` del Shadow Root.
 */

import type { JSX } from 'preact'

import type { BoxModel } from '@punto/contracts'
import type { ViewportRect } from '../measure'

export interface BoxModelOverlayProps {
  /** Border-box en coordenadas de viewport. */
  rect: ViewportRect
  box: BoxModel
}

/** Contorno de señal persistente de un elemento ya anotado (§7·A3). */
export function SignalOutline({
  rect,
  dimmed = false,
}: {
  rect: ViewportRect
  dimmed?: boolean
}): JSX.Element {
  return (
    <div
      style={{
        position: 'absolute',
        top: `${rect.top}px`,
        left: `${rect.left}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        outline: '2px solid var(--signal)',
        opacity: dimmed ? 0.4 : 1,
      }}
    />
  )
}

function layer(
  top: number,
  left: number,
  width: number,
  height: number,
  color: string,
): JSX.CSSProperties {
  return {
    position: 'absolute',
    top: `${top}px`,
    left: `${left}px`,
    width: `${Math.max(0, width)}px`,
    height: `${Math.max(0, height)}px`,
    background: color,
  }
}

export function BoxModelOverlay({ rect, box }: BoxModelOverlayProps): JSX.Element {
  const { top, left, width, height } = rect
  const { padding, border, margin } = box

  const outline: JSX.CSSProperties = {
    position: 'absolute',
    top: `${top}px`,
    left: `${left}px`,
    width: `${width}px`,
    height: `${height}px`,
    outline: '1px solid var(--signal)',
    outlineOffset: '0px',
  }

  return (
    <div>
      <div
        style={layer(
          top - margin.top,
          left - margin.left,
          width + margin.left + margin.right,
          height + margin.top + margin.bottom,
          'var(--box-margin)',
        )}
      />
      <div style={layer(top, left, width, height, 'var(--box-border)')} />
      <div
        style={layer(
          top + border.top,
          left + border.left,
          width - border.left - border.right,
          height - border.top - border.bottom,
          'var(--box-padding)',
        )}
      />
      <div
        style={layer(
          top + border.top + padding.top,
          left + border.left + padding.left,
          width - border.left - border.right - padding.left - padding.right,
          height - border.top - border.bottom - padding.top - padding.bottom,
          'var(--box-content)',
        )}
      />
      <div style={outline} />
    </div>
  )
}
