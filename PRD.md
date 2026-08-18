# PRD — Punto

> Plugin instalable para hacer reviews de UI: una bolita flotante deja anotar elementos
> reales de una pantalla y acumular esas anotaciones en un documento compartible.
>
> **Estado:** definición cerrada, listo para construir UI.
> **Nombre de trabajo:** _Punto_ (la bolita). Reemplazable: vive en un solo token, `APP_NAME`.

---

## 1. Problema y solución

Hoy un review de UI se hace con capturas de pantalla sueltas, flechas dibujadas encima y
mensajes de chat. Se pierde el contexto (qué elemento exactamente, en qué viewport, en qué
estado) y quien lo tiene que arreglar recibe una imagen sin ninguna pista de dónde vive ese
elemento en el código.

_Punto_ es un `<script>` que se instala en cualquier app. Aparece una bolita. El revisor
señala elementos reales de la pantalla, escribe comentarios, y al presionar **Enviar** la
pantalla completa —no una foto, el DOM serializado— se guarda como una entrada de la sesión.
Cuando termina de revisar, cierra la sesión y obtiene **un link**: un documento con todas las
pantallas, sus recuadros y sus comentarios.

Ese link tiene dos lectores:

- **El humano** (protagonista): abre el documento y ve, de corrido, todo lo que está mal en la UI.
- **El agente** (Claude Code): hace `fetch` al mismo recurso y recibe JSON con selector, nombre
  de componente y pila de componentes de cada anotación, para ir a arreglarlo.

### No objetivos (v1)

- No es un tracker de issues ni se integra con Linear/GitHub.
- No graba sesiones de usuario ni reproduce interacciones (no es un session replay).
- No hay comentarios en hilo, menciones ni notificaciones.
- No hay login para ver un documento.

---

## 2. Decisiones cerradas

| Tema | Decisión |
| --- | --- |
| Instalación | Un `<script>` en el sitio del cliente |
| Backend | Next.js único (App Router) — Route Handlers son la API |
| Persistencia | Postgres para metadata; blobs en disco. R2 queda para después. |
| Captura | DOM serializado con `rrweb-snapshot`, **no** imagen |
| Anclaje a código | React Fiber leído en runtime, con caída a heurística textual |
| Documento final | Página pública, diseñada para el humano |
| Canal del agente | El mismo recurso responde JSON |
| Acceso | Link secreto sin login; API key pública por proyecto |
| UI | React + Tailwind + shadcn/ui (panel y viewer) |
| Puerto local | `3003` por defecto (`PORT` lo cambia). No pelear el `3000` del host. |

---

## 3. Arquitectura relevante para la UI

Monorepo Bun + Turborepo.

```
apps/web            Next.js App Router — panel, viewer público y API
packages/embed      El snippet. Bundle standalone, Preact + Tailwind, Shadow DOM
packages/contracts  Tipos y esquemas Zod compartidos por embed, API y viewer
```

### Tensión importante: el embed no usa shadcn

shadcn/ui depende de Radix, y Radix hace portales a `document.body` — eso rompe el aislamiento
del Shadow DOM y contamina la página del cliente. Además el presupuesto de peso del snippet no
lo aguanta.

Entonces:

- **`apps/web` (panel + viewer)** → React + Tailwind + shadcn/ui. Normal.
- **`packages/embed`** → **Preact + Tailwind sin shadcn**, con primitivas propias mínimas
  (botón, popover, textarea). El CSS de Tailwind se compila a un string y se inyecta como
  `<style>` dentro del Shadow Root. Los tokens de color son **los mismos** (§5), copiados al
  build del embed, así que se ve como el mismo producto sin compartir componentes.
- **Presupuesto del embed:** < 60 KB gzip sin contar `rrweb-snapshot`. Es un requisito, no una meta.

---

## 4. Contratos de datos

Todo esto vive en `packages/contracts`. **La UI se construye contra estos tipos con fixtures
(§10); no hace falta backend para one-shotear las pantallas.**

```ts
// ---------- Anclaje de una anotación a un elemento ----------
export type BoxModel = {
  content: { x: number; y: number; w: number; h: number }
  padding: { top: number; right: number; bottom: number; left: number }
  border: { top: number; right: number; bottom: number; left: number }
  margin: { top: number; right: number; bottom: number; left: number }
}

export type AnnotationTarget = {
  /** Selector CSS único dentro del snapshot. Siempre presente. */
  selector: string
  /** id del nodo dentro del snapshot rrweb; es el anclaje preciso al rehidratar. */
  nodeId: number
  /** Rect absoluto respecto al documento, en px CSS. */
  rect: { x: number; y: number; w: number; h: number }
  boxModel: BoxModel
  /** Etiqueta HTML, p.ej. "button". */
  tag: string
  /** Texto visible recortado a 120 chars. Puede ser "". */
  text: string
  /** Nombre del componente React, si Fiber lo resolvió. */
  component?: string
  /** Pila de componentes de fuera hacia dentro. */
  componentStack?: string[]
  /** "src/components/Button.tsx:24" — solo cuando React expone _debugSource. */
  source?: string
  /** Cómo se resolvió el componente. La UI lo muestra como señal de confianza. */
  resolvedBy: 'fiber' | 'fiber-source' | 'heuristic'
}

export type Annotation = {
  id: string
  /** 1, 2, 3… único dentro de la entrada. Es lo que se pinta en el marcador. */
  number: number
  body: string
  target: AnnotationTarget
  createdAt: string // ISO
}

// ---------- Una pantalla capturada = un "Enviar" ----------
export type Entry = {
  id: string
  order: number
  /** URL completa donde se capturó. */
  url: string
  /** Título del documento en el momento de la captura. */
  pageTitle: string
  viewport: { width: number; height: number; dpr: number }
  /** URL pública del snapshot rrweb gzip. null mientras sube o si falló. */
  snapshotUrl: string | null
  /** URL pública del JPEG/WebP de índice. null si no se pudo generar. */
  thumbnailUrl: string | null
  snapshotStatus: 'ready' | 'pending' | 'failed'
  capturedAt: string // ISO
  annotations: Annotation[]
}

// ---------- La sesión = el documento ----------
export type Session = {
  id: string
  /** El id secreto de la URL pública, ~22 chars. */
  publicId: string
  projectName: string
  title: string
  status: 'open' | 'closed'
  createdAt: string
  closedAt: string | null
  entries: Entry[]
}

export type SessionSummary = {
  publicId: string
  title: string
  status: 'open' | 'closed'
  createdAt: string
  closedAt: string | null
  entryCount: number
  annotationCount: number
}

export type Project = {
  id: string
  name: string
  publicKey: string // "pk_live_…"
  createdAt: string
  sessionCount: number
}
```

### Endpoints que la UI consume

| Método | Ruta | Devuelve |
| --- | --- | --- |
| `GET` | `/api/sessions/:publicId` | `Session` — lo mismo que pinta el viewer, y lo que jala el agente |
| `GET` | `/api/sessions/:publicId/agent.md` | Markdown listo para pegarle a un agente |
| `GET` | `/api/projects` | `Project[]` |
| `GET` | `/api/projects/:id/sessions` | `SessionSummary[]` |
| `POST` | `/api/projects` | crea proyecto |
| `POST` | `/api/sessions` | (embed) primer Enviar: sesión + 1ª entry + URLs de subida |
| `POST` | `/api/sessions/:publicId/entries` | (embed) pantallas siguientes |
| `PATCH` | `/api/sessions/:publicId/entries/:entryId` | (embed) `ready` / `failed` |
| `PATCH` | `/api/sessions/:publicId` | (embed) cierra sesión |
| `PUT` | `/api/blobs/:uuid` | (embed) sube snapshot gzip o thumbnail |
| `GET` | `/api/blobs/:uuid` | snapshot o thumbnail (público si conoces el UUID) |

El contrato de captura (qué se sube, en qué orden, local vs prod) está en §4.1.
Un agente implementa eso; no inventa el POST.

---

## 4.1 Pipeline de captura

Alcance: **cualquier sitio**. v1 = Next y React. Armot (u otro host) es perro de prueba,
no parte del producto. Vue/HTML plano pueden anotar; `component` / `source` caerán a
heurística.

### Snippet

```html
<script src="{ORIGIN}/embed.js" data-key="pk_live_…" data-api="{ORIGIN}" defer></script>
```

`data-api` es el origen de los Route Handlers. En prod puede omitirse (mismo origen que
`embed.js`). En local, el host (Armot u otro) apunta a `http://localhost:3003`
(o al `PORT` que se haya puesto).

El embed autentica con `x-api-key: {data-key}`. Solo conoce `publicId` (nunca un id interno).

### Un tick, al pulsar Enviar

1. `snapshot(document)` con `rrweb-snapshot` **pinneado** en `packages/embed`.
2. Se recortan `<script>`. Se inlinea CSS readable. Stylesheets cross-origin que no se
   puedan leer se dejan fuera; se envía igual (el viewer degrada).
3. Para **cada** anotación ya hecha: `nodeId` + `rect` + `boxModel` del elemento **vivo**,
   sobre **ese** árbol. No se remide después.
4. JSON → gzip. Tope **5 MB** del body comprimido.
5. Si pasa el tope: rehacer el snapshot **sin** CSS externo. Si sigue > 5 MB → no se
   llama al API, `failed` local, anotaciones quedan en `localStorage`.
6. Thumbnail: JPEG o WebP, lado largo ≤ 800 px, ~100 KB. Best-effort.

Antes del primer Enviar no hay sesión en el server. Anotaciones e `Idempotency-Key`
(un uuid por pantalla) viven en `localStorage` por URL.

### Secuencia de red

```
[1ª pantalla]
  POST /api/sessions
    → { publicId, entry, snapshotUploadUrl, thumbnailUploadUrl }
  PUT  snapshotUploadUrl     (blob gzip)
  PUT  thumbnailUploadUrl    (imagen; si falla, se sigue)
  PATCH .../entries/:entryId { snapshotStatus }

[pantallas siguientes]
  POST /api/sessions/:publicId/entries
    → { entry, snapshotUploadUrl, thumbnailUploadUrl }
  PUT + PUT + PATCH  (igual)
```

URLs de subida: firmadas, **15 min**. Si caducaron, el mismo `POST` con la misma
`Idempotency-Key` re-firma; no duplica sesión ni entry.

Sesión `closed` → `409`. El embed dice “Esta sesión ya se finalizó” y ofrece un
nuevo `POST /api/sessions`.

### Requests

Headers en todo write del embed:

```
x-api-key: pk_live_…
Idempotency-Key: <uuid de esta pantalla>
Content-Type: application/json
```

```ts
export type CreateSessionRequest = {
  title?: string
  url: string
  pageTitle: string
  viewport: { width: number; height: number; dpr: number }
  annotations: Annotation[]
}

export type CreateEntryRequest = CreateSessionRequest

export type CreateEntryResponse = {
  publicId: string
  entry: Entry // snapshotStatus: 'pending', snapshotUrl y thumbnailUrl ya asignados (UUID)
  snapshotUploadUrl: string // PUT, 15 min
  thumbnailUploadUrl: string
}

export type PatchEntryRequest = {
  snapshotStatus: 'ready' | 'failed'
}
```

`POST /api/sessions` = crea proyecto-sesión `open` **y** la primera entry (`pending`),
y devuelve `CreateEntryResponse`.

`PUT` del snapshot:

```
Content-Type: application/json
Content-Encoding: gzip
```

`PUT` del thumb: `Content-Type: image/webp` o `image/jpeg`.

`ready` **solo** si el PUT del snapshot fue 2xx y luego el `PATCH`. Si el thumb falla:
`ready` igual, `thumbnailUrl: null`, el índice del documento cae a path + badge.
Si el snapshot falla o hay timeout → `PATCH failed`. Los comentarios se muestran
siempre (`snapshotStatus: 'failed'` en el viewer).

CORS del API: `Access-Control-Allow-Origin: *` (o reflejar `Origin`). Auth = API key.
El sitio anfitrión debe permitir en su CSP `connect-src` al origen de Punto.

### Dónde vive el blob (v1: solo disco, sin R2)

Archivos en `apps/web/.data/blobs/{uuid}`. Next acepta el `PUT` firmado en
`PUT /api/blobs/:uuid?token=…` y sirve la lectura en `GET /api/blobs/:uuid`.

`snapshotUrl` / `thumbnailUrl` son esas URLs de lectura (UUID público; quien
la tenga, lee). El protocolo de subida no cambia: el embed sigue haciendo PUT
a una URL de 15 min. El día que entre R2, Next deja de guardar el archivo y
solo firma un PUT al bucket.

`.data/` no se commitea. No hay CDN ni persistencia entre máquinas: suficiente
para probar captura → guardar → pintar.

### Cómo se pinta

`GET /api/sessions/:publicId` → `Session` con `snapshotUrl` / `thumbnailUrl`.

- Índice: `<img src={thumbnailUrl}>`. Sin thumb, path + badge.
- Frame: el viewer hace `fetch(snapshotUrl)` (el browser descomprime gzip),
  `rrweb-snapshot/rebuild` en `<iframe sandbox="allow-same-origin">` (sin scripts),
  overlay con `rect * k` (§8). `nodeId` es el anclaje; el selector es respaldo.

### Cómo se prueba en local

1. Punto en `localhost:3003` sirve `/embed.js` y el API. Default `3003` para no
   chocar con el front bajo prueba (casi siempre `:3000`). Se cambia con `PORT=3010 bun dev`.
2. `/dev/host` — página dummy en Punto para UI de la bolita, sin otro repo.
3. Cualquier Next/React (Armot u otro) pega el snippet con
   `src` + `data-api` a ese origen (`http://localhost:3003` salvo que `PORT` diga
   otra cosa) y un `pk_dev_…` de un proyecto seed. Env del host, p.ej.
   `NEXT_PUBLIC_PUNTO_EMBED_SRC`; en prod del host, vacío.

---

## 5. Sistema visual

Tono: **instrumento de precisión**. Cercano a unas DevTools bien diseñadas — denso, tipografía
mono donde hay datos técnicos, superficies planas, un solo color de señal que grita. Nada de
gradientes, sombras suaves ni ilustraciones.

### Principio de color

El producto se pinta **encima de UIs ajenas de color desconocido**. Por eso hay dos paletas
distintas y no se mezclan:

1. **Paleta de producto** — neutros cálidos + tinta. Para el cromo: panel, viewer, embed.
2. **Paleta de señal** — un magenta de alta croma, reservado **exclusivamente** a lo que es una
   anotación: marcadores numerados, contorno del elemento anotado, contador. Si el magenta
   aparece, es una anotación. Sin excepciones.

Y para el box model se respeta **la convención de Chrome DevTools** (contenido azul, padding
verde, borde amarillo, margen naranja) porque cualquier persona de front la lee sin leyenda.

### `apps/web/app/globals.css`

```css
@import 'tailwindcss';
@import 'tw-animate-css';

@custom-variant dark (&:is(.dark *));

:root {
  --radius: 0.625rem;

  --background: oklch(0.992 0.004 95);
  --foreground: oklch(0.205 0.012 60);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.205 0.012 60);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.205 0.012 60);
  --primary: oklch(0.24 0.015 60);
  --primary-foreground: oklch(0.985 0.004 95);
  --secondary: oklch(0.962 0.005 95);
  --secondary-foreground: oklch(0.24 0.015 60);
  --muted: oklch(0.962 0.005 95);
  --muted-foreground: oklch(0.53 0.012 70);
  --accent: oklch(0.955 0.006 95);
  --accent-foreground: oklch(0.24 0.015 60);
  --destructive: oklch(0.582 0.208 27);
  --border: oklch(0.912 0.006 90);
  --input: oklch(0.912 0.006 90);
  --ring: oklch(0.62 0.25 350);

  /* Señal — solo anotaciones */
  --signal: oklch(0.62 0.25 350);
  --signal-foreground: oklch(0.99 0.01 350);
  --signal-muted: oklch(0.62 0.25 350 / 0.12);

  /* Box model — convención DevTools */
  --box-content: oklch(0.72 0.13 240 / 0.42);
  --box-padding: oklch(0.8 0.16 145 / 0.42);
  --box-border: oklch(0.86 0.15 90 / 0.48);
  --box-margin: oklch(0.78 0.15 60 / 0.38);
}

.dark {
  --background: oklch(0.172 0.008 60);
  --foreground: oklch(0.962 0.004 95);
  --card: oklch(0.212 0.009 60);
  --card-foreground: oklch(0.962 0.004 95);
  --popover: oklch(0.212 0.009 60);
  --popover-foreground: oklch(0.962 0.004 95);
  --primary: oklch(0.962 0.004 95);
  --primary-foreground: oklch(0.205 0.012 60);
  --secondary: oklch(0.252 0.009 60);
  --secondary-foreground: oklch(0.962 0.004 95);
  --muted: oklch(0.252 0.009 60);
  --muted-foreground: oklch(0.705 0.01 80);
  --accent: oklch(0.268 0.01 60);
  --accent-foreground: oklch(0.962 0.004 95);
  --destructive: oklch(0.66 0.19 27);
  --border: oklch(0.292 0.01 60);
  --input: oklch(0.292 0.01 60);
  --ring: oklch(0.7 0.22 350);

  --signal: oklch(0.7 0.22 350);
  --signal-foreground: oklch(0.16 0.02 350);
  --signal-muted: oklch(0.7 0.22 350 / 0.16);
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-signal: var(--signal);
  --color-signal-foreground: var(--signal-foreground);
  --color-signal-muted: var(--signal-muted);
  --color-box-content: var(--box-content);
  --color-box-padding: var(--box-padding);
  --color-box-border: var(--box-border);
  --color-box-margin: var(--box-margin);
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground antialiased;
  }
}
```

### Tipografía

- **Geist Sans** para prosa e interfaz. **Geist Mono** para todo dato técnico: selectores,
  nombres de componente, rutas de archivo, medidas en px, ids de sesión, API keys.
- Escala: `text-xs` 12 / `text-sm` 14 (default de UI densa) / `text-base` 16 (cuerpo del
  documento) / `text-lg` 18 / `text-2xl` 24 / `text-3xl` 30. Nada más grande.
- Cuerpo del comentario en el viewer: `text-base leading-relaxed max-w-[62ch]`.

### Reglas de composición

- Superficies planas: `border` + `bg-card`. **Cero `shadow-lg`** salvo en popovers y menús flotantes.
- Radio: `rounded-lg` en tarjetas y contenedores, `rounded-md` en controles, `rounded-full` solo
  en la bolita y en los marcadores numerados.
- Densidad: `gap-2`/`gap-3` dentro de un bloque, `gap-6`/`gap-8` entre bloques.
- Ancho del documento: `max-w-5xl mx-auto px-6`.
- Foco visible siempre: `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`.

### Marcador de anotación (elemento firma del producto)

Aparece en el embed y en el viewer, idéntico:

```
círculo rounded-full, 24px (h-6 w-6), bg-signal, text-signal-foreground,
text-xs font-mono font-semibold, tabular-nums, ring-2 ring-background,
centrado, con el número dentro.
Estado activo: scale-110 + ring-4 ring-signal-muted.
```

Se posiciona anclado a la **esquina superior izquierda** del rect del elemento, desplazado
`-12px, -12px`, de modo que muerde la esquina.

---

## 6. Componentes shadcn

```bash
bunx --bun shadcn@latest add button badge card dialog dropdown-menu input label \
  popover scroll-area separator sheet skeleton sonner tabs textarea tooltip alert \
  table avatar
```

| Componente | Dónde se usa |
| --- | --- |
| `button` | Todos lados. Variantes: `default`, `secondary`, `ghost`, `outline`, `destructive` |
| `badge` | Estado de sesión, contador de anotaciones, `resolvedBy` |
| `card` | Tarjetas de proyecto, bloque de pantalla en el viewer |
| `dialog` | Crear proyecto, confirmar cierre de sesión |
| `dropdown-menu` | Menú de la sesión, menú de proyecto |
| `input` / `label` | Formularios |
| `textarea` | Cuerpo del comentario |
| `popover` | Tarjeta de detalle técnico del elemento |
| `scroll-area` | Lista de comentarios, índice de pantallas |
| `separator` | Divisiones dentro de tarjetas |
| `sheet` | Panel lateral de anotaciones en móvil |
| `skeleton` | Estados de carga |
| `sonner` | Toasts: "Link copiado", "Pantalla agregada" |
| `tabs` | En el viewer: **Documento** / **Para el agente** |
| `tooltip` | Iconos sin etiqueta |
| `alert` | Errores y avisos (sesión abierta, snapshot no disponible) |
| `table` | Lista de sesiones dentro de un proyecto |
| `avatar` | Inicial del proyecto en la lista |

**Sin componente propio adicional salvo estos cinco**, que sí hay que escribir:

1. `<AnnotationMarker number active onClick />` — el círculo de §5.
2. `<BoxModelOverlay box={BoxModel} />` — las cuatro capas de color absolutamente posicionadas.
3. `<SnapshotFrame snapshotUrl viewport annotations activeId onSelect />` — el `<iframe sandbox>`
   que rehidrata el snapshot con el overlay encima.
4. `<CopyButton value label />` — botón que copia y muta a "Copiado" 1.5 s.
5. `<EmptyState icon title description action />` — usado en las tres pantallas vacías.

---

## 7. Superficie A — El embed (`packages/embed`)

Todo dentro de un Shadow Root en `<div id="punto-root">` con `z-index: 2147483000`.
Nunca toca `document.body` salvo por ese nodo.

### A1 · Bolita en reposo

- Posición inicial: `bottom: 24px; right: 24px`. Arrastrable; la posición se persiste en
  `localStorage`. Se imanta a la esquina más cercana al soltar.
- 48×48, `rounded-full`, `bg-primary text-primary-foreground`, borde de 1px `border-border`,
  sombra discreta. Icono: un punto relleno dentro de un círculo.
- **Con sesión abierta**: badge en la esquina superior derecha, `bg-signal`, con el número de
  pantallas ya enviadas. `aria-label="Punto — 3 pantallas en la sesión"`.
- Hover: `scale-105`. Con `prefers-reduced-motion` no escala, solo cambia el borde.

### A2 · Modo inspección

Se entra con click en la bolita o con `⌥⇧C`. El cursor pasa a `crosshair`.

- Al mover el mouse, el elemento bajo el cursor se resalta con `<BoxModelOverlay>`: cuatro
  capas (margen naranja hacia afuera, borde amarillo, padding verde, contenido azul) y un
  contorno de 1px sólido `--signal` alrededor del border-box.
- **Etiqueta flotante** pegada arriba-izquierda del elemento (o abajo si no cabe), `bg-primary
  text-primary-foreground`, `font-mono text-xs`, con:
  `button.px-4  ·  PrimaryButton  ·  96 × 40`
  El nombre de componente solo aparece si Fiber lo resolvió.
- Se ignoran los nodos del propio embed.
- `Esc` sale del modo inspección. `Tab`/`Shift+Tab` recorren elementos anotables sin mouse
  (requisito de accesibilidad, no opcional).

### A3 · Popover de comentario

Click en un elemento lo congela (el resaltado deja de seguir el mouse) y abre el popover
anclado al elemento, 320px de ancho:

- Encabezado: marcador con el número que le tocará + la etiqueta técnica del elemento.
- `<textarea>` con autofocus, autogrow, 3 filas mínimo, placeholder
  _«¿Qué está mal aquí?»_.
- Pie: `Cancelar` (ghost) y `Agregar` (default). `⌘Enter` agrega, `Esc` cancela.
- El botón `Agregar` está deshabilitado con el textarea vacío.

Al agregar: el popover se cierra, el elemento queda con su contorno `--signal` persistente y
su marcador numerado, y se vuelve al modo inspección para el siguiente comentario.

### A4 · Panel de la pantalla actual

Se abre desde la bolita (click derecho o segundo click). Ancho 320px, anclado sobre la bolita,
alto máximo 60vh con scroll.

- Encabezado: `Pantalla actual` + `3 comentarios`.
- Lista de anotaciones: marcador, primeras dos líneas del comentario, y al hover botones
  `Editar` / `Eliminar`. Hover sobre un ítem resalta su elemento en la página.
- Pie fijo: **`Enviar pantalla`** (primary, ancho completo). Deshabilitado con cero anotaciones.
- Debajo, en `text-xs text-muted-foreground`: `Sesión: 2 pantallas enviadas` y un enlace
  `Finalizar sesión`.

### A5 · Envío

1. Botón pasa a estado cargando con texto **`Capturando pantalla…`** (spinner solo si no hay
   `prefers-reduced-motion`; con reduced motion, barra de progreso indeterminada estática +
   texto).
2. `Subiendo… 40%` con progreso real de la subida del blob.
3. Éxito: el panel se colapsa y aparece un toast propio del embed, arriba de la bolita:
   `✓ Pantalla 3 agregada a la sesión`. Se autodescarta a los 3 s.
4. Las anotaciones locales se limpian, la sesión conserva el conteo.

### A6 · Finalizar sesión

Diálogo dentro del Shadow Root, 400px:

- Título: `Finalizar sesión`.
- Campo `Título del documento`, precargado con el título de la página + fecha.
- Resumen: `3 pantallas · 9 comentarios`.
- Botones `Cancelar` / `Finalizar y obtener link`.

Al confirmar, el diálogo se reemplaza por el estado de éxito: el link en un campo de solo
lectura `font-mono text-xs` con botón `Copiar`, y un `Abrir documento ↗`. El link se copia
automáticamente al portapapeles y se avisa.

### A7 · Errores del embed

Todos como banda dentro del panel, `bg-destructive/10 border-destructive/30 text-destructive`,
con acción cuando aplique:

| Caso | Mensaje | Acción |
| --- | --- | --- |
| Sin conexión | `Sin conexión. Tus comentarios están guardados en este navegador.` | `Reintentar` |
| API key inválida | `La clave de este sitio no es válida.` | — |
| Snapshot muy pesado | `La pantalla es muy pesada. Se envió sin estilos externos.` | — |
| Falla la captura | `No se pudo capturar la pantalla.` | `Reintentar` |
| CSP bloquea la subida | `El sitio bloquea la subida. Revisa el CSP.` | `Ver ayuda ↗` |

Las anotaciones **nunca se pierden ante un error**: se persisten en `localStorage` por URL y se
rehidratan al recargar.

---

## 8. Superficie B — El documento (`/s/:publicId`)

Es la pantalla más importante del producto. Pública, sin login, sin navegación de la app.
Debe leerse como un documento, no como un dashboard.

### Estructura

```
┌─ Barra superior sticky, h-14, border-b, bg-background/80 backdrop-blur ─┐
│ ● Punto        Review de Insumos — 17 ago      [Copiar link] [⋯]      │
└────────────────────────────────────────────────────────────────────────┘

  ── max-w-5xl mx-auto px-6 ──

  Review de Insumos — 17 ago              ← text-3xl font-semibold tracking-tight
  Proyecto Armot · 17 de agosto de 2026 · 3 pantallas · 9 comentarios
                                          ← text-sm text-muted-foreground
  [ Documento | Para el agente ]          ← tabs

  ── Índice ──────────────────────────────────────────────────────────
  Tira horizontal de miniaturas, una por pantalla. Cada una: preview
  del snapshot escalado, el path de la URL en font-mono text-xs, y un
  badge con el número de comentarios. Click hace scroll a la pantalla.
  Sticky bajo la barra al hacer scroll (h-20, colapsada).

  ── Pantalla 1 ──────────────────────────────────────────────────────
  01   /insumos/nuevo                     1440 × 900        3 comentarios
       ^ mono, muted                       ^ mono, muted     ^ badge

  ┌──────────────────────────────┬──────────────────────┐
  │  <SnapshotFrame>             │  ① El botón queda    │
  │  iframe sandbox con el       │    muy pegado al     │
  │  snapshot rehidratado,       │    borde inferior.   │
  │  escalado a fit, con los     │    ─────────────     │
  │  marcadores y contornos      │    button.px-4       │
  │  encima.                     │    PrimaryButton     │
  │  aspect ratio real.          │    96 × 40           │
  │                              │                      │
  │                              │  ② …                 │
  └──────────────────────────────┴──────────────────────┘
      ~ 2/3 del ancho                ~ 1/3, sticky
```

### `<SnapshotFrame>` — comportamiento

- `<iframe sandbox="allow-same-origin" scrolling="no">` con el snapshot rehidratado por
  `rrweb-snapshot/rebuild`. **Nunca `allow-scripts`.**
- Se renderiza al ancho real del viewport capturado y se escala con
  `transform: scale(k)` + `transform-origin: top left`, donde `k = anchoDisponible / viewport.width`.
  El contenedor toma la altura escalada. Así los rects guardados siguen siendo válidos: solo se
  multiplican por `k`.
- Encima, una capa absoluta con, por cada anotación: contorno de 2px `--signal` sobre el rect y
  el `<AnnotationMarker>` en la esquina.
- **Anotación activa**: su contorno pasa a 2px sólido + halo `ring-8 ring-signal-muted`, y el
  resto de la pantalla se atenúa con un velo `bg-background/60`. Sale del estado activo con
  `Esc` o clic fuera.
- Botón flotante arriba a la derecha del frame: `Ver a tamaño real ↗` → abre un `dialog` a
  pantalla completa con el snapshot sin escalar y scroll.

### Panel de comentarios

- Sticky (`top-32`) mientras la pantalla esté en vista.
- Cada comentario: marcador numerado + cuerpo (`text-base leading-relaxed`), y debajo un bloque
  técnico plegado por defecto:
  ```
  ▸ Detalle técnico
      selector    main > form > button.px-4
      componente  PrimaryButton              [fiber]   ← badge con resolvedBy
      ruta        src/components/Button.tsx:24
      caja        96 × 40 · padding 8 16 · margin 0
  ```
  Todo `font-mono text-xs`, cada valor con su `<CopyButton>` al hover.
- Hover sobre un comentario resalta su recuadro. Click lo activa. Bidireccional: click en el
  marcador de la imagen enfoca el comentario.

### Pestaña «Para el agente»

Un bloque de código con el prompt listo, más los tres accesos:

```
Revisa esta sesión de review de UI y arregla lo señalado:
https://app.punto.dev/api/sessions/AbC123…

Cada anotación trae selector, componente y ruta cuando se pudo resolver.
```

Con `[Copiar prompt]`, `[Copiar URL del JSON]` y `[Descargar .md]`.

### Estados de la pantalla B

| Estado | Qué se ve |
| --- | --- |
| Cargando | Skeletons con la forma real: barra, título, tira de índice, un bloque de pantalla |
| Sesión no encontrada | `<EmptyState>` centrado: `Este documento no existe o el link caducó.` |
| Sesión **abierta** | `<Alert>` arriba: `Esta sesión sigue abierta. Pueden agregarse más pantallas.` + badge `En curso` |
| Sesión sin pantallas | `<EmptyState>`: `Todavía no se ha enviado ninguna pantalla.` |
| `snapshotStatus: 'failed'` | En lugar del frame, bloque `bg-muted` con `No se pudo cargar esta pantalla.` — **los comentarios se siguen mostrando** |
| `snapshotStatus: 'pending'` | Skeleton del frame + `Procesando…` |

### Responsive

- `< 768px`: el panel de comentarios pasa **debajo** del frame, ya no sticky. El índice se
  vuelve scroll horizontal con `snap-x`. La barra superior conserva solo el logo y `⋯`.
- `768–1279px`: frame 60% / comentarios 40%.
- `≥ 1280px`: layout de arriba, `max-w-5xl`.

### Impresión

`@media print`: sin barra sticky, sin tabs, sin botones; cada pantalla en su propia página
(`break-inside: avoid`), comentarios siempre debajo del frame, detalle técnico desplegado.

---

## 9. Superficie C — El panel (`/app`)

Mínimo a propósito. Es solo para sacar la API key y encontrar sesiones viejas.

### C1 · `/app` — Proyectos

- Encabezado: `Proyectos` + botón `Nuevo proyecto`.
- Grid de `card`s (`sm:grid-cols-2 lg:grid-cols-3`, `gap-4`): avatar con la inicial, nombre,
  `12 sesiones`, y la fecha de la última.
- Vacío: `<EmptyState>` — `Aún no tienes proyectos.` / `Crea uno para obtener tu snippet de instalación.` / botón.

### C2 · `/app/:projectId` — Detalle

Dos bloques:

**Instalación** (`card`): el snippet en bloque de código con `<CopyButton>` grande.

```html
<script src="https://app.punto.dev/embed.js" data-key="pk_live_a1b2c3" defer></script>
```

Debajo, `text-sm text-muted-foreground`: _«Pégalo antes de `</body>`. En desarrollo detecta
nombres de componente React automáticamente.»_
La API key se muestra completa (es pública, no es un secreto) en `font-mono`.

**Sesiones** (`table`): columnas `Título` · `Pantallas` · `Comentarios` · `Estado` (badge
`En curso` outline / `Cerrada` secondary) · `Fecha` · acciones (`Abrir ↗`, `Copiar link`).
Ordenada por fecha descendente. Vacío: `Todavía no hay sesiones en este proyecto.`

### C3 · Crear proyecto

`dialog`, un solo campo `Nombre del proyecto`, botones `Cancelar` / `Crear`.
Al crear, navega al detalle y hace toast `Proyecto creado`.

---

## 10. Fixtures para construir sin backend

Poner en `apps/web/lib/fixtures.ts` y consumirlos desde las páginas. Deben cubrir los casos
difíciles: un `resolvedBy: 'heuristic'` sin componente, una entrada con `snapshotStatus:
'failed'`, y una sesión `open`.

```ts
export const mockSession: Session = {
  id: 'ses_1',
  publicId: 'AbC123XyZ456',
  projectName: 'Armot',
  title: 'Review de Insumos — 17 ago',
  status: 'closed',
  createdAt: '2026-08-17T15:02:00.000Z',
  closedAt: '2026-08-17T15:41:00.000Z',
  entries: [
    {
      id: 'ent_1',
      order: 1,
      url: 'https://armot.local/insumos/nuevo',
      pageTitle: 'Nuevo insumo · Armot',
      viewport: { width: 1440, height: 900, dpr: 2 },
      snapshotUrl: '/mock/snapshot-1.json',
      thumbnailUrl: '/mock/snapshot-1.webp',
      snapshotStatus: 'ready',
      capturedAt: '2026-08-17T15:04:00.000Z',
      annotations: [
        {
          id: 'ann_1',
          number: 1,
          body: 'El botón queda muy pegado al borde inferior. Debería respirar al menos 24px.',
          createdAt: '2026-08-17T15:03:40.000Z',
          target: {
            selector: 'main > form > button.px-4',
            nodeId: 412,
            rect: { x: 1180, y: 742, w: 96, h: 40 },
            boxModel: {
              content: { x: 1180, y: 742, w: 96, h: 40 },
              padding: { top: 8, right: 16, bottom: 8, left: 16 },
              border: { top: 1, right: 1, bottom: 1, left: 1 },
              margin: { top: 0, right: 0, bottom: 0, left: 0 },
            },
            tag: 'button',
            text: 'Guardar cambios',
            component: 'PrimaryButton',
            componentStack: ['NuevoInsumoPage', 'InsumoForm', 'PrimaryButton'],
            source: 'src/components/PrimaryButton.tsx:24',
            resolvedBy: 'fiber-source',
          },
        },
        // ann_2: resolvedBy 'heuristic', sin component ni source → la UI no debe romperse
      ],
    },
    // ent_2: snapshotStatus 'failed', snapshotUrl null, thumbnailUrl null, con 2 anotaciones
    // ent_3: viewport móvil 390 × 844 → probar el escalado
  ],
}
```

---

## 11. Requisitos transversales

Son criterios de aceptación, no sugerencias. Salen de los quality gates del repo.

**Accesibilidad**

- Todo lo operable con mouse lo es con teclado. En el viewer: `Tab` recorre los marcadores en
  orden, `Enter` activa, `Esc` desactiva, `j`/`k` saltan entre comentarios.
- Los marcadores son `<button>` con `aria-label="Comentario 1: El botón queda muy pegado…"`.
- El `<iframe>` del snapshot lleva `title` descriptivo y `aria-hidden` no aplica: la
  información real vive en los comentarios, que sí son texto accesible.
- Contraste AA mínimo en todo texto. El magenta de señal **nunca** carga texto pequeño sobre
  fondo claro salvo en el marcador, donde va sobre relleno sólido.
- Sin trampas de foco. El diálogo de tamaño real devuelve el foco al botón que lo abrió.

**Movimiento**

- Toda transición ≤ 150 ms, `ease-out`.
- `@media (prefers-reduced-motion: reduce)`: sin `scale`, sin `translate`, sin spinners
  giratorios. Solo cambios de opacidad y color, o nada.

**Responsive**

- Se valida en 390, 768, 1024, 1440. Ningún scroll horizontal en el body en ninguno.
- La bolita del embed nunca tapa contenido crítico en 390: se imanta a la esquina y se puede mover.

**Rendimiento**

- El viewer con 10 pantallas no debe montar 10 iframes de golpe: los `<SnapshotFrame>` se
  hidratan con `IntersectionObserver` conforme entran en vista; antes son un skeleton.
- Consola del navegador limpia: cero warnings al cargar cualquiera de las tres superficies.

**TypeScript**

- Modo estricto. Sin `any`. Los tipos de §4 son la única fuente de verdad y viven en
  `packages/contracts`.

---

## 12. Criterios de aceptación de la UI

Con esto se da por bueno el one-shot:

1. `/s/mock` renderiza la sesión de fixtures completa: índice, tres pantallas, escalado correcto
   en el viewport móvil, marcadores alineados con sus rects.
2. Click en un marcador activa su comentario y viceversa, con el velo de atenuación.
3. La entrada con `snapshotStatus: 'failed'` muestra su bloque de fallo **y sus comentarios**.
4. La anotación con `resolvedBy: 'heuristic'` no muestra campos vacíos ni `undefined`.
5. La pestaña «Para el agente» copia el prompt al portapapeles y confirma con toast.
6. `/app` y `/app/:id` renderizan con datos y en estado vacío.
7. La bolita del embed funciona en las siete pantallas de §7 sobre `apps/web` de armot, sin
   filtrar ni un estilo a la página anfitriona.
8. Modo claro y oscuro, ambos completos, conmutados por `class="dark"`.
9. `bun run lint` y `bun run typecheck` limpios.

---

## 13. Riesgos abiertos

1. **React Fiber es API privada.** Se lee por las claves `__reactFiber$*` del nodo DOM; cambia
   entre versiones y en producción minificada devuelve nombres inútiles. Aislarlo tras
   `resolveComponent(el): AnnotationTarget['component']` con caída obligatoria a heurística.
   Llegar a producción sin el fallback es apostar la funcionalidad estrella a un internal.
2. **Fidelidad del snapshot.** Fuentes y CSS cross-origin, `<canvas>`, iframes de terceros.
   `rrweb-snapshot` cubre casi todo; el «casi» es donde se irá el tiempo. Banco de pruebas:
   `apps/web` de armot.
3. **CSP del sitio anfitrión.** Un `Content-Security-Policy` estricto bloquea el script o la
   subida al blob. Documentar los dominios a permitir desde el primer día.
