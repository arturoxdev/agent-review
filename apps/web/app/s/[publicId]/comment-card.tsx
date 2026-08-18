'use client'

import * as React from 'react'
import { ChevronRightIcon } from 'lucide-react'
import { formatBoxModel, type Annotation } from '@punto/contracts'

import { AnnotationMarker } from '@/components/punto/annotation-marker'
import { CopyButton } from '@/components/punto/copy-button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  const copyValue = typeof value === 'string' ? value : null
  return (
    <div className="group/row grid grid-cols-[5.5rem_1fr_auto] items-start gap-2 py-0.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words text-foreground">{value}</span>
      {copyValue === null ? (
        <span />
      ) : (
        <CopyButton
          value={copyValue}
          size="icon-xs"
          className="opacity-0 transition-opacity duration-150 ease-out group-hover/row:opacity-100 focus-visible:opacity-100 print:hidden"
        />
      )}
    </div>
  )
}

/**
 * Bloque «Detalle técnico», plegado por defecto (PRD §8).
 * Nunca imprime campos vacíos ni `undefined` (§12.4).
 */
function TechnicalDetail({ annotation }: { annotation: Annotation }) {
  const [open, setOpen] = React.useState(false)
  const { target } = annotation
  const contentId = `detalle-${annotation.id}`

  return (
    <div className="mt-3">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => {
          setOpen((value) => !value)
        }}
        className="flex items-center gap-1 rounded-md font-mono text-xs text-muted-foreground transition-colors duration-150 ease-out hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none print:hidden"
      >
        <ChevronRightIcon
          aria-hidden
          className={cn(
            'size-3 transition-transform duration-150 ease-out motion-reduce:transition-none',
            open && 'rotate-90',
          )}
        />
        Detalle técnico
      </button>
      <div
        id={contentId}
        className={cn(
          'mt-2 font-mono text-xs print:mt-0 print:block',
          open ? 'block' : 'hidden',
        )}
      >
        <DetailRow label="selector" value={target.selector} />
        {target.component === undefined ? null : (
          <DetailRow
            label="componente"
            value={
              <span className="inline-flex flex-wrap items-center gap-1.5">
                <span>{target.component}</span>
                <Badge variant="outline" className="font-mono text-[10px]">
                  {target.resolvedBy}
                </Badge>
              </span>
            }
          />
        )}
        {target.component === undefined ? (
          <DetailRow
            label="elemento"
            value={
              <span className="inline-flex flex-wrap items-center gap-1.5 text-muted-foreground">
                <span>{target.tag}</span>
                <Badge variant="outline" className="font-mono text-[10px]">
                  {target.resolvedBy}
                </Badge>
              </span>
            }
          />
        ) : null}
        {target.source === undefined ? null : (
          <DetailRow label="ruta" value={target.source} />
        )}
        <DetailRow label="caja" value={formatBoxModel(target.boxModel)} />
      </div>
    </div>
  )
}

export type CommentCardProps = {
  annotation: Annotation
  active: boolean
  hovered: boolean
  onActivate: (id: string | null, origin: 'comment' | 'marker') => void
  onHover: (id: string | null) => void
  registerRef: (id: string, element: HTMLElement | null) => void
}

export function CommentCard({
  annotation,
  active,
  hovered,
  onActivate,
  onHover,
  registerRef,
}: CommentCardProps) {
  return (
    <article
      ref={(element) => {
        registerRef(annotation.id, element)
        return () => {
          registerRef(annotation.id, null)
        }
      }}
      tabIndex={-1}
      data-annotation-id={annotation.id}
      aria-current={active ? 'true' : undefined}
      onMouseEnter={() => {
        onHover(annotation.id)
      }}
      onMouseLeave={() => {
        onHover(null)
      }}
      onClick={() => {
        onActivate(active ? null : annotation.id, 'comment')
      }}
      className={cn(
        'rounded-lg border bg-card p-3 transition-colors duration-150 ease-out outline-none',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        hovered && !active && 'border-signal/40',
        active && 'border-signal/60 bg-accent',
        'print:break-inside-avoid',
      )}
    >
      <div className="flex gap-3">
        <AnnotationMarker
          number={annotation.number}
          body={annotation.body}
          active={active}
          className="mt-1"
          onClick={(event) => {
            event.stopPropagation()
            onActivate(active ? null : annotation.id, 'marker')
          }}
        />
        <div className="min-w-0 flex-1">
          <p className="max-w-[62ch] text-base leading-relaxed text-pretty">
            {annotation.body}
          </p>
          <TechnicalDetail annotation={annotation} />
        </div>
      </div>
    </article>
  )
}
