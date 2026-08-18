/**
 * Medición del elemento vivo: selector único, rect absoluto y box model
 * con la convención de DevTools (§4, §5).
 */

import type { BoxModel, Rect } from '@punto/contracts'

export const ROOT_ID = 'punto-root'

/** Rect en coordenadas de viewport (para pintar el overlay). */
export interface ViewportRect {
  top: number
  left: number
  width: number
  height: number
}

function num(value: string): number {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

/** ¿El nodo pertenece al propio embed? Se ignora en inspección y captura. */
export function isOwnNode(node: Node | null): boolean {
  let current: Node | null = node
  while (current) {
    if (current instanceof Element && current.id === ROOT_ID) return true
    const parent: Node | null =
      current.parentNode ?? (current instanceof ShadowRoot ? current.host : null)
    current = parent
  }
  return false
}

export function viewportRect(el: Element): ViewportRect {
  const r = el.getBoundingClientRect()
  return { top: r.top, left: r.left, width: r.width, height: r.height }
}

/** Rect absoluto respecto al documento, en px CSS (border-box). */
export function absoluteRect(el: Element): Rect {
  const r = el.getBoundingClientRect()
  return {
    x: Math.round((r.left + window.scrollX) * 100) / 100,
    y: Math.round((r.top + window.scrollY) * 100) / 100,
    w: Math.round(r.width * 100) / 100,
    h: Math.round(r.height * 100) / 100,
  }
}

export function measureBoxModel(el: Element): BoxModel {
  const cs = getComputedStyle(el)
  const r = el.getBoundingClientRect()

  const border = {
    top: num(cs.borderTopWidth),
    right: num(cs.borderRightWidth),
    bottom: num(cs.borderBottomWidth),
    left: num(cs.borderLeftWidth),
  }
  const padding = {
    top: num(cs.paddingTop),
    right: num(cs.paddingRight),
    bottom: num(cs.paddingBottom),
    left: num(cs.paddingLeft),
  }
  const margin = {
    top: num(cs.marginTop),
    right: num(cs.marginRight),
    bottom: num(cs.marginBottom),
    left: num(cs.marginLeft),
  }

  const content: Rect = {
    x: Math.round((r.left + window.scrollX + border.left + padding.left) * 100) / 100,
    y: Math.round((r.top + window.scrollY + border.top + padding.top) * 100) / 100,
    w:
      Math.round(
        Math.max(0, r.width - border.left - border.right - padding.left - padding.right) * 100,
      ) / 100,
    h:
      Math.round(
        Math.max(0, r.height - border.top - border.bottom - padding.top - padding.bottom) * 100,
      ) / 100,
  }

  return { content, padding, border, margin }
}

/** Texto visible del elemento, recortado a 120 chars (§4). */
export function visibleText(el: Element): string {
  const raw = (el instanceof HTMLElement ? el.innerText : el.textContent) ?? ''
  return raw.replace(/\s+/g, ' ').trim().slice(0, 120)
}

function nthOfType(el: Element): number {
  let index = 1
  let sibling = el.previousElementSibling
  while (sibling) {
    if (sibling.tagName === el.tagName) index++
    sibling = sibling.previousElementSibling
  }
  return index
}

function isStableClass(token: string): boolean {
  // Se descartan clases con pinta de hash (utilidades de CSS-in-JS) y las que
  // contienen caracteres que romperían el selector.
  if (token === '' || token.length > 32) return false
  if (/[^A-Za-z0-9_-]/.test(token)) return false
  return !/^[a-z]{1,3}-?\w{6,}$/.test(token) || /[-_]/.test(token)
}

function localSelector(el: Element): string {
  const tag = el.tagName.toLowerCase()
  const classes = (typeof el.className === 'string' ? el.className : '')
    .split(/\s+/)
    .filter(isStableClass)
    .slice(0, 2)
  return classes.length > 0 ? `${tag}.${classes.join('.')}` : tag
}

/**
 * Selector CSS único dentro del documento. Sirve de respaldo del `nodeId`
 * en el viewer y de anclaje al rehidratar anotaciones tras un reload.
 */
export function uniqueSelector(el: Element): string {
  const id = el.getAttribute('id')
  if (id !== null && id !== '' && /^[A-Za-z][\w-]*$/.test(id)) {
    const candidate = `#${id}`
    try {
      if (document.querySelectorAll(candidate).length === 1) return candidate
    } catch {
      /* id raro: seguimos por el camino largo. */
    }
  }

  const parts: string[] = []
  let current: Element | null = el
  let depth = 0

  while (current && depth < 6 && current !== document.documentElement) {
    const node: Element = current
    let part = localSelector(node)
    const parent: Element | null = node.parentElement
    if (parent) {
      const sameTag = Array.from(parent.children).filter(
        (child) => child.tagName === node.tagName,
      )
      if (sameTag.length > 1) part += `:nth-of-type(${nthOfType(node)})`
    }
    parts.unshift(part)

    const candidate = parts.join(' > ')
    try {
      if (document.querySelectorAll(candidate).length === 1) return candidate
    } catch {
      return parts.join(' > ')
    }

    current = parent
    depth++
  }

  return parts.join(' > ') || el.tagName.toLowerCase()
}

/** Etiqueta flotante del §7·A2: `button.px-4 · PrimaryButton · 96 × 40`. */
export function inspectorLabel(
  el: Element,
  component: string | undefined,
  rect: ViewportRect,
): string {
  const size = `${Math.round(rect.width)} × ${Math.round(rect.height)}`
  const head = localSelector(el)
  return component === undefined ? `${head}  ·  ${size}` : `${head}  ·  ${component}  ·  ${size}`
}
