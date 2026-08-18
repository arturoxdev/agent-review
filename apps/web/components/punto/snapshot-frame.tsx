'use client'

import * as React from 'react'
import { ExternalLinkIcon } from 'lucide-react'
import type { Annotation, Viewport } from '@punto/contracts'

import { AnnotationMarker } from '@/components/punto/annotation-marker'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

/**
 * El nodo serializado de rrweb. `rrweb-snapshot` lo tipa desde `@rrweb/types`,
 * que no es una dependencia directa; aquí solo se transporta, nunca se inspecciona.
 */
type SnapshotNode = { type: number; id: number }

type LoadState = 'idle' | 'loading' | 'ready' | 'error'

export type SnapshotFrameProps = {
  /** URL del snapshot rrweb (gzip; el browser lo descomprime). */
  snapshotUrl: string | null
  viewport: Viewport
  annotations: Annotation[]
  /** Anotación activa (velo + halo). */
  activeId?: string | null
  onSelect?: (id: string | null) => void
  /** Anotación bajo el cursor en el panel de comentarios. */
  hoveredId?: string | null
  onHover?: (id: string | null) => void
  /** Título accesible del `<iframe>` (PRD §11). */
  title: string
  className?: string
}

/**
 * Rehidrata el snapshot dentro de un iframe sin scripts.
 *
 * `rrweb-snapshot@2` prohíbe `rebuild()` contra un documento cualquiera
 * (`REBUILD_TARGET_ERROR`): el iframe lo tiene que crear la propia librería con
 * `rebuildIntoSandboxedIframe`, que le pone `sandbox="allow-same-origin"` y nunca
 * `allow-scripts` (PRD §8). Por eso aquí solo se aporta el nodo raíz donde montarlo.
 */
function SnapshotDocument({
  node,
  viewport,
  title,
  className,
}: {
  node: SnapshotNode
  viewport: Viewport
  title: string
  className?: string
}) {
  const rootRef = React.useRef<HTMLDivElement | null>(null)
  const [failed, setFailed] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    const root = rootRef.current
    if (root === null) return

    void (async () => {
      const { rebuildIntoSandboxedIframe, createCache, createMirror } = await import(
        'rrweb-snapshot'
      )
      if (cancelled || rootRef.current === null) return
      root.replaceChildren()
      try {
        rebuildIntoSandboxedIframe(node as Parameters<typeof rebuildIntoSandboxedIframe>[0], {
          root,
          iframeAttributes: {
            title,
            scrolling: 'no',
            tabindex: '-1',
            style: `display:block;border:0;background:#fff;width:${String(viewport.width)}px;height:${String(viewport.height)}px`,
          },
          cache: createCache(),
          mirror: createMirror(),
        })
        setFailed(false)
      } catch {
        // Un snapshot corrupto no debe tumbar el documento: los comentarios siguen.
        setFailed(true)
      }
    })()

    return () => {
      cancelled = true
      root.replaceChildren()
    }
  }, [node, title, viewport.width, viewport.height])

  return (
    <div
      data-slot="snapshot-document"
      className={cn('relative block bg-white', className)}
      style={{ width: viewport.width, height: viewport.height }}
    >
      {/* Lo que hay dentro de este nodo lo maneja rrweb, no React. */}
      <div ref={rootRef} />
      {failed ? <SnapshotPlaceholder message="No se pudo reconstruir esta pantalla." /> : null}
    </div>
  )
}

/** Bloque neutro cuando el snapshot no se pudo cargar; conserva la geometría. */
function SnapshotPlaceholder({ message }: { message: string }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-muted">
      <p className="px-4 text-center text-sm text-muted-foreground">{message}</p>
    </div>
  )
}

function AnnotationLayer({
  annotations,
  scale,
  activeId,
  hoveredId,
  onSelect,
  onHover,
  interactive,
}: {
  annotations: Annotation[]
  scale: number
  activeId: string | null
  hoveredId: string | null
  onSelect?: (id: string | null) => void
  onHover?: (id: string | null) => void
  interactive: boolean
}) {
  return (
    <>
      {activeId === null ? null : (
        <div
          data-veil=""
          aria-hidden
          className="absolute inset-0 z-20 bg-background/60 transition-opacity duration-150 ease-out"
        />
      )}
      {annotations.map((annotation) => {
        const { rect } = annotation.target
        const active = annotation.id === activeId
        const hovered = annotation.id === hoveredId
        const layer = active ? 'z-30' : 'z-10'
        return (
          // La capa no debe tragarse los clics: solo el marcador es interactivo.
          <div key={annotation.id} className={cn('pointer-events-none absolute inset-0', layer)}>
            <div
              aria-hidden
              className={cn(
                'pointer-events-none absolute rounded-[2px] outline-2 outline-signal transition-shadow duration-150 ease-out',
                active && 'ring-8 ring-signal-muted',
                !active && hovered && 'ring-4 ring-signal-muted',
              )}
              style={{
                left: rect.x * scale,
                top: rect.y * scale,
                width: rect.w * scale,
                height: rect.h * scale,
              }}
            />
            <div
              className="pointer-events-auto absolute"
              style={{ left: rect.x * scale - 12, top: rect.y * scale - 12 }}
            >
              <AnnotationMarker
                number={annotation.number}
                body={annotation.body}
                active={active}
                tabIndex={interactive ? undefined : -1}
                aria-hidden={interactive ? undefined : true}
                className={interactive ? '' : 'pointer-events-none'}
                onClick={() => {
                  onSelect?.(active ? null : annotation.id)
                }}
                onMouseEnter={() => {
                  onHover?.(annotation.id)
                }}
                onMouseLeave={() => {
                  onHover?.(null)
                }}
                onFocus={() => {
                  onHover?.(annotation.id)
                }}
                onBlur={() => {
                  onHover?.(null)
                }}
              />
            </div>
          </div>
        )
      })}
    </>
  )
}

/**
 * Snapshot rehidratado + capa de anotaciones (PRD §8).
 *
 * Se renderiza al ancho real del viewport capturado y se escala con
 * `transform: scale(k)`, `k = anchoDisponible / viewport.width`, de modo que los
 * rects guardados solo se multiplican por `k`. El iframe se monta cuando el
 * bloque entra en vista (`IntersectionObserver`, PRD §11).
 */
export function SnapshotFrame({
  snapshotUrl,
  viewport,
  annotations,
  activeId = null,
  onSelect,
  hoveredId = null,
  onHover,
  title,
  className,
}: SnapshotFrameProps) {
  const containerRef = React.useRef<HTMLDivElement | null>(null)
  const [visible, setVisible] = React.useState(false)
  const [width, setWidth] = React.useState(0)
  const [state, setState] = React.useState<LoadState>('idle')
  const [node, setNode] = React.useState<SnapshotNode | null>(null)

  // Hidratación diferida: nada de montar 10 iframes de golpe.
  React.useEffect(() => {
    const element = containerRef.current
    if (element === null) return
    if (typeof IntersectionObserver === 'undefined') {
      queueMicrotask(() => {
        setVisible(true)
      })
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin: '300px 0px' },
    )
    observer.observe(element)
    return () => {
      observer.disconnect()
    }
  }, [])

  // Ancho disponible → factor de escala.
  React.useEffect(() => {
    const element = containerRef.current
    if (element === null) return
    const update = (): void => {
      setWidth(element.clientWidth)
    }
    update()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update)
      return () => {
        window.removeEventListener('resize', update)
      }
    }
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => {
      observer.disconnect()
    }
  }, [])

  React.useEffect(() => {
    if (!visible || snapshotUrl === null) return
    let cancelled = false
    void (async () => {
      setState('loading')
      try {
        const response = await fetch(snapshotUrl)
        if (!response.ok) throw new Error(`HTTP ${String(response.status)}`)
        const data = (await response.json()) as SnapshotNode
        if (cancelled) return
        setNode(data)
        setState('ready')
      } catch {
        if (!cancelled) setState('error')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [snapshotUrl, visible])

  const scale = width === 0 ? 0 : width / viewport.width
  // Sin URL de snapshot no hay nada que cargar: se degrada de una vez.
  const view: LoadState = snapshotUrl === null ? 'error' : state

  const handleBackgroundClick = React.useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement
      if (target === event.currentTarget || target.dataset.veil !== undefined) {
        onSelect?.(null)
      }
    },
    [onSelect],
  )

  return (
    <div className={cn('relative', className)}>
      <div
        ref={containerRef}
        data-slot="snapshot-frame"
        onClick={handleBackgroundClick}
        className="relative w-full overflow-hidden rounded-lg border bg-card"
        style={{ aspectRatio: `${String(viewport.width)} / ${String(viewport.height)}` }}
      >
        {view === 'ready' && node !== null ? (
          <div
            className="pointer-events-none absolute top-0 left-0 origin-top-left"
            style={{ transform: `scale(${String(scale)})` }}
          >
            <SnapshotDocument node={node} viewport={viewport} title={title} />
          </div>
        ) : null}

        {view === 'error' ? (
          <SnapshotPlaceholder message="La vista previa de esta pantalla no está disponible. Los comentarios de abajo siguen siendo válidos." />
        ) : null}

        {view === 'idle' || view === 'loading' ? (
          <Skeleton className="absolute inset-0 rounded-lg" />
        ) : null}

        {scale > 0 ? (
          <AnnotationLayer
            annotations={annotations}
            scale={scale}
            activeId={activeId}
            hoveredId={hoveredId}
            onSelect={onSelect}
            onHover={onHover}
            interactive
          />
        ) : null}
      </div>

      <Dialog>
        <DialogTrigger asChild>
          <Button
            variant="secondary"
            size="sm"
            className="absolute top-2 right-2 z-40 print:hidden"
          >
            Ver a tamaño real
            <ExternalLinkIcon aria-hidden />
          </Button>
        </DialogTrigger>
        <DialogContent
          className="flex h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-[calc(100vw-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[calc(100vw-2rem)]"
        >
          <DialogHeader className="border-b px-4 py-3">
            <DialogTitle className="truncate">{title}</DialogTitle>
            <DialogDescription className="font-mono text-xs">
              {viewport.width} × {viewport.height}
            </DialogDescription>
          </DialogHeader>
          <div className="relative min-h-0 flex-1 overflow-auto bg-muted">
            <div
              className="relative"
              style={{ width: viewport.width, height: viewport.height }}
            >
              {view === 'ready' && node !== null ? (
                <div className="pointer-events-none absolute inset-0">
                  <SnapshotDocument
                    node={node}
                    viewport={viewport}
                    title={`${title} — tamaño real`}
                  />
                </div>
              ) : (
                <SnapshotPlaceholder message="La vista previa de esta pantalla no está disponible." />
              )}
              <AnnotationLayer
                annotations={annotations}
                scale={1}
                activeId={null}
                hoveredId={null}
                interactive={false}
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
