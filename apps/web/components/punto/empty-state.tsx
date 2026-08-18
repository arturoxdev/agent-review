import type * as React from 'react'

import { cn } from '@/lib/utils'

export type EmptyStateProps = {
  /** Icono ya renderizado, p.ej. `<FileSearchIcon />`. */
  icon?: React.ReactNode
  title: string
  description?: string
  /** Botón o enlace de acción. */
  action?: React.ReactNode
  className?: string
}

/** Estado vacío centrado, plano (PRD §6, §8, §9). */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed bg-card px-6 py-12 text-center',
        className,
      )}
    >
      {icon === undefined ? null : (
        <div
          aria-hidden
          className="flex size-9 items-center justify-center rounded-md bg-muted text-muted-foreground [&_svg]:size-4"
        >
          {icon}
        </div>
      )}
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description === undefined ? null : (
          <p className="max-w-[52ch] text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {action === undefined ? null : <div className="mt-1">{action}</div>}
    </div>
  )
}
