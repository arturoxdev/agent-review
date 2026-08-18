/**
 * §4.1 · Un tick, al pulsar Enviar.
 *
 *   1. `snapshot(document)` con rrweb-snapshot pinneado (2.1.1).
 *   2. Se recortan `<script>`. Se inlinea CSS legible; las hojas cross-origin
 *      ilegibles se dejan fuera y se envía igual (el viewer degrada).
 *   3. Para CADA anotación: `nodeId` + `rect` + `boxModel` del elemento VIVO
 *      sobre ESE árbol. No se remide después.
 *   4. JSON → gzip. Tope 5 MB del body comprimido.
 *   5. Si pasa el tope: rehacer sin CSS externo. Si sigue > 5 MB → no se llama
 *      al API (lo decide el caller leyendo `tooHeavy`).
 *   6. Thumbnail best-effort.
 */

import { createMirror, snapshot } from 'rrweb-snapshot'
import type { Annotation, AnnotationTarget, Viewport } from '@punto/contracts'

import { absoluteRect, isOwnNode, measureBoxModel, viewportRect } from './measure'
import type { ViewportRect } from './measure'
import type { StoredAnnotation } from './storage'
import { makeThumbnail } from './thumbnail'
import type { Thumbnail } from './thumbnail'

export const MAX_BODY_BYTES = 5 * 1024 * 1024

export interface CaptureResult {
  annotations: Annotation[]
  viewport: Viewport
  /** Cuerpo listo para el PUT. */
  body: Blob
  /** `true` cuando el cuerpo va gzip (y hay que mandar `Content-Encoding`). */
  gzipped: boolean
  /** Se reintentó sin CSS externo (§4.1·5 → banda de aviso del §7·A7). */
  degradedNoExternalCss: boolean
  /** Ni sin CSS externo cupo en 5 MB: no se llama al API. */
  tooHeavy: boolean
  thumbnail: Thumbnail | null
}

function currentViewport(): Viewport {
  return {
    width: window.innerWidth,
    height: window.innerHeight,
    dpr: window.devicePixelRatio || 1,
  }
}

async function gzip(text: string): Promise<{ blob: Blob; gzipped: boolean }> {
  const Compression = (
    globalThis as unknown as { CompressionStream?: typeof CompressionStream }
  ).CompressionStream
  if (typeof Compression === 'function') {
    try {
      const stream = new Blob([text]).stream().pipeThrough(new Compression('gzip'))
      return { blob: await new Response(stream).blob(), gzipped: true }
    } catch {
      /* algunos navegadores exponen la clase pero no el formato: seguimos en claro. */
    }
  }
  // Fallback sin `CompressionStream`: se sube el JSON en claro, sin declarar
  // `Content-Encoding`. El blob se sirve tal cual y el viewer lo parsea igual.
  return { blob: new Blob([text], { type: 'application/json' }), gzipped: false }
}

interface Pass {
  json: string
  targets: Map<string, Pick<AnnotationTarget, 'nodeId'>>
}

/**
 * Serializa el documento ocultando el propio embed, y saca el `nodeId` de cada
 * elemento anotado sobre ese mismo árbol.
 */
function serialize(
  root: HTMLElement | null,
  elements: Map<string, Element>,
  inlineStylesheet: boolean,
): Pass | null {
  const previousDisplay = root?.style.display ?? ''
  if (root) root.style.setProperty('display', 'none', 'important')

  try {
    const mirror = createMirror()
    const tree = snapshot(document, {
      mirror,
      inlineStylesheet,
      // §4.1·2 — fuera los <script>; los comentarios tampoco aportan.
      slimDOM: { script: true, comment: true, headFavicon: true, headWhitespace: true },
      maskAllInputs: false,
      recordCanvas: false,
      inlineImages: false,
      preserveWhiteSpace: false,
      blockSelector: '#punto-root',
      keepIframeSrcFn: () => true,
    })
    if (tree === null) return null

    const targets = new Map<string, Pick<AnnotationTarget, 'nodeId'>>()
    for (const [id, el] of elements) {
      const nodeId = mirror.getId(el)
      targets.set(id, { nodeId: typeof nodeId === 'number' ? nodeId : -1 })
    }

    return { json: JSON.stringify(tree), targets }
  } finally {
    if (root) {
      if (previousDisplay === '') root.style.removeProperty('display')
      else root.style.display = previousDisplay
    }
  }
}

export interface CaptureInput {
  /** El `<div id="punto-root">`, para ocultarlo durante la serialización. */
  root: HTMLElement | null
  annotations: StoredAnnotation[]
  /** Elemento vivo de cada anotación (puede faltar tras un reload). */
  elements: Map<string, Element>
}

export async function capture(input: CaptureInput): Promise<CaptureResult> {
  const { root, annotations, elements } = input
  const viewport = currentViewport()

  // §4.1·3 — se mide ANTES de nada, sobre el elemento vivo, una sola vez.
  const measured = new Map<string, { rect: ReturnType<typeof absoluteRect>; box: ReturnType<typeof measureBoxModel> }>()
  const overlayRects: ViewportRect[] = []
  for (const annotation of annotations) {
    const el = elements.get(annotation.id)
    if (!el || !el.isConnected || isOwnNode(el)) continue
    measured.set(annotation.id, { rect: absoluteRect(el), box: measureBoxModel(el) })
    overlayRects.push(viewportRect(el))
  }

  let degradedNoExternalCss = false
  let pass = serialize(root, elements, true)
  if (pass === null) throw new Error('snapshot')

  let encoded = await gzip(pass.json)
  if (encoded.blob.size > MAX_BODY_BYTES) {
    // §4.1·5 — segundo intento sin CSS externo.
    degradedNoExternalCss = true
    const retry = serialize(root, elements, false)
    if (retry !== null) {
      pass = retry
      encoded = await gzip(retry.json)
    }
  }
  const tooHeavy = encoded.blob.size > MAX_BODY_BYTES

  const zero = { x: 0, y: 0, w: 0, h: 0 }
  const emptyBox = {
    content: zero,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    border: { top: 0, right: 0, bottom: 0, left: 0 },
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
  }

  const payload: Annotation[] = annotations.map((annotation) => {
    const geometry = measured.get(annotation.id)
    const target: AnnotationTarget = {
      selector: annotation.target.selector,
      nodeId: pass?.targets.get(annotation.id)?.nodeId ?? -1,
      rect: geometry?.rect ?? zero,
      boxModel: geometry?.box ?? emptyBox,
      tag: annotation.target.tag,
      text: annotation.target.text,
      resolvedBy: annotation.target.resolvedBy,
    }
    if (annotation.target.component !== undefined) target.component = annotation.target.component
    if (annotation.target.componentStack !== undefined) {
      target.componentStack = annotation.target.componentStack
    }
    if (annotation.target.source !== undefined) target.source = annotation.target.source

    return {
      id: annotation.id,
      number: annotation.number,
      body: annotation.body,
      createdAt: annotation.createdAt,
      target,
    }
  })

  const thumbnail = tooHeavy
    ? null
    : await makeThumbnail(viewport.width, viewport.height, overlayRects)

  return {
    annotations: payload,
    viewport,
    body: encoded.blob,
    gzipped: encoded.gzipped,
    degradedNoExternalCss,
    tooHeavy,
    thumbnail,
  }
}
