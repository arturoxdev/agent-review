# Plan de deploy — Punto a producción (Vercel + Neon + R2)

Documento ejecutable por un agente. Cada fase tiene **qué cambiar**, **por qué** y
**cómo verificar**. Las tareas marcadas 🧑 **las hace un humano** (crear cuentas,
generar secretos): el agente debe parar y pedirlas, no inventarlas.

## Contexto

| Pieza | Hoy | En producción |
| --- | --- | --- |
| App | Next 16 en `apps/web`, monorepo turbo + bun | Vercel |
| DB | Neon Postgres vía `@neondatabase/serverless` (HTTP) | **igual, sin cambios** |
| Blobs | Filesystem local (`BLOB_DIR=.data/blobs`) | **Cloudflare R2** |
| Embed | `packages/embed` → `apps/web/public/embed.js` (gitignored) | se compila en el build de Vercel |

El único cambio de código real es la **Fase 1** (blobs). Neon ya está bien cableado
para serverless y no se toca.

### El bloqueador

`lib/api/blob-store.ts` escribe con `node:fs/promises` en `BLOB_DIR`. En Vercel el
filesystem es efímero y no se comparte entre invocaciones: un snapshot subido por el
`PUT` no existe cuando llega el `GET`. **Sin la Fase 1 el deploy no sirve**, aunque
compile y las páginas rendericen.

### Invariante que NO se rompe

El contrato público de `PRD §4.1` se mantiene byte por byte:

```
snapshotUrl / thumbnailUrl        = {PUNTO_ORIGIN}/api/blobs/{uuid}
snapshotUploadUrl / thumbnailUrl… = {PUNTO_ORIGIN}/api/blobs/{uuid}?token={exp}.{hmac}
```

R2 entra **detrás** de esa ruta, no delante. Consecuencias:

- `packages/embed` no se toca. Los sitios de clientes que ya cargan `/embed.js` siguen igual.
- La firma HMAC de 15 min (`lib/blob-token.ts`) sigue siendo la autorización de subida.
- El CORS de `lib/api/cors.ts` sigue aplicando.
- Las filas de `entries` con `snapshotUrl` ya guardadas siguen resolviendo.

Se **rechaza** la alternativa de presigned PUT directo al bucket + dominio público de
R2: cambiaría las URLs guardadas en DB y obligaría a tocar el embed. Queda anotada
como optimización futura en el Apéndice A.

---

## Fase 0 — Prerrequisitos 🧑

El agente NO puede hacer esta fase. Pide estos valores y sigue.

### 0.1 Neon (producción)

En <https://console.neon.tech>: proyecto de producción (o branch `production` del
existente). Copiar la connection string **pooled** (host con `-pooler`, termina en
`?sslmode=require`).

> Anotar la **región** de Neon (p.ej. `aws-us-east-1`). Se usa en la Fase 3 para
> colocar las funciones de Vercel al lado y no pagar un salto transatlántico por query.

→ `DATABASE_URL`

### 0.2 Cloudflare R2

En dash.cloudflare.com → R2:

1. Crear bucket, p.ej. `punto-blobs`. **Location**: la más cercana a la región de Vercel de 3.4.
2. **No** habilitar acceso público ni dominio público: todo el tráfico pasa por la ruta de Next.
3. R2 → *Manage API tokens* → *Create API token*, permiso **Object Read & Write**,
   alcance limitado a ese bucket. Guardar `Access Key ID` y `Secret Access Key`
   (el secret se muestra una sola vez).
4. Anotar el **Account ID** (barra lateral del dashboard de R2).

→ `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`

### 0.3 Secretos de la app

```bash
openssl rand -hex 32     # BLOB_UPLOAD_SECRET
openssl rand -base64 32  # SESSION_SECRET
```

> **No reutilizar los de `.env` local.** Si `BLOB_UPLOAD_SECRET` de prod fuera el mismo
> que el de dev, un token firmado en local valdría contra producción.

### 0.4 Vercel

Cuenta/equipo con acceso al repo en GitHub. El dominio final define `PUNTO_ORIGIN`
(p.ej. `https://app.punto.dev`).

---

## Fase 1 — Backend de blobs en R2

### 1.1 Dependencia

```bash
cd apps/web && bun add aws4fetch
```

`aws4fetch` (~7 kB) firma SigV4 sobre `fetch`. Se elige sobre `@aws-sdk/client-s3`
porque este último mete decenas de MB en el bundle de la función y empeora el cold
start; R2 es S3-compatible y solo se necesitan `PUT` y `GET` de un objeto.

### 1.2 Variables de entorno nuevas

Editar `apps/web/lib/env.ts`:

- Añadir a `type Env`: `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, todas `string`.
- Un `readers` por variable, siguiendo el patrón perezoso que ya existe (`memo(() => read(...))`).
  **Respetar ese diseño**: la validación es por variable y solo al leerla, para que una
  ruta que no toca R2 no muera porque falte `R2_BUCKET` (el módulo lo explica en su
  cabecera). Mensajes de error en el mismo tono: qué falta y de dónde sale.
- Añadir un helper `hasR2(): boolean` que devuelva `true` si las cuatro variables
  están presentes en `process.env` **sin** dispararles la validación (leer
  `process.env` directo, no `env.X`).
- Actualizar la tabla de la cabecera del módulo con las cuatro filas nuevas.

Editar también:

- `.env.example` (raíz) — bloque nuevo con el mismo estilo comentado que el resto:
  de dónde sale cada valor y que en local son opcionales.
- `turbo.json` → `globalEnv`: añadir las cuatro `R2_*` **y `SESSION_SECRET`, que hoy
  falta** (bug preexistente: sin ella el hash de caché de turbo ignora un cambio de
  secreto).

### 1.3 Reescribir `lib/api/blob-store.ts`

Dos backends detrás de la misma interfaz. Todo lo que ya existe y no toca el disco
(`isBlobId`, `newBlobId`, `blobIdFromUrl`, `normalizeContentType`, `readLimitedBody`,
`MAX_BLOB_BYTES`, `ALLOWED_CONTENT_TYPES`, `tooLarge`) **se conserva tal cual**.

Cambia solo el par `writeBlob` / `readBlob`:

```ts
// selección de backend, evaluada por llamada (no al importar el módulo)
const backend = hasR2() ? r2Backend : fsBackend
```

- **`r2Backend`** — producción.
  - Endpoint: `https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com/{R2_BUCKET}/{uuid}`
  - Cliente: `new AwsClient({ accessKeyId, secretAccessKey, service: 's3', region: 'auto' })`.
    Crearlo perezosamente y cachearlo en un módulo-level `let`, igual que hace
    `lib/blob-token.ts` con `hmacKey()`.
  - `writeBlob`: `PUT` con el body y los headers `Content-Type` y, si viene,
    `Content-Encoding: gzip`. **Elimina el sidecar `.meta.json`**: S3/R2 guardan
    `Content-Type` y `Content-Encoding` como metadata nativa del objeto y los
    devuelven en el `GET`. Menos código y una escritura en vez de dos.
  - `readBlob`: `GET`. `404`/`NoSuchKey` → devolver `null` (el route lo traduce a su
    propio 404). Reconstruir `BlobMeta` desde los headers de la respuesta
    (`content-type`, `content-encoding`, `content-length`, `last-modified`), con los
    mismos defaults tolerantes que hoy: `application/octet-stream` y `contentEncoding: null`.
  - Cualquier otro status: lanzar con el status y el body de R2 en el mensaje. **No
    tragarse el error**: un 403 por credenciales mal puestas no puede parecer un 404.
- **`fsBackend`** — el código actual movido tal cual, sidecar incluido. Se mantiene
  para que `bun run db:seed` y el desarrollo local funcionen sin credenciales de
  Cloudflare y sin red.

`writeBlob` sigue devolviendo `BlobMeta` y `readBlob` sigue devolviendo
`{ data, meta } | null`: **`app/api/blobs/[uuid]/route.ts` y `scripts/seed.ts` no se
tocan**. Si el agente se ve editando el route handler, se salió del plan.

Actualizar la cabecera del módulo: hoy dice *«v1 sin R2»* y *«El día que entre R2 este
módulo se cambia…»* — ese día es este.

### 1.4 Verificación local

```bash
bun run typecheck && bun run lint
```

Con backend fs (sin `R2_*` en `.env`) — que no haya regresión:

```bash
bun run db:seed
bun run dev
# En otro terminal: /dev/host, capturar una pantalla, abrir /s/{publicId}.
# La captura debe verse y el snapshot cargar.
```

Con backend R2 — poner las cuatro `R2_*` en el `.env` local y repetir el ciclo.
Comprobar además:

```bash
# el GET debe responder 200 con content-encoding: gzip en el snapshot
curl -sI "$PUNTO_ORIGIN/api/blobs/{uuid}" | grep -i 'content-type\|content-encoding'
# y el objeto debe existir en el bucket
bunx wrangler r2 object get punto-blobs/{uuid} --remote
```

> Un `GET` de snapshot **sin** `Content-Encoding: gzip` significa que se perdió la
> metadata en el `PUT`: el viewer hará `.json()` sobre bytes comprimidos y fallará.
> Es el modo de fallo más probable de esta fase — verificarlo explícitamente.

---

## Fase 2 — Neon en producción

### 2.1 Migraciones

`apps/web/drizzle/` tiene `0000_unknown_storm.sql` y `0001_easy_hannibal_king.sql`.

```bash
DATABASE_URL='<connection string de prod>' bun run db:migrate
```

> **No poner esto en el build de Vercel.** Vercel puede correr varios builds en
> paralelo (preview + prod) y drizzle-kit no toma lock: dos `migrate` simultáneos
> contra la misma base es corrupción. Se corre a mano en el primer deploy y en cada
> cambio de schema, o desde un job de CI serializado.

### 2.2 Cuenta inicial

`scripts/seed.ts` es para **desarrollo**: crea el proyecto demo con la API key
`pk_dev_armot_local` y la sesión `demo`. **No correrlo contra producción** — sembraría
una key pública conocida.

Para la primera cuenta real: registrarse por `/signup` en el dominio ya deployado.

### 2.3 Verificación

```bash
psql "$DATABASE_URL" -c '\dt'    # accounts, projects, sessions, entries, annotations
psql "$DATABASE_URL" -c '\dT'    # enums session_status, snapshot_status
```

---

## Fase 3 — Vercel

### 3.1 `vercel.json` en la raíz del repo

El build **debe correr desde la raíz**, no desde `apps/web`: `apps/web/public/embed.js`
está gitignored y lo emite `@punto/embed`. `turbo.json` ya encadena eso vía
`dependsOn: ["^build"]`, así que `turbo run build` desde la raíz lo resuelve solo.
Si se configura Vercel con Root Directory `apps/web`, **el deploy sale con `/embed.js`
en 404** y el embed no carga en ningún sitio de cliente.

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "buildCommand": "turbo run build --filter=@punto/web...",
  "installCommand": "bun install --frozen-lockfile",
  "outputDirectory": "apps/web/.next",
  "framework": "nextjs"
}
```

### 3.2 Proyecto en Vercel 🧑

- Importar el repo. **Root Directory: la raíz** (dejar vacío), no `apps/web`.
- Framework preset: Next.js.

### 3.3 Variables de entorno 🧑

En Vercel → Settings → Environment Variables, **scope Production** (y Preview con
valores propios si se quieren previews con datos aparte):

| Variable | Valor |
| --- | --- |
| `DATABASE_URL` | connection string pooled de Neon (0.1) |
| `PUNTO_ORIGIN` | el dominio final, sin barra final |
| `NEXT_PUBLIC_PUNTO_ORIGIN` | el mismo valor |
| `BLOB_UPLOAD_SECRET` | el de 0.3 |
| `SESSION_SECRET` | el de 0.3 |
| `R2_ACCOUNT_ID` / `R2_BUCKET` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | los de 0.2 |

**No definir `BLOB_DIR`**: su presencia es inocua, pero dejarla fuera hace evidente
que en prod manda R2.

⚠️ `NEXT_PUBLIC_PUNTO_ORIGIN` se **inlinea en el bundle del cliente** en build-time.
Cambiarla exige redeploy, no basta con reiniciar.

⚠️ `PUNTO_ORIGIN` tiene que ser el dominio **definitivo** desde el primer deploy: es
lo que se persiste dentro de `entries.snapshotUrl`. Si se despliega con la URL
`*.vercel.app` y luego se mueve el dominio, esas filas apuntan al host viejo para
siempre. Configurar el dominio custom **antes** de capturar nada real.

### 3.4 Región

Settings → Functions → Region: **la misma que Neon** (0.1). Con Neon por HTTP cada
query es un round-trip; cruzar continentes multiplica la latencia de cada página del
panel por el número de queries que hace.

### 3.5 Dominio 🧑

Añadir el dominio custom y esperar el certificado. Debe coincidir exacto con
`PUNTO_ORIGIN` (mismo esquema, sin `www` de más).

---

## Fase 4 — Endurecer antes de abrir

Cada punto es independiente; ninguno bloquea el deploy pero todos son de esta tanda.

### 4.1 Quitar `sharp`

`apps/web/package.json` declara `sharp` (^0.35.3) y **no hay una sola referencia en el
código** (verificado sobre `app/`, `lib/`, `scripts/`, `packages/`). Los thumbnails los
genera el embed en el browser (`packages/embed/src/thumbnail.ts`). Es un binario nativo
pesado en el bundle de la función.

```bash
cd apps/web && bun remove sharp
```

Quitarlo además de `ignoreScripts` y `trustedDependencies` en el `package.json` raíz.
Verificar con `bun run build` que nada lo pedía de forma indirecta.

### 4.2 Cerrar `/dev/host` en producción

`app/dev/host/page.tsx` es la página dummy del §4.1 y quedaría pública. Elegir una:

- **(recomendada)** `notFound()` al principio del componente cuando
  `process.env.VERCEL_ENV === 'production'`.
- O un `rewrite` a 404 en `next.config.ts` para `/dev/:path*` bajo la misma condición.

Verificar tras el deploy que `GET /dev/host` da 404 en prod y sigue viva en local.

### 4.3 Repasar el CORS

`lib/api/cors.ts` refleja cualquier `Origin` y cae a `*`. Es **deliberado y correcto**
para el embed (vive en dominios de clientes) y no manda credenciales: la auth es la API
key pública en `x-api-key`. No cambiarlo.

Pero `/api/blobs/:uuid` hereda ese CORS abierto y su `GET` **no pide token**: quien
conozca el UUID lee el blob. Eso también es de diseño (§4.1, "lectura pública si conoces
el UUID"), pero conviene que quede dicho en el PRD antes de tener clientes reales, no
después. No es un cambio de código: es una decisión a confirmar con el dueño del producto.

### 4.4 Ya está bien, no tocar

- `accessCookieOptions` (`lib/access-token.ts:48`) ya es `httpOnly` + `secure` + `sameSite: lax`.
- `proxy.ts` protege `/app/:path*` y renueva la cookie en cada request.
- `jsonResponse` marca `Cache-Control: no-store` en todo el API.
- El `GET` de blobs marca `immutable` con `max-age` de un año: el CDN de Vercel absorbe
  las relecturas de snapshot, así que el proxy de la Fase 1 no cuesta una invocación por vista.

---

## Fase 5 — Verificación end-to-end en producción

En orden. Si un paso falla, parar y arreglar antes de seguir.

1. `GET https://{dominio}/embed.js` → 200, `content-type` de JavaScript. *(si es 404: Root Directory mal puesto, 3.1)*
2. `/signup` → crear cuenta real → redirige a `/app`.
3. En el panel: crear proyecto → copiar la `pk_live_…`.
4. Montar el embed con esa key en una página de prueba en **otro dominio** (esto ejercita el CORS de verdad).
5. Capturar una pantalla. Verificar en la Network del browser:
   - `POST /api/sessions` → 201 con `snapshotUploadUrl` y `thumbnailUploadUrl`.
   - `PUT` a ambas URLs firmadas → 200.
   - `PATCH …/entries/{id}` → 200, `snapshotStatus: "ready"`.
6. Abrir `/s/{publicId}`: se ve el thumbnail y el snapshot se renderiza.
7. `bunx wrangler r2 object get punto-blobs/{uuid} --remote` → el objeto existe.
8. Anotar un elemento; recargar; la anotación persiste.
9. `GET /api/sessions/{publicId}/agent.md` → devuelve el markdown.
10. `GET /dev/host` → 404 *(4.2)*.
11. Repetir el `POST /api/sessions` con la **misma `Idempotency-Key`**: debe re-firmar
    las URLs de subida **sin** crear una segunda sesión. Esto valida en prod el unique
    `sessions_project_id_idempotency_key_unique`, que depende de que Postgres trate los
    NULL como distintos.

---

## Apéndice A — Optimizaciones posteriores (fuera de este plan)

- **Subida directa a R2** con presigned PUT y lectura por dominio público del bucket:
  saca los 5 MB del snapshot del ancho de banda de Vercel. Cambia la forma de
  `snapshotUrl`/`snapshotUploadUrl`, así que exige tocar el embed y migrar las filas
  existentes de `entries`. Hacerlo cuando el volumen lo justifique, no antes.
- **Ciclo de vida en R2**: regla de expiración para blobs de sesiones cerradas hace N meses.
- **Migraciones en CI**: job serializado que corra `db:migrate` en el merge a `main`,
  para no depender del `bun run db:migrate` manual de 2.1.
- **Neon branching por preview**: un branch de Neon por PR, para que las previews de
  Vercel no escriban en la base de producción.

---

## Resumen de archivos que toca el agente

| Archivo | Fase | Cambio |
| --- | --- | --- |
| `apps/web/package.json` | 1.1, 4.1 | `+aws4fetch`, `-sharp` |
| `package.json` (raíz) | 4.1 | quitar `sharp` de `ignoreScripts`/`trustedDependencies` |
| `apps/web/lib/env.ts` | 1.2 | 4 vars `R2_*` + `hasR2()` + tabla de la cabecera |
| `apps/web/lib/api/blob-store.ts` | 1.3 | backend R2 \| fs; adiós al sidecar `.meta.json` |
| `.env.example` | 1.2 | bloque R2 documentado |
| `turbo.json` | 1.2 | `globalEnv` += `R2_*`, `SESSION_SECRET` |
| `vercel.json` | 3.1 | nuevo |
| `apps/web/app/dev/host/page.tsx` | 4.2 | `notFound()` en producción |

**No se tocan**: `packages/embed`, `apps/web/app/api/blobs/[uuid]/route.ts`,
`lib/blob-token.ts`, `lib/db/**`, `scripts/seed.ts`.
