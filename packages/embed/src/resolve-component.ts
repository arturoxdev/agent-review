/**
 * §13 · Riesgo #1 — React Fiber es API privada.
 *
 * TODO el acceso a internals de React vive aquí y solo aquí. La función nunca
 * lanza: ante cualquier sorpresa (React ausente, minificado, versión nueva,
 * getters que explotan) cae a heurística textual y lo declara en `resolvedBy`.
 *
 * Quitar este módulo deja el embed funcionando: `resolvedBy: 'heuristic'`.
 */

import type { ResolvedBy } from '@punto/contracts'

export interface ResolvedComponent {
  component?: string
  componentStack?: string[]
  source?: string
  resolvedBy: ResolvedBy
}

/** Nodo de Fiber, tipado al mínimo indispensable y todo opcional. */
interface FiberLike {
  type?: unknown
  elementType?: unknown
  tag?: number
  return?: FiberLike | null
  _debugSource?: { fileName?: string; lineNumber?: number } | null
  _debugOwner?: FiberLike | null
}

const MAX_STACK = 8

/**
 * Envoltorios de framework que Fiber sí resuelve pero que no llevan a ningún
 * archivo del proyecto. Si la pila solo trae esto, es mejor caer a heurística.
 */
const FRAMEWORK =
  /^(?:.*(?:Boundary|Context|Provider|Consumer|Router)|Segment\w*|RenderFrom\w+|\w*Scroll\w*Handler\w*|Suspense|Fragment|StrictMode|Profiler|HotReload|DevOverlay|AppDevOverlay|ClientPageRoot|ClientSegmentRoot|Root)$/

/** Nombres que React deja en producción minificada y que no dicen nada. */
function isUselessName(name: string): boolean {
  if (name.length <= 2) return true
  if (/^[a-z]/.test(name) && !/[A-Z_]/.test(name)) return true
  return name === 'Unknown' || name === 'Anonymous'
}

function nameOfType(type: unknown): string | null {
  if (type === null || type === undefined) return null
  if (typeof type === 'string') return null // host component (div, button…)

  if (typeof type === 'function') {
    const fn = type as { displayName?: unknown; name?: unknown }
    const display = typeof fn.displayName === 'string' ? fn.displayName : ''
    const raw = typeof fn.name === 'string' ? fn.name : ''
    const name = display !== '' ? display : raw
    return name === '' ? null : name
  }

  if (typeof type === 'object') {
    const obj = type as { displayName?: unknown; render?: unknown; type?: unknown }
    if (typeof obj.displayName === 'string' && obj.displayName !== '') return obj.displayName
    // memo() / forwardRef() envuelven el componente real.
    return nameOfType(obj.render) ?? nameOfType(obj.type)
  }

  return null
}

function findFiber(el: Element): FiberLike | null {
  const bag = el as unknown as Record<string, unknown>
  for (const key of Object.keys(bag)) {
    if (key.startsWith('__reactFiber$') || key.startsWith('__reactInternalInstance$')) {
      const value = bag[key]
      if (value !== null && typeof value === 'object') return value as FiberLike
    }
  }
  return null
}

/** "…/src/components/Button.tsx:24" recortado a partir de `src/` o `app/`. */
function formatSource(file: string, line: number | undefined): string {
  const match = /(?:^|\/)((?:src|app|components|packages)\/.+)$/.exec(file)
  const path = match?.[1] ?? file.split('/').slice(-2).join('/')
  return line === undefined ? path : `${path}:${line}`
}

function fromFiber(el: Element): ResolvedComponent | null {
  const start = findFiber(el)
  if (!start) return null

  const stack: string[] = []
  let source: string | undefined

  let fiber: FiberLike | null = start
  let guard = 0
  while (fiber && guard < 64 && stack.length < MAX_STACK) {
    guard++
    const name = nameOfType(fiber.type ?? fiber.elementType)
    if (name !== null && !isUselessName(name) && !FRAMEWORK.test(name) && stack[0] !== name) {
      stack.unshift(name)
      if (source === undefined) {
        const debug = fiber._debugSource
        if (debug && typeof debug.fileName === 'string') {
          source = formatSource(debug.fileName, debug.lineNumber)
        }
      }
    }
    fiber = fiber.return ?? null
  }

  if (stack.length === 0) return null

  const component = stack[stack.length - 1]
  const result: ResolvedComponent = {
    resolvedBy: source === undefined ? 'fiber' : 'fiber-source',
  }
  if (component !== undefined) result.component = component
  result.componentStack = stack
  if (source !== undefined) result.source = source
  return result
}

/**
 * Caída obligatoria: sin React (o con React minificado sin nombres útiles) se
 * nombra el elemento por lo que se ve en el DOM.
 */
function fromHeuristic(el: Element): ResolvedComponent {
  const attrs = ['data-component', 'data-testid', 'data-test-id', 'data-qa']
  for (const attr of attrs) {
    const value = el.getAttribute(attr)
    if (value !== null && value.trim() !== '') {
      return { component: value.trim(), resolvedBy: 'heuristic' }
    }
  }

  // CSS Modules deja clases tipo `Button_root__a1b2` → "Button".
  const className = typeof el.className === 'string' ? el.className : ''
  for (const token of className.split(/\s+/)) {
    const match = /^([A-Z][A-Za-z0-9]+)(?:[-_]|$)/.exec(token)
    if (match?.[1]) return { component: match[1], resolvedBy: 'heuristic' }
  }

  const label = el.getAttribute('aria-label') ?? el.getAttribute('name')
  if (label !== null && label.trim() !== '') {
    return { component: label.trim().slice(0, 40), resolvedBy: 'heuristic' }
  }

  const role = el.getAttribute('role')
  if (role !== null && role.trim() !== '') {
    return { component: role.trim(), resolvedBy: 'heuristic' }
  }

  // Sin señal alguna: no se inventa un componente. `component` queda ausente,
  // que es exactamente lo que la UI del viewer sabe manejar (§12·4).
  return { resolvedBy: 'heuristic' }
}

export function resolveComponent(el: Element): ResolvedComponent {
  try {
    return fromFiber(el) ?? fromHeuristic(el)
  } catch {
    try {
      return fromHeuristic(el)
    } catch {
      return { resolvedBy: 'heuristic' }
    }
  }
}
