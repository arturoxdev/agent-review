/** Utilidades mínimas. Nada de dependencias: cada byte cuenta (§3). */

export function uuid(): string {
  const c = globalThis.crypto as Crypto | undefined
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  // Fallback determinista-suficiente para navegadores sin `randomUUID`.
  let out = ''
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) out += '-'
    else if (i === 14) out += '4'
    else out += Math.floor(Math.random() * 16).toString(16)
  }
  return out
}

/** `cx('a', cond && 'b')` — concatena clases ignorando falsy. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  let out = ''
  for (const part of parts) {
    if (!part) continue
    out = out === '' ? part : `${out} ${part}`
  }
  return out
}

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value
}

export function prefersReducedMotion(): boolean {
  return (
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

/** Fecha corta en español: "17 ago". */
export function shortDate(date: Date): string {
  const months = [
    'ene',
    'feb',
    'mar',
    'abr',
    'may',
    'jun',
    'jul',
    'ago',
    'sep',
    'oct',
    'nov',
    'dic',
  ]
  return `${date.getDate()} ${months[date.getMonth()] ?? ''}`
}

export function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}

/**
 * Luminancia relativa de un color CSS cualquiera, o `null` si es transparente
 * o el navegador no lo entiende. Se resuelve pintándolo: así da igual que el
 * anfitrión use `rgb()`, `oklch()`, `color(display-p3 …)` o un nombre.
 */
function luminanceOf(color: string): number | null {
  if (color === '' || color === 'transparent') return null
  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  try {
    ctx.fillStyle = color
    ctx.fillRect(0, 0, 1, 1)
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
    if (r === undefined || g === undefined || b === undefined) return null
    if ((a ?? 255) < 128) return null
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
  } catch {
    return null
  }
}

/**
 * ¿La UI anfitriona es oscura? El embed se pinta encima de UIs ajenas (§5), así
 * que el `prefers-color-scheme` del sistema no basta: manda lo que se ve.
 *   1. La convención `.dark` en `<html>` (la que usa el propio panel de Punto).
 *   2. La luminancia real del fondo de la página.
 *   3. Como último recurso, la preferencia del sistema.
 */
export function hostPrefersDark(): boolean {
  const root = document.documentElement
  if (root.classList.contains('dark')) return true

  for (const node of [document.body, root]) {
    if (!node) continue
    const luminance = luminanceOf(getComputedStyle(node).backgroundColor)
    if (luminance !== null) return luminance < 0.5
  }

  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches
}
