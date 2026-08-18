/**
 * @punto/embed — bundle standalone del snippet (§3, §7).
 *
 *   <script src="{ORIGIN}/embed.js" data-key="pk_live_…" data-api="{ORIGIN}" defer></script>
 *
 * Todo vive en un Shadow Root dentro de `<div id="punto-root">` con
 * `z-index: 2147483000`. El embed no toca `document.body` salvo por ese nodo.
 */

import { render } from 'preact'

import { App } from './app'
import { readConfig } from './config'
import { ROOT_ID } from './measure'

// `document.currentScript` solo es válido durante la ejecución del script.
const CONFIG = readConfig()

function mount(): void {
  if (CONFIG === null) {
    // Sin `data-key` no hay nada que hacer, y no se ensucia la consola del host.
    return
  }
  if (document.getElementById(ROOT_ID) !== null) return

  const host = document.createElement('div')
  host.id = ROOT_ID
  // En estilos críticos se gana al CSS del anfitrión con `!important` inline.
  host.setAttribute(
    'style',
    [
      'position:fixed !important',
      'top:0 !important',
      'left:0 !important',
      'right:0 !important',
      'bottom:0 !important',
      'width:auto !important',
      'height:auto !important',
      'margin:0 !important',
      'padding:0 !important',
      'border:0 !important',
      'background:transparent !important',
      'pointer-events:none !important',
      'z-index:2147483000 !important',
      'color-scheme:light dark',
    ].join(';'),
  )
  host.setAttribute('data-punto', '')

  const shadow = host.attachShadow({ mode: 'open' })
  const style = document.createElement('style')
  style.textContent = __PUNTO_CSS__
  shadow.appendChild(style)

  const container = document.createElement('div')
  container.style.cssText = 'position:absolute;inset:0;pointer-events:none'
  shadow.appendChild(container)

  document.body.appendChild(host)
  render(<App config={CONFIG} root={host} />, container)
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount, { once: true })
} else {
  mount()
}
