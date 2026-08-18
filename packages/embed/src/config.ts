/**
 * Lectura del snippet (§4.1):
 *
 *   <script src="{ORIGIN}/embed.js" data-key="pk_live_…" data-api="{ORIGIN}" defer></script>
 *
 * `data-api` es opcional: si falta se usa el origen del propio script.
 * Debe llamarse SÍNCRONAMENTE durante la ejecución del script para que
 * `document.currentScript` sea válido.
 */

export interface EmbedConfig {
  /** `data-key` — la API key pública del proyecto. */
  apiKey: string
  /** Origen de los Route Handlers, sin barra final. */
  apiBase: string
}

function findScript(): HTMLScriptElement | null {
  const current = document.currentScript
  if (current instanceof HTMLScriptElement && current.dataset.key) return current
  return (
    document.querySelector<HTMLScriptElement>('script[data-key][src*="embed.js"]') ??
    document.querySelector<HTMLScriptElement>('script[data-key]')
  )
}

export function readConfig(): EmbedConfig | null {
  const script = findScript()
  if (!script) return null

  const apiKey = (script.dataset.key ?? '').trim()
  if (!apiKey) return null

  let origin = location.origin
  try {
    if (script.src) origin = new URL(script.src, location.href).origin
  } catch {
    /* src relativo raro: nos quedamos con el origen de la página. */
  }

  const declared = (script.dataset.api ?? '').trim()
  const apiBase = (declared === '' ? origin : declared).replace(/\/+$/, '')

  return { apiKey, apiBase }
}
