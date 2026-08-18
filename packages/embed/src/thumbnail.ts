/**
 * Miniatura de índice (§4.1·6): JPEG o WebP, lado largo ≤ 800 px, ~100 KB.
 * Es **best-effort**: si algo falla se devuelve `null` y el documento cae a
 * "path + badge" (§4.1 · Cómo se pinta).
 *
 * Estrategia:
 *   1. Rasterizar el DOM vía `<foreignObject>` en un SVG cargado como imagen.
 *      Los recursos externos no se cargan en ese modo, así que sale una
 *      aproximación de la maqueta: suficiente para reconocer la pantalla.
 *   2. Si eso falla, un esquema plano: fondo real + los recuadros de las
 *      anotaciones en el color de señal. Nunca se rompe el envío por la miniatura.
 */

import type { ViewportRect } from './measure'

const MAX_SIDE = 800
const TIMEOUT_MS = 2500

function outputType(): string {
  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1
  return canvas.toDataURL('image/webp').startsWith('data:image/webp')
    ? 'image/webp'
    : 'image/jpeg'
}

function scaleFor(width: number, height: number): number {
  return Math.min(1, MAX_SIDE / Math.max(width, height))
}

function toBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, 0.72)
  })
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const timer = setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS)
    img.onload = () => {
      clearTimeout(timer)
      resolve(img)
    }
    img.onerror = () => {
      clearTimeout(timer)
      reject(new Error('load'))
    }
    img.src = url
  })
}

/** Clon del documento sin scripts y con el CSS legible inlineado. */
function serializeForRaster(width: number, height: number): string {
  const clone = document.documentElement.cloneNode(true) as HTMLElement
  for (const node of Array.from(clone.querySelectorAll('script, link[rel~="preload"]'))) {
    node.remove()
  }
  for (const node of Array.from(clone.querySelectorAll('#punto-root'))) node.remove()

  let css = ''
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      for (const rule of Array.from(sheet.cssRules)) css += rule.cssText
    } catch {
      /* cross-origin ilegible: fuera (§4.1·2). */
    }
    if (css.length > 400_000) break
  }

  const style = document.createElement('style')
  style.textContent = css
  clone.querySelector('head')?.appendChild(style)
  clone.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml')

  const body = clone.querySelector('body')
  if (body) {
    body.style.margin = '0'
    body.style.transform = `translate(${-window.scrollX}px, ${-window.scrollY}px)`
  }

  const markup = new XMLSerializer().serializeToString(clone)
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
    `<foreignObject width="100%" height="100%">${markup}</foreignObject></svg>`
  )
}

async function rasterize(width: number, height: number, type: string): Promise<Blob | null> {
  const svg = serializeForRaster(width, height)
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  const img = await loadImage(url)

  const k = scaleFor(width, height)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width * k))
  canvas.height = Math.max(1, Math.round(height * k))
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.fillStyle = getComputedStyle(document.body).backgroundColor || '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  return await toBlob(canvas, type)
}

/** Plan B: fondo + recuadros de las anotaciones. Siempre funciona. */
async function schematic(
  width: number,
  height: number,
  rects: ViewportRect[],
  type: string,
): Promise<Blob | null> {
  const k = scaleFor(width, height)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width * k))
  canvas.height = Math.max(1, Math.round(height * k))
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  ctx.fillStyle = getComputedStyle(document.body).backgroundColor || '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.strokeStyle = 'oklch(0.62 0.25 350)'
  ctx.lineWidth = 2
  for (const rect of rects) {
    ctx.strokeRect(rect.left * k, rect.top * k, rect.width * k, rect.height * k)
  }
  return await toBlob(canvas, type)
}

export interface Thumbnail {
  blob: Blob
  contentType: string
}

export async function makeThumbnail(
  width: number,
  height: number,
  rects: ViewportRect[],
): Promise<Thumbnail | null> {
  const type = outputType()
  try {
    const blob = await rasterize(width, height, type)
    if (blob && blob.size > 0) return { blob, contentType: type }
  } catch {
    /* best-effort: seguimos al plan B. */
  }
  try {
    const blob = await schematic(width, height, rects, type)
    if (blob && blob.size > 0) return { blob, contentType: type }
  } catch {
    /* noop */
  }
  return null
}
