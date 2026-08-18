# Spec — Acceso, Instructivo de instalación y Demo

> Extiende el `PRD.md`; no lo reemplaza. Donde esta spec y el PRD se contradigan, **manda esta
> spec** y el punto en conflicto queda listado en §0.
>
> Vocabulario en `CONTEXT.md`. Decisiones con historia en `docs/adr/`.
> **Estado:** definición cerrada tras interrogatorio. Lista para construir.

---

## 0. Qué contradice del PRD

Cuatro puntos del PRD dejan de ser verdad. No se editan allí; se anulan aquí.

| PRD | Decía | Ahora |
| --- | --- | --- |
| §1 No objetivos | «No hay login para ver un documento» | Sigue vigente **para el Documento**. El Panel sí requiere cuenta. |
| §2 Decisiones cerradas | `Acceso: link secreto sin login; API key pública por proyecto` | Tres reglas que no se mezclan (§1) |
| §9 | «Mínimo a propósito. Es solo para sacar la API key y encontrar sesiones viejas» | Requiere cuenta, y además entrega el Instructivo |
| §12.6 | «`/app` y `/app/:id` renderizan con datos y en estado vacío» | …**y solo con cuenta**. Sin `DATABASE_URL` el Panel no renderiza: muere la caída a fixtures |

Y dos renombres: `/s/mock` → `/s/demo`, y los fixtures del Panel desaparecen (los del Documento
no; §4).

---

## 1. La frontera de acceso

Tres superficies, tres credenciales, y **no se mezclan**. Es la regla que decide cada ruta nueva.

| Superficie | Ruta | Credencial | Quién entra |
| --- | --- | --- | --- |
| **Panel** | `/app/*` | Acceso (cookie de Cuenta) | El Dueño, y solo a lo suyo |
| **Documento** | `/s/:publicId`, `GET /api/sessions/:publicId`, `.../agent.md` | El link secreto **es** la credencial | Cualquiera con el link: el humano y el agente |
| **Embed** | `POST /api/sessions`, `.../entries`, `PATCH`, `PUT|GET /api/blobs/:uuid` | `x-api-key: pk_…` del Proyecto | El sitio del cliente |

Consecuencias que no se negocian:

- **Al Embed no se le mete Acceso.** Corre en el navegador del cliente, donde no existe nuestra
  cookie. Autenticarlo con Cuenta rompe el producto entero.
- **Al Documento no se le mete Acceso.** El agente que hace `fetch` no tiene cuenta, y el PRD §1
  lo declara no-objetivo. Sigue siendo no-objetivo.
- **Lo único autenticado es el Panel, y el Panel no tiene rutas de API** (§2.4, `docs/adr/0002`).

---

## 2. Acceso

### 2.1 El modelo

`Cuenta 1—N Proyecto`. Un Proyecto tiene exactamente un **Dueño** y no se comparte: sin equipos,
sin invitaciones, sin roles. El **Revisor** —quien anota desde la bolita— no tiene Cuenta ni la
necesita.

```
accounts
  id            text pk           'acc_…'
  email         text unique       normalizado a minúsculas y trim
  passwordHash  text
  createdAt     timestamptz

projects
  ownerId       text NOT NULL → accounts.id  onDelete: cascade   ← nuevo
```

`ownerId` nace `NOT NULL` porque la base se limpia (§5). Índice en `(owner_id, created_at)`: es
la consulta del Panel.

**El correo es identificador, no canal.** Punto no envía un solo correo. Por tanto: no se
verifica, y **no hay recuperación de contraseña**. Contraseña perdida = cuenta perdida, se
arregla con un `UPDATE` en Neon. Esto es deliberado, no una fase pendiente.

### 2.2 Registro y entrada

- `/signup` y `/login` cuelgan de la **raíz**, no de `/app`.
- Un formulario cada uno: correo y contraseña. **Registro público**: cualquiera crea cuenta.
- Contraseña: **mínimo 8 caracteres**, sin reglas de mayúsculas ni símbolos. Validación Zod en el
  servidor, no solo en el cliente.
- Hasheo: **`bcryptjs`**, coste 10. JavaScript puro a propósito — `Bun.password` no existe bajo el
  runtime de Node en el que corre Next, y `bcrypt` nativo arrastra `node-gyp` y sorpresas de
  despliegue.
- **Mismo mensaje de error** para «correo inexistente» y «contraseña incorrecta». Distinguirlos
  convierte el registro público en un buscador de qué correos tienen cuenta.
- **Sin rate-limit.** Decisión tomada con la exposición encima de la mesa; ver §7.
- Cambio de contraseña desde dentro del Panel: formulario `actual` + `nueva`. No invalida los
  Accesos ya emitidos (§2.3).

### 2.3 El Acceso

JWT firmado (`jose`, HS256) en cookie `httpOnly`, `secure`, `sameSite: 'lax'`, `path: '/'`.
Carga mínima: `accountId` y `expiresAt`. Nada de PII, nada de hashes.

**Deslizante a 7 días**: cada visita al Panel re-emite la cookie con 7 días nuevos. Uso normal
nunca expulsa; una semana de abandono caduca.

> **Cerrar sesión es cosmético.** Borra la cookie del navegador; el token sigue válido hasta
> caducar. No hay «cerrar sesión en todos los dispositivos» y cambiar la contraseña no mata nada.
> La caducidad **es** la revocación — de ahí los 7 días. Razonado en `docs/adr/0001`.

Secreto en `SESSION_SECRET` (`openssl rand -base64 32`), en `lib/env.ts` con el mismo patrón
perezoso por-variable que el resto, y documentada en `.env.example`.

### 2.4 Dónde se verifica

Next 16 tiene dos trampas aquí, las dos documentadas, las dos contraintuitivas:

1. **Un layout no es frontera de auth.** Por render parcial, `app/app/layout.tsx` no se
   re-renderiza al navegar, y ocultar segmentos no impide que se ejecuten ni que aparezcan en el
   RSC Payload. Devolver `null` desde un componente raíz está explícitamente desaconsejado.
2. **Una Server Action no queda protegida por el `redirect` de su página.** No son rutas: son
   POST a la ruta donde se usan. Cada una verifica sola.

Entonces, dos capas:

- **`proxy.ts`** (raíz, hermano de `app/`; **no** `middleware.ts`, que está deprecado en Next 16 —
  hay codemod). Runtime Node.js obligatorio: `export const runtime` ahí **lanza error**.
  Comprobación **optimista**: lee la cookie, valida la firma, y si no hay, redirige a `/login`.
  **Nunca toca la base** — el proxy corre en cada request, incluidos los prefetch. Aquí también se
  re-emite la cookie deslizante, y se escribe en el `NextResponse`, no con `cookies().set()`.
  Con `matcher`, para no interceptar `_next/static` ni `public/`.
- **DAL** (`lib/dal.ts`, `import 'server-only'`, memoizada con `cache()` de React). Es la
  verificación real, pegada a los datos: `requireAccount()` devuelve la Cuenta o hace
  `redirect('/login')`. La llaman las páginas, los componentes hoja y **cada Server Action**.

No se activa `experimental.authInterrupts`: `unauthorized()`/`forbidden()` siguen experimentales y
un `redirect('/login')` hace el trabajo. `next.config.ts` se queda vacío.

`cookies()` es asíncrona en Next 16 (el shim sincrónico de 15 se eliminó) y leerla vuelve la ruta
dinámica. Ninguna función cacheada puede leerla: la restricción sigue la pila de llamadas y falla
en runtime, así que puede **pasar `next build` y romperse en `next start`**.

### 2.5 Aislamiento

`getProjects()` y `getProjectDetail()` pasan a filtrar por `ownerId`. Entrar por id a un proyecto
ajeno responde **404, no 403**: un 403 confirma que ese proyecto existe.

---

## 3. Instructivo de instalación

### 3.1 El botón

En `/app/:projectId`, junto al `Copiar snippet` que ya existe: un segundo botón con **icono de
robot** (`BotIcon` de lucide) que copia el Instructivo al portapapeles y confirma con toast.

Se nombra por su lector —«para el agente»— porque es lo único que lo distingue de copiar el
snippet a secas. Ojo: el Documento ya tiene una pestaña «Para el agente» con un «Copiar prompt»
que hace algo distinto (arreglar, no instalar). En el código y en la conversación los términos son
**Instructivo de instalación** y **Prompt de corrección**; nunca «el markdown del agente».

### 3.2 El contenido

`buildInstallMarkdown(project, origin)` en `packages/contracts`, al lado de `buildAgentMarkdown()`.
Genera markdown por Proyecto, con la clave pública ya incrustada.

**Su lector es un agente corriendo en el repo del cliente**, no un humano: es un prompt con
instrucciones ejecutables, no una guía. Un `<script>` en un bloque de código no sirve — eso ya lo
da el otro botón. Lo que aporta es lo que el tag no dice:

1. **Dónde va.** El agente **detecta el framework leyendo el repo**. App Router → `app/layout.tsx`
   antes de `</body>`; Vite → `index.html`. No se le pregunta el stack a nadie: sabe leer.
2. **Solo en desarrollo.** El tag se condiciona a `NODE_ENV !== 'production'`. Se commitea, pero
   nunca sale al aire. Sin esto, la bolita aparece en la producción del cliente y cualquier
   visitante puede abrir sesiones contra el Proyecto.
3. **El `data-api`.** Se imprime desde `PUNTO_ORIGIN` (hoy `http://localhost:3003`; el sitio bajo
   revisión suele estar en `:3000`). Al desplegar Punto, el Instructivo cambia solo.
4. **CSP.** Si el sitio tiene `Content-Security-Policy`, permitir el origen de Punto en
   `script-src` y `connect-src`, o el script no carga o falla la subida del blob (PRD §13.3).
5. **Cómo comprobarlo.** Recargar y ver la bolita abajo a la derecha.

No depende del Acceso: se puede construir y probar antes que el login.

---

## 4. Demo

`/s/mock` → **`/s/demo`**, y cambia de naturaleza: deja de ser fixture de pruebas y pasa a ser
**superficie de producto**, el escaparate de la landing.

Es **el Documento real con datos sembrados**, no una réplica en React. Mismo componente que ve un
cliente en su sesión de verdad, con el pipeline completo: snapshot rrweb, `rebuild` en el iframe,
escalado, marcadores clicables. Si el visor se rompe, la Demo se rompe — y eso es la ventaja: la
landing no puede mentir sobre el producto.

Se siembra en la base con `db:seed`. **Es el trabajo grande de los tres**, no el login: obliga a
generar snapshots rrweb reales en `.data/blobs`, y los fixtures de hoy no son archivos de snapshot.

Sigue cubriendo los casos difíciles del PRD §10 y por tanto los criterios §12.1–§12.4: tres
pantallas, una entrada `failed`, una anotación `heuristic`.

---

## 5. Datos y migración

**Base limpia.** `drop` + `db:seed` de cero. Los proyectos actuales no se conservan y su
`pk_dev_armot_local` deja de valer donde esté pegada. Esto evita la alternativa —un backfill en
tres pasos— y sobre todo evita meter un hash de contraseña en un `.sql` versionado.

`db:seed` pasa a sembrar: una **Cuenta** (correo y contraseña por argumento o prompt, nunca
hardcodeados), sus **Proyectos** incluido «Armot» con su clave determinista, y la **Demo**
completa con sus blobs.

**Se borran** `GET /api/projects` y `POST /api/projects`. Hoy devuelven todos los proyectos de la
base y crean uno con su clave, **sin autenticar**: se puede saltar el login entero con `curl`. No
se protegen, se eliminan — el Panel lee Postgres directo desde el servidor y nunca las consumió.
Crear proyecto pasa a Server Action que verifica el Acceso adentro. Razonado en `docs/adr/0002`.

**El Panel deja de caer a fixtures.** Sin `DATABASE_URL`, `/app` no arranca. La rama de fixtures
de `lib/get-projects.ts` se elimina: es código donde la auth no aplica, y se activaría **sola** el
día que la connection string esté mal escrita. Los fixtures del Documento (§4) se quedan.

---

## 6. Criterios de aceptación

Se suman a los del PRD §12, con §12.6 anulado y §12.1 renombrado a `/s/demo`.

1. Sin Acceso, cualquier `/app/*` redirige a `/login`. Con Acceso, entra.
2. Un Dueño no ve los proyectos de otra Cuenta: ni en la lista, ni entrando por id (404).
3. Cada Server Action del Panel rechaza una petición sin Acceso, incluso invocada directamente por
   POST — no basta el `redirect` de la página.
4. `GET /api/projects` y `POST /api/projects` responden 404: ya no existen.
5. Las rutas del Embed siguen funcionando **sin** cookie, solo con `x-api-key`. `/s/:publicId` y
   `.../agent.md` siguen abiertos sin cuenta.
6. `/login` da el mismo error para correo inexistente y para contraseña incorrecta.
7. El Acceso se re-emite en cada visita: tras 8 días sin entrar, caduca; usándolo a diario, nunca.
8. El botón de robot de `/app/:id` copia el Instructivo y confirma con toast. Pegado en Claude
   Code sobre un Next limpio, el agente deja el Embed instalado y **gateado a desarrollo**.
9. Sin `DATABASE_URL`, `/app` muestra error de configuración — no fixtures.
10. `bun run lint` y `bun run typecheck` limpios. `next typegen` antes de `tsc`: las rutas nuevas
    (`/login`, `/signup`) no tipan hasta regenerar, y `<Link href>` está tipado contra las rutas
    existentes.

---

## 7. Riesgo asumido, con nombre y apellido

Cuatro decisiones, cada una razonable por separado:

1. Registro público
2. Sin verificación de correo
3. Sin rate-limit en `/login`
4. Acceso no revocable

Juntas significan: **una contraseña adivinada da 7 días de Panel —y con él las claves públicas de
todos los Proyectos de esa Cuenta— sin forma de cortarlo salvo esperar.** Y sin reset por correo,
la víctima tampoco puede recuperar la cuenta.

Está asumido a conciencia, no por descuido. Cuando deje de ser aceptable, el orden de arreglo es:

1. **Turnstile** en `/login` y `/signup` — tapa la fuerza bruta **y** el registro de bots de una
   vez, sin contadores. Hay una skill en este repo que lo cablea.
2. Tabla de sesiones, para que cerrar sesión signifique algo.
3. Verificación de correo, que abre la puerta al reset.
