import type { Session } from '@punto/contracts'

/** El Documento siempre usa la consulta real; `/s/demo` se crea con `db:seed`. */
export async function getSession(publicId: string): Promise<Session | null> {
  try {
    const { getSessionByPublicId } = await import('./db/queries')
    return await getSessionByPublicId(publicId)
  } catch (error) {
    console.warn('[punto] no se pudo leer la sesión de la base de datos', error)
    return null
  }
}

export function sessionJsonUrl(origin: string, publicId: string): string {
  return `${origin.replace(/\/+$/, '')}/api/sessions/${publicId}`
}

export function sessionDocumentUrl(origin: string, publicId: string): string {
  return `${origin.replace(/\/+$/, '')}/s/${publicId}`
}
