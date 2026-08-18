/**
 * §7·A3 — Popover de comentario, 320px, anclado al elemento congelado.
 *
 * Encabezado: marcador con el número que le tocará + etiqueta técnica.
 * Textarea con autofocus, autogrow, 3 filas mínimo, placeholder «¿Qué está mal aquí?».
 * Pie: `Cancelar` (ghost) y `Agregar` (default), deshabilitado con el textarea vacío.
 * `⌘Enter` agrega · `Esc` cancela.
 */

import type { JSX } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'

import type { ViewportRect } from '../measure'
import { AnnotationMarker } from './marker'
import { Button, Surface, Textarea } from './primitives'

const WIDTH = 320

export interface CommentPopoverProps {
  number: number
  label: string
  rect: ViewportRect
  initialBody?: string
  editing?: boolean
  onCancel: () => void
  onSubmit: (body: string) => void
}

function place(rect: ViewportRect): { top: number; left: number } {
  const gap = 10
  const estimated = 190
  const below = rect.top + rect.height + gap
  const top =
    below + estimated <= window.innerHeight
      ? below
      : Math.max(gap, rect.top - estimated - gap)
  const left = Math.max(gap, Math.min(rect.left, window.innerWidth - WIDTH - gap))
  return { top, left }
}

export function CommentPopover({
  number,
  label,
  rect,
  initialBody = '',
  editing = false,
  onCancel,
  onSubmit,
}: CommentPopoverProps): JSX.Element {
  const [body, setBody] = useState(initialBody)
  const area = useRef<HTMLTextAreaElement | null>(null)
  const { top, left } = place(rect)

  useEffect(() => {
    const el = area.current
    if (!el) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  }, [])

  const empty = body.trim() === ''
  const submit = (): void => {
    if (empty) return
    onSubmit(body.trim())
  }

  return (
    <Surface
      role="dialog"
      aria-label={editing ? 'Editar comentario' : 'Nuevo comentario'}
      style={{ top: `${top}px`, left: `${left}px`, width: `${WIDTH}px` }}
      class="absolute p-3"
      onKeyDown={(event: JSX.TargetedKeyboardEvent<HTMLDivElement>) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          onCancel()
        } else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
          event.preventDefault()
          event.stopPropagation()
          submit()
        }
      }}
    >
      <div class="mb-2 flex items-center gap-2">
        <AnnotationMarker number={number} label={`Comentario ${number}`} />
        <span class="truncate font-mono text-xs text-muted-foreground" title={label}>
          {label}
        </span>
      </div>

      <Textarea
        elementRef={(el) => {
          area.current = el
        }}
        rows={3}
        placeholder="¿Qué está mal aquí?"
        value={body}
        onInput={(event: JSX.TargetedInputEvent<HTMLTextAreaElement>) => {
          setBody(event.currentTarget.value)
        }}
      />

      <div class="mt-2 flex items-center justify-between gap-2">
        <span class="font-mono text-[11px] text-muted-foreground">⌘↵ agrega</span>
        <div class="flex gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancelar
          </Button>
          <Button size="sm" disabled={empty} onClick={submit}>
            {editing ? 'Guardar' : 'Agregar'}
          </Button>
        </div>
      </div>
    </Surface>
  )
}
