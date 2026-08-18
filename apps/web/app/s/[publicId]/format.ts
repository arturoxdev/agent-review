/** Formatos del documento público (PRD §8). Deterministas: mismo texto en server y cliente. */

const dateFormatter = new Intl.DateTimeFormat('es-MX', {
  day: 'numeric',
  month: 'long',
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

/** `01`, `02`, … el número de pantalla del encabezado de bloque. */
export function screenNumber(order: number): string {
  return String(order).padStart(2, '0')
}
