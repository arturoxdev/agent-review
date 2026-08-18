import type { BoxModel, Edges } from './annotation'
import type { Entry } from './entry'
import type { Session, SessionSummary } from './session'
import type { Project } from './project'

/** El nombre del producto vive en un solo token (PRD, encabezado). */
export const APP_NAME = 'Punto'

/** Largo del id secreto de la URL pública. */
export const PUBLIC_ID_LENGTH = 22

/** Números en px: sin decimales inútiles, máximo dos. */
function px(value: number): string {
  return String(Math.round(value * 100) / 100)
}

/** Colapsa cuatro aristas al estilo del shorthand de CSS. */
function shorthand(edges: Edges): string {
  const { top, right, bottom, left } = edges
  if (top === right && right === bottom && bottom === left) return px(top)
  if (top === bottom && right === left) return `${px(top)} ${px(right)}`
  if (right === left) return `${px(top)} ${px(right)} ${px(bottom)}`
  return `${px(top)} ${px(right)} ${px(bottom)} ${px(left)}`
}

/**
 * Línea "caja" del detalle técnico (§8).
 * `formatBoxModel(box) // "96 × 40 · padding 8 16 · margin 0"`
 */
export function formatBoxModel(box: BoxModel): string {
  return [
    `${px(box.content.w)} × ${px(box.content.h)}`,
    `padding ${shorthand(box.padding)}`,
    `margin ${shorthand(box.margin)}`,
  ].join(' · ')
}

/** Comentarios de toda la sesión. */
export function annotationCount(session: Session): number {
  return session.entries.reduce((total, entry) => total + entry.annotations.length, 0)
}

export function sessionSummaryFromSession(session: Session): SessionSummary {
  return {
    publicId: session.publicId,
    title: session.title,
    status: session.status,
    createdAt: session.createdAt,
    closedAt: session.closedAt,
    entryCount: session.entries.length,
    annotationCount: annotationCount(session),
  }
}

function plural(count: number, singular: string, many: string): string {
  return `${count} ${count === 1 ? singular : many}`
}

/**
 * Path de una URL sin depender de `URL` (contracts compila sin lib DOM).
 * Devuelve la URL tal cual si no se puede recortar.
 */
export function urlPath(url: string): string {
  const match = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^/?#]*(\/[^?#]*)?/.exec(url)
  const path = match ? (match[1] ?? '/') : url.replace(/[?#].*$/, '')
  return path === '' ? '/' : path
}

function entryHeading(entry: Entry, index: number): string {
  return `## Pantalla ${index + 1} — ${urlPath(entry.url)}`
}

/**
 * Markdown de `GET /api/sessions/:publicId/agent.md` (§4, §8).
 * Nunca imprime `undefined`: los campos opcionales se omiten si no existen.
 */
export function buildAgentMarkdown(session: Session, jsonUrl: string): string {
  const lines: string[] = []

  lines.push(`# ${session.title}`)
  lines.push('')
  lines.push(
    [
      `Proyecto ${session.projectName}`,
      plural(session.entries.length, 'pantalla', 'pantallas'),
      plural(annotationCount(session), 'comentario', 'comentarios'),
      session.status === 'open' ? 'sesión en curso' : 'sesión cerrada',
    ].join(' · '),
  )
  lines.push('')
  lines.push(`JSON: ${jsonUrl}`)
  lines.push('')
  lines.push(
    'Cada anotación trae selector, componente y ruta cuando se pudo resolver.',
  )

  if (session.entries.length === 0) {
    lines.push('')
    lines.push('Todavía no se ha enviado ninguna pantalla.')
    return `${lines.join('\n')}\n`
  }

  for (const [index, entry] of session.entries.entries()) {
    lines.push('')
    lines.push(entryHeading(entry, index))
    lines.push('')
    lines.push(`- URL: ${entry.url}`)
    lines.push(`- Viewport: ${px(entry.viewport.width)} × ${px(entry.viewport.height)}`)
    if (entry.snapshotStatus !== 'ready') {
      lines.push(`- Snapshot: ${entry.snapshotStatus}`)
    }

    if (entry.annotations.length === 0) {
      lines.push('')
      lines.push('Sin comentarios en esta pantalla.')
      continue
    }

    for (const annotation of entry.annotations) {
      const { target } = annotation
      lines.push('')
      lines.push(`### ${annotation.number}. ${annotation.body}`)
      lines.push('')
      lines.push(`- selector: \`${target.selector}\``)
      if (target.component !== undefined) {
        lines.push(`- componente: \`${target.component}\``)
      }
      if (target.componentStack !== undefined && target.componentStack.length > 0) {
        lines.push(`- pila: \`${target.componentStack.join(' › ')}\``)
      }
      if (target.source !== undefined) {
        lines.push(`- ruta: \`${target.source}\``)
      }
      lines.push(`- resuelto por: \`${target.resolvedBy}\``)
      lines.push(`- caja: \`${formatBoxModel(target.boxModel)}\``)
    }
  }

  return `${lines.join('\n')}\n`
}

/**
 * Prompt ejecutable para que un agente instale el Embed en el repo del cliente.
 * La clave es pública, pero el guard de desarrollo es obligatorio.
 */
export function buildInstallMarkdown(project: Project, origin: string): string {
  const puntoOrigin = origin.replace(/\/+$/, '')

  return `${[
    `# Instala Punto en este repositorio`,
    '',
    `Instala el Embed de Punto para el proyecto **${project.name}**. Haz los cambios directamente; no preguntes qué framework usa el proyecto.`,
    '',
    '1. Inspecciona el repositorio y detecta el framework, su router y el punto de entrada.',
    '2. Añade el script de Punto al final del body:',
    `   - \`src\`: \`${puntoOrigin}/embed.js\``,
    `   - \`data-key\`: \`${project.publicKey}\``,
    `   - \`data-api\`: \`${puntoOrigin}\``,
    '   - carga diferida con `defer`.',
    '3. El Embed debe existir **solo en desarrollo**. Déjalo commiteado, pero protégelo con el guard de build del framework para que no aparezca en producción:',
    '   - Next.js App Router: colócalo en `app/layout.tsx`, inmediatamente antes de `</body>`, condicionado con `process.env.NODE_ENV !== \'production\'`.',
    '   - Vite: intégralo desde `index.html`/su entrada y usa `import.meta.env.DEV` para no incluirlo en el build de producción.',
    '   - Si el repo usa otro framework, aplica su equivalente de build-time development guard.',
    `4. Busca una política Content-Security-Policy. Si existe, permite \`${puntoOrigin}\` en \`script-src\` y \`connect-src\`; conserva el resto de la política.`,
    '5. No instales paquetes y no cambies la lógica de producto.',
    '6. Comprueba el resultado arrancando el sitio en desarrollo, recargando y verificando que aparezca la bolita de Punto abajo a la derecha. Si el repo tiene build de producción, ejecútalo y confirma que el Embed no quede en la salida.',
    '',
    'Al terminar, resume los archivos modificados y las comprobaciones realizadas.',
  ].join('\n')}\n`
}
