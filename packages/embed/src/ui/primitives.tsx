/**
 * Primitivas propias mínimas (§3): botón, textarea, superficie flotante,
 * diálogo y toast. Sin shadcn, sin Radix, sin portales a `document.body`:
 * todo se renderiza dentro del Shadow Root.
 */

import type { ComponentChildren, JSX } from 'preact'
import { useEffect, useRef } from 'preact/hooks'

import { cx } from '../util'

const FOCUS =
  'outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card'

export type ButtonVariant = 'default' | 'secondary' | 'ghost' | 'outline' | 'destructive'

const VARIANTS: Record<ButtonVariant, string> = {
  default: 'bg-primary text-primary-foreground hover:opacity-90',
  secondary: 'bg-secondary text-secondary-foreground hover:bg-accent',
  ghost: 'text-foreground hover:bg-accent',
  outline: 'border border-border bg-card text-foreground hover:bg-accent',
  destructive: 'bg-destructive text-white hover:opacity-90',
}

export interface ButtonProps
  extends Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, 'size'> {
  variant?: ButtonVariant
  size?: 'sm' | 'md'
  block?: boolean
}

export function Button({
  variant = 'default',
  size = 'md',
  block = false,
  class: className,
  ...rest
}: ButtonProps): JSX.Element {
  return (
    <button
      type="button"
      {...rest}
      class={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap',
        'transition-colors disabled:pointer-events-none disabled:opacity-50',
        size === 'sm' ? 'h-7 px-2 text-xs' : 'h-8 px-3 text-sm',
        block && 'w-full',
        VARIANTS[variant],
        FOCUS,
        typeof className === 'string' ? className : undefined,
      )}
    />
  )
}

export interface TextareaProps
  extends Omit<JSX.TextareaHTMLAttributes<HTMLTextAreaElement>, 'ref'> {
  /** Crece con el contenido, sin barra de scroll, hasta `maxHeight`. */
  autogrow?: boolean
  maxHeight?: number
  /**
   * Acceso al `<textarea>` real. `ref` no sirve: en Preact, un ref sobre un
   * componente de función apunta a la instancia, no al nodo del DOM.
   */
  elementRef?: (el: HTMLTextAreaElement | null) => void
}

export function Textarea({
  autogrow = true,
  maxHeight = 200,
  class: className,
  value,
  elementRef,
  ...rest
}: TextareaProps): JSX.Element {
  const ref = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el || !autogrow) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`
  }, [value, autogrow, maxHeight])

  return (
    <textarea
      ref={(el) => {
        ref.current = el
        elementRef?.(el)
      }}
      value={value}
      {...rest}
      class={cx(
        'w-full resize-none rounded-md border border-input bg-background px-2.5 py-2 text-sm',
        'text-foreground placeholder:text-muted-foreground',
        FOCUS,
        typeof className === 'string' ? className : undefined,
      )}
    />
  )
}

/** Superficie flotante: popover, panel y menú comparten cromo (§5). */
export function Surface({
  children,
  class: className,
  ...rest
}: JSX.HTMLAttributes<HTMLDivElement>): JSX.Element {
  return (
    <div
      {...rest}
      class={cx(
        'pointer-events-auto rounded-lg border border-border bg-card text-card-foreground',
        'shadow-lg',
        typeof className === 'string' ? className : undefined,
      )}
    >
      {children}
    </div>
  )
}

export interface DialogProps {
  title: string
  onClose: () => void
  children: ComponentChildren
  /** Elemento al que devolver el foco al cerrar (§11 · sin trampas de foco). */
  returnFocusTo?: HTMLElement | null
}

/** Diálogo modal dentro del Shadow Root, con trampa de foco reversible. */
export function Dialog({ title, onClose, children, returnFocusTo }: DialogProps): JSX.Element {
  const panel = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const node = panel.current
    node?.querySelector<HTMLElement>('input, textarea, button')?.focus()

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        onClose()
        return
      }
      if (event.key !== 'Tab' || !node) return
      const focusables = Array.from(
        node.querySelectorAll<HTMLElement>('button, input, textarea, a[href]'),
      ).filter((el) => !el.hasAttribute('disabled'))
      if (focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const active = node.getRootNode() as ShadowRoot
      const current = active.activeElement
      if (event.shiftKey && current === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && current === last) {
        event.preventDefault()
        first?.focus()
      }
    }

    node?.addEventListener('keydown', onKeyDown)
    return () => {
      node?.removeEventListener('keydown', onKeyDown)
      returnFocusTo?.focus()
    }
  }, [onClose, returnFocusTo])

  return (
    <div class="punto-layer pointer-events-auto grid place-items-center bg-background/60 p-4">
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        class="w-[400px] max-w-full rounded-lg border border-border bg-card text-card-foreground shadow-lg"
      >
        {children}
      </div>
    </div>
  )
}
