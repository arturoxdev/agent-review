import type { BoxModel } from '@punto/contracts'

import { cn } from '@/lib/utils'

export type BoxModelOverlayProps = {
  box: BoxModel
  /**
   * Factor de escala del frame (`k` de §8). Multiplica coordenadas y grosores,
   * de modo que el overlay se puede pintar encima de un snapshot escalado.
   */
  scale?: number
  /**
   * Si es `true`, el overlay se posiciona con las coordenadas absolutas de
   * `box.content`. Si es `false`, se coloca en el origen del contenedor
   * (útil para pintarlo como diagrama dentro de una tarjeta).
   */
  positioned?: boolean
  className?: string
}

/**
 * Las cuatro capas del box model con la convención de Chrome DevTools
 * (margen naranja → borde amarillo → padding verde → contenido azul), PRD §5.
 */
export function BoxModelOverlay({
  box,
  scale = 1,
  positioned = true,
  className,
}: BoxModelOverlayProps) {
  const { content, padding, border, margin } = box
  const s = (value: number): number => value * scale

  const width =
    s(content.w + padding.left + padding.right + border.left + border.right + margin.left + margin.right)
  const height =
    s(content.h + padding.top + padding.bottom + border.top + border.bottom + margin.top + margin.bottom)

  const left = positioned
    ? s(content.x - padding.left - border.left - margin.left)
    : 0
  const top = positioned ? s(content.y - padding.top - border.top - margin.top) : 0

  return (
    <div
      data-slot="box-model-overlay"
      aria-hidden
      className={cn('pointer-events-none absolute bg-box-margin', className)}
      style={{
        left,
        top,
        width,
        height,
        boxSizing: 'border-box',
        paddingTop: s(margin.top),
        paddingRight: s(margin.right),
        paddingBottom: s(margin.bottom),
        paddingLeft: s(margin.left),
      }}
    >
      <div
        className="h-full w-full bg-box-border"
        style={{
          boxSizing: 'border-box',
          paddingTop: s(border.top),
          paddingRight: s(border.right),
          paddingBottom: s(border.bottom),
          paddingLeft: s(border.left),
        }}
      >
        <div
          className="h-full w-full bg-box-padding"
          style={{
            boxSizing: 'border-box',
            paddingTop: s(padding.top),
            paddingRight: s(padding.right),
            paddingBottom: s(padding.bottom),
            paddingLeft: s(padding.left),
          }}
        >
          <div className="h-full w-full bg-box-content" />
        </div>
      </div>
    </div>
  )
}
