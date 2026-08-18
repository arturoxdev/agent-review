/**
 * §7·A6 — Finalizar sesión. Diálogo de 400px dentro del Shadow Root.
 *
 * Al confirmar, el diálogo se reemplaza por el estado de éxito: el link en un
 * campo de solo lectura `font-mono text-xs` con botón `Copiar`, y
 * `Abrir documento ↗`. El link se copia automáticamente y se avisa.
 */

import type { JSX } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'

import type { ErrorCode } from '../api'
import { ERRORS } from '../strings'
import { plural, shortDate } from '../util'
import { Button, Dialog } from './primitives'

export interface FinishDialogProps {
  entryCount: number
  annotationCount: number
  /** null mientras no se ha finalizado. */
  link: string | null
  busy: boolean
  error: ErrorCode | null
  autoCopied: boolean
  returnFocusTo: HTMLElement | null
  onConfirm: (title: string) => void
  onCopy: (value: string) => void
  onClose: () => void
}

export function defaultTitle(): string {
  const base = (document.title || location.hostname).trim().slice(0, 80)
  return `${base} — ${shortDate(new Date())}`
}

export function FinishDialog({
  entryCount,
  annotationCount,
  link,
  busy,
  error,
  autoCopied,
  returnFocusTo,
  onConfirm,
  onCopy,
  onClose,
}: FinishDialogProps): JSX.Element {
  const [title, setTitle] = useState(defaultTitle)
  const linkField = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (link !== null) linkField.current?.select()
  }, [link])

  return (
    <Dialog title="Finalizar sesión" onClose={onClose} returnFocusTo={returnFocusTo}>
      <div class="p-4">
        <h2 class="text-base font-semibold tracking-tight">Finalizar sesión</h2>

        {link === null ? (
          <>
            <label
              class="mt-3 block text-xs font-medium text-muted-foreground"
              for="punto-title"
            >
              Título del documento
            </label>
            <input
              id="punto-title"
              value={title}
              onInput={(event: JSX.TargetedInputEvent<HTMLInputElement>) => {
                setTitle(event.currentTarget.value)
              }}
              class="mt-1 h-8 w-full rounded-md border border-input bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
            />

            <p class="mt-3 font-mono text-xs text-muted-foreground tabular-nums">
              {plural(entryCount, 'pantalla', 'pantallas')} ·{' '}
              {plural(annotationCount, 'comentario', 'comentarios')}
            </p>

            {error !== null ? (
              <p
                role="alert"
                class="mt-3 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive"
              >
                {ERRORS[error].message}
              </p>
            ) : null}

            <div class="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose}>
                Cancelar
              </Button>
              <Button disabled={busy || title.trim() === ''} onClick={() => onConfirm(title.trim())}>
                {busy ? 'Finalizando…' : 'Finalizar y obtener link'}
              </Button>
            </div>
          </>
        ) : (
          <>
            <p class="mt-2 text-sm text-muted-foreground">
              Listo. {plural(entryCount, 'pantalla', 'pantallas')} ·{' '}
              {plural(annotationCount, 'comentario', 'comentarios')}.
            </p>

            <div class="mt-3 flex gap-2">
              <input
                ref={linkField}
                readOnly
                value={link}
                aria-label="Link del documento"
                class="h-8 min-w-0 flex-1 rounded-md border border-input bg-muted px-2 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <Button variant="outline" onClick={() => onCopy(link)}>
                Copiar
              </Button>
            </div>

            <p class="mt-1.5 text-xs text-muted-foreground" aria-live="polite">
              {autoCopied ? 'Link copiado al portapapeles.' : 'Copia el link para compartirlo.'}
            </p>

            <div class="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose}>
                Cerrar
              </Button>
              <a
                href={link}
                target="_blank"
                rel="noreferrer noopener"
                class="inline-flex h-8 items-center justify-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
              >
                Abrir documento ↗
              </a>
            </div>
          </>
        )}
      </div>
    </Dialog>
  )
}
