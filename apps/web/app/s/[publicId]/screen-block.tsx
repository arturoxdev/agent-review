'use client'

import { TriangleAlertIcon } from 'lucide-react'
import { urlPath, type Entry } from '@punto/contracts'

import { SnapshotFrame } from '@/components/punto/snapshot-frame'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { CommentCard } from './comment-card'
import { plural, screenNumber } from './format'

export type ScreenBlockProps = {
  entry: Entry
  activeId: string | null
  hoveredId: string | null
  onActivate: (id: string | null, origin: 'comment' | 'marker') => void
  onHover: (id: string | null) => void
  registerCommentRef: (id: string, element: HTMLElement | null) => void
}

export function screenAnchorId(entry: Entry): string {
  return `pantalla-${String(entry.order)}`
}

export function ScreenBlock({
  entry,
  activeId,
  hoveredId,
  onActivate,
  onHover,
  registerCommentRef,
}: ScreenBlockProps) {
  const path = urlPath(entry.url)
  // El estado activo es del documento entero; el velo solo aplica a la pantalla dueña.
  const has = (id: string | null): boolean =>
    id !== null && entry.annotations.some((annotation) => annotation.id === id)
  const localActiveId = has(activeId) ? activeId : null
  const localHoveredId = has(hoveredId) ? hoveredId : null
  const ratio = `${String(entry.viewport.width)} / ${String(entry.viewport.height)}`
  const frameTitle = `Snapshot de ${path} (${entry.pageTitle})`

  return (
    <section
      id={screenAnchorId(entry)}
      aria-label={`Pantalla ${screenNumber(entry.order)}: ${path}`}
      className="scroll-mt-36 print:break-inside-avoid print:break-after-page"
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b pb-2">
        <span className="font-mono text-sm tabular-nums text-muted-foreground">
          {screenNumber(entry.order)}
        </span>
        <span className="min-w-0 truncate font-mono text-sm">{path}</span>
        <span className="font-mono text-xs text-muted-foreground">
          {entry.viewport.width} × {entry.viewport.height}
        </span>
        <Badge variant="secondary" className="ml-auto font-mono tabular-nums">
          {plural(entry.annotations.length, 'comentario', 'comentarios')}
        </Badge>
      </div>

      <div className="mt-4 grid gap-6 md:grid-cols-5 xl:grid-cols-3 print:block">
        <div className="md:col-span-3 xl:col-span-2">
          {entry.snapshotStatus === 'ready' ? (
            <SnapshotFrame
              snapshotUrl={entry.snapshotUrl}
              viewport={entry.viewport}
              annotations={entry.annotations}
              activeId={localActiveId}
              hoveredId={localHoveredId}
              onSelect={(id) => {
                onActivate(id, 'marker')
              }}
              onHover={onHover}
              title={frameTitle}
            />
          ) : null}

          {entry.snapshotStatus === 'failed' ? (
            <div
              className="flex flex-col items-center justify-center gap-2 rounded-lg border bg-muted px-6 text-center"
              style={{ aspectRatio: ratio }}
            >
              <TriangleAlertIcon aria-hidden className="size-4 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                No se pudo cargar esta pantalla.
              </p>
            </div>
          ) : null}

          {entry.snapshotStatus === 'pending' ? (
            <div className="relative" style={{ aspectRatio: ratio }}>
              <Skeleton className="absolute inset-0 rounded-lg" />
              <div className="absolute inset-0 flex items-center justify-center">
                <p className="text-sm text-muted-foreground">Procesando…</p>
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex flex-col gap-3 md:col-span-2 md:sticky md:top-36 md:self-start xl:col-span-1 print:static print:mt-6">
          {entry.annotations.map((annotation) => (
            <CommentCard
              key={annotation.id}
              annotation={annotation}
              active={annotation.id === activeId}
              hovered={annotation.id === hoveredId}
              onActivate={onActivate}
              onHover={onHover}
              registerRef={registerCommentRef}
            />
          ))}
          {entry.annotations.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Esta pantalla no tiene comentarios.
            </p>
          ) : null}
        </div>
      </div>
    </section>
  )
}
