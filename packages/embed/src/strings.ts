/**
 * Todo el texto visible del embed en un solo sitio.
 *
 * `APP_LABEL` duplica `APP_NAME` de `@punto/contracts` a propósito: importar el
 * índice de contracts arrastraría Zod al bundle y el presupuesto del §3 no lo
 * aguanta. Los tipos sí vienen de contracts (`import type`, se borran al compilar).
 */

import type { ErrorCode } from './api'

export const APP_LABEL = 'Punto'

export interface ErrorCopy {
  message: string
  action?: string
  /** El botón de acción abre una URL en vez de reintentar. */
  href?: string
}

/** §7·A7 — la tabla, literal. */
export const ERRORS: Record<ErrorCode, ErrorCopy> = {
  offline: {
    message: 'Sin conexión. Tus comentarios están guardados en este navegador.',
    action: 'Reintentar',
  },
  'invalid-key': {
    message: 'La clave de este sitio no es válida.',
  },
  heavy: {
    message: 'La pantalla es muy pesada. Se envió sin estilos externos.',
  },
  capture: {
    message: 'No se pudo capturar la pantalla.',
    action: 'Reintentar',
  },
  csp: {
    message: 'El sitio bloquea la subida. Revisa el CSP.',
    action: 'Ver ayuda ↗',
    href: 'https://developer.mozilla.org/es/docs/Web/HTTP/Headers/Content-Security-Policy/connect-src',
  },
  // Fuera de la tabla del §A7, pero exigido por §4.1: sesión cerrada → 409.
  closed: {
    message: 'Esta sesión ya se finalizó.',
    action: 'Empezar una sesión nueva',
  },
  // Fuera de la tabla: §4.1·5, ni sin CSS externo cupo en 5 MB.
  'too-heavy': {
    message:
      'La pantalla es muy pesada y no se pudo enviar. Tus comentarios están guardados en este navegador.',
    action: 'Reintentar',
  },
}
