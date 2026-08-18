'use client'

import * as React from 'react'
import { ChevronDownIcon } from 'lucide-react'
import { urlPath, type Entry } from '@punto/contracts'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { plural, screenNumber } from './format'

export type IndexStripProps = {
  entries: Entry[]
  onJump: (entry: Entry) => void
}

/** Tira de miniaturas, sticky bajo la barra y colapsable (PRD §8). */
export function IndexStrip({ entries, onJump }: IndexStripProps) {
  const [expanded, setExpanded] = React.useState(true)
  const [broken, setBroken] = React.useState<Record<string, true>>({})

  return (
    <nav
      aria-label="Índice de pantallas"
      className="sticky top-14 z-30 -mx-6 border-b bg-background/80 px-6 backdrop-blur print:hidden"
    >
      <div className="flex items-center justify-between py-1.5">
        <span className="text-xs font-medium text-muted-foreground">
          Índice · {plural(entries.length, 'pantalla', 'pantallas')}
        </span>
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => {
            setExpanded((value) => !value)
          }}
          className="flex items-center gap-1 rounded-md px-1 py-0.5 text-xs text-muted-foreground transition-colors duration-150 ease-out hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          {expanded ? 'Colapsar' : 'Expandir'}
          <ChevronDownIcon
            aria-hidden
            className={cn(
              'size-3 transition-transform duration-150 ease-out motion-reduce:transition-none',
              !expanded && '-rotate-90',
            )}
          />
        </button>
      </div>

      <ul
        className={cn(
          'flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2',
          expanded ? 'flex' : 'hidden',
        )}
      >
        {entries.map((entry) => {
          const path = urlPath(entry.url)
          const showThumb =
            entry.thumbnailUrl !== null && broken[entry.id] === undefined
          return (
            <li key={entry.id} className="snap-start">
              <button
                type="button"
                onClick={() => {
                  onJump(entry)
                }}
                className="flex h-16 w-40 flex-col justify-between gap-1 overflow-hidden rounded-md border bg-card p-1.5 text-left transition-colors duration-150 ease-out hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
              >
                <div className="flex items-center gap-1.5">
                  {showThumb ? (
                    // eslint-disable-next-line @next/next/no-img-element -- el thumb es un blob externo con URL arbitraria; no pasa por el optimizador.
                    <img
                      src={entry.thumbnailUrl ?? ''}
                      alt=""
                      className="h-7 w-11 shrink-0 rounded-[3px] border object-cover"
                      ref={(element) => {
                        // La imagen puede haber fallado antes de hidratar.
                        if (element !== null && element.complete && element.naturalWidth === 0) {
                          setBroken((current) => ({ ...current, [entry.id]: true }))
                        }
                      }}
                      onError={() => {
                        setBroken((current) => ({ ...current, [entry.id]: true }))
                      }}
                    />
                  ) : (
                    <span className="flex h-7 w-11 shrink-0 items-center justify-center rounded-[3px] border bg-muted font-mono text-[10px] text-muted-foreground tabular-nums">
                      {screenNumber(entry.order)}
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate font-mono text-xs">
                    {path}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-1">
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {entry.viewport.width} × {entry.viewport.height}
                  </span>
                  <Badge
                    variant="outline"
                    className="h-4 px-1.5 font-mono text-[10px] tabular-nums"
                  >
                    {entry.annotations.length}
                  </Badge>
                </div>
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
