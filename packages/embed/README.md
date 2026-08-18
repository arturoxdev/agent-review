# @punto/embed

El snippet. Bundle standalone: **Preact + Tailwind v4, sin shadcn ni Radix**, todo dentro de un
Shadow Root (PRD §3, §7).

## Instalar en un sitio anfitrión

```html
<script src="{ORIGIN}/embed.js" data-key="pk_live_…" data-api="{ORIGIN}" defer></script>
```

Pégalo antes de `</body>`.

| Atributo   | Obligatorio | Qué es                                                                              |
| ---------- | ----------- | ----------------------------------------------------------------------------------- |
| `src`      | sí          | `{ORIGIN}/embed.js`. En local, `http://localhost:3003/embed.js` (o el `PORT` que uses). |
| `data-key` | sí          | La API key pública del proyecto (`pk_live_…` / `pk_dev_…`). No es un secreto.        |
| `data-api` | no          | Origen de los Route Handlers. Si se omite, se usa el **origen del propio script**.   |

En producción, si `embed.js` y el API viven en el mismo origen, `data-api` sobra.

### En un host de desarrollo (Next/React, p. ej. Armot)

El host suele correr en `:3000` y Punto en `:3003`, así que `data-api` sí hace falta. Se controla
con una env del **host**, vacía en producción:

```tsx
// app/layout.tsx del host
{process.env.NEXT_PUBLIC_PUNTO_EMBED_SRC ? (
  <script
    src={process.env.NEXT_PUBLIC_PUNTO_EMBED_SRC}
    data-key={process.env.NEXT_PUBLIC_PUNTO_KEY}
    data-api="http://localhost:3003"
    defer
  />
) : null}
```

```bash
# .env.local del host
NEXT_PUBLIC_PUNTO_EMBED_SRC=http://localhost:3003/embed.js
NEXT_PUBLIC_PUNTO_KEY=pk_dev_…
```

### CSP del sitio anfitrión (§13 · riesgo #3)

Un `Content-Security-Policy` estricto bloquea el script o la subida del snapshot. Hay que permitir
el origen de Punto en tres directivas:

```
script-src  'self' http://localhost:3003;     # cargar embed.js
connect-src 'self' http://localhost:3003;     # POST/PATCH del API y PUT de los blobs
img-src     'self' data: blob:;               # miniatura generada en canvas
```

En producción se sustituye `http://localhost:3003` por el origen real (`https://app.punto.dev`).
Si el CSP bloquea la subida, el embed lo dice en el panel: _«El sitio bloquea la subida. Revisa el
CSP.»_ con un enlace de ayuda (§7·A7).

El API responde `Access-Control-Allow-Origin: *`; la auth es la API key.

## Probar sin otro repo

`/dev/host` en `apps/web` es una página dummy con formularios, botones, tabla y layout variado que
ya carga `/embed.js`. La key sale de `NEXT_PUBLIC_PUNTO_DEV_KEY` (o cae a `pk_dev_local`).

```bash
bun run --cwd packages/embed build   # emite apps/web/public/embed.js
bun dev                              # http://localhost:3003/dev/host
```

## Build

```bash
bun run --cwd packages/embed build
```

1. Tailwind v4 compila `src/styles.css` (los tokens del §5, idénticos a `globals.css`) a un string.
2. esbuild empaqueta Preact + ese string en un IIFE minificado.
3. Se emite a `apps/web/public/embed.js` y a `dist/embed.js`.
4. Se reporta raw + gzip. **Si el bundle sin `rrweb-snapshot` llega a 60 KB gzip, el build falla**:
   el presupuesto del §3 es un requisito, no una meta.

## Atajos

| Atajo             | Qué hace                                             |
| ----------------- | ---------------------------------------------------- |
| `⌥⇧C`             | Entra y sale del modo inspección                     |
| `Tab` / `⇧Tab`    | Recorre elementos anotables sin mouse                |
| `Enter`           | Comenta el elemento enfocado                         |
| `Esc`             | Sale del modo inspección / cierra popover y diálogos |
| `⌘Enter`          | Agrega el comentario                                 |
| Click derecho en la bolita | Abre el panel de la pantalla actual         |

## Aislamiento

- Un único nodo en el documento anfitrión: `<div id="punto-root">` con `z-index: 2147483000` y
  Shadow Root abierto. Nada más se toca de `document.body`.
- El CSS de Tailwind se inyecta como `<style>` **dentro** del Shadow Root: no filtra ni un estilo.
- El propio nodo se oculta durante la serialización, así que no aparece en el snapshot.

## Persistencia local

| Clave                          | Contenido                                                     |
| ------------------------------ | ------------------------------------------------------------- |
| `punto:v1:screen:{origin+path}` | `Idempotency-Key` de la pantalla + sus anotaciones            |
| `punto:v1:session`             | `publicId`, pantallas enviadas y comentarios de la sesión     |
| `punto:v1:bubble`              | Esquina a la que se imantó la bolita                          |

Las anotaciones nunca se pierden ante un error y se rehidratan al recargar (§7·A7).
