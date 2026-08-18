/** Formatos del panel (PRD §9). Deterministas: mismo texto en server y cliente. */

const dateFormatter = new Intl.DateTimeFormat('es-MX', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

export function formatDate(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : dateFormatter.format(date)
}

export function plural(count: number, singular: string, many: string): string {
  return `${String(count)} ${count === 1 ? singular : many}`
}

/** Inicial del proyecto para el avatar de §C1. */
export function initial(name: string): string {
  return (name.trim()[0] ?? '·').toUpperCase()
}
