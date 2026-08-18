'use client'

import * as React from 'react'
import { BotIcon, CheckIcon, CopyIcon, type LucideIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type CopyButtonProps = Omit<
  React.ComponentProps<typeof Button>,
  'value' | 'children' | 'onClick'
> & {
  /** Texto que se copia al portapapeles. */
  value: string
  /** Etiqueta visible. Si se omite, el botón es solo icono con `aria-label`. */
  label?: string
  /** Aviso opcional por sonner al copiar. */
  toastMessage?: string
  onCopied?: () => void
  /** Icono que distingue qué se copia. */
  icon?: LucideIcon
}

async function writeToClipboard(value: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.clipboard !== undefined) {
    await navigator.clipboard.writeText(value)
    return
  }
  // Caída para navegadores sin Clipboard API o contextos no seguros.
  const area = document.createElement('textarea')
  area.value = value
  area.setAttribute('readonly', '')
  area.style.position = 'fixed'
  area.style.opacity = '0'
  document.body.appendChild(area)
  area.select()
  document.execCommand('copy')
  document.body.removeChild(area)
}

/** Botón que copia y muta a «Copiado» durante 1.5 s (PRD §6). */
export function CopyButton({
  value,
  label,
  toastMessage,
  onCopied,
  icon: Icon = CopyIcon,
  className,
  variant = 'ghost',
  size,
  ...props
}: CopyButtonProps) {
  const [copied, setCopied] = React.useState(false)
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  React.useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current)
    },
    [],
  )

  const handleClick = React.useCallback(() => {
    void (async () => {
      try {
        await writeToClipboard(value)
      } catch {
        // Sin portapapeles no hay nada que hacer; no se rompe la página.
        return
      }
      setCopied(true)
      onCopied?.()
      if (toastMessage !== undefined) {
        const { toast } = await import('sonner')
        toast.success(toastMessage)
      }
      if (timer.current !== null) clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        setCopied(false)
      }, 1500)
    })()
  }, [onCopied, toastMessage, value])

  const iconOnly = label === undefined
  const text = copied ? 'Copiado' : label

  return (
    <Button
      type="button"
      variant={variant}
      size={size ?? (iconOnly ? 'icon-sm' : 'sm')}
      onClick={handleClick}
      aria-label={iconOnly ? (copied ? 'Copiado' : 'Copiar') : undefined}
      data-copied={copied ? '' : undefined}
      className={cn('transition-colors duration-150 ease-out', className)}
      {...props}
    >
      {copied ? (
        <CheckIcon aria-hidden data-icon="inline-start" />
      ) : (
        <Icon aria-hidden data-icon="inline-start" />
      )}
      {iconOnly ? null : <span>{text}</span>}
    </Button>
  )
}

export type AgentCopyButtonProps = Omit<CopyButtonProps, 'icon'>

/** Variante cliente para no pasar el componente BotIcon por la frontera RSC. */
export function AgentCopyButton(props: AgentCopyButtonProps) {
  return <CopyButton {...props} icon={BotIcon} />
}
