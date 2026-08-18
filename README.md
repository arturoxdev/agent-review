# Punto

Plugin instalable para hacer reviews de UI. Se pega un `<script>` en cualquier app y
aparece una bolita flotante: el revisor señala elementos reales de la pantalla, escribe
comentarios y al enviar se guarda **el DOM serializado** (no una captura). Al cerrar la
sesión obtiene un link con todas las pantallas, sus recuadros y sus comentarios.

Ese link tiene dos lectores: el humano abre `/s/:publicId` y lee el documento; el agente
hace `fetch` al mismo recurso y recibe JSON con selector, componente y ruta de archivo de
cada anotación.

La definición completa está en [`PRD.md`](./PRD.md).

## Estructura

```
apps/web            Next.js 16 (App Router) — panel, viewer público y API (Route Handlers)
packages/embed      El snippet: Preact + Tailwind sin shadcn, todo en un Shadow DOM.
                    Se bundlea a apps/web/public/embed.js (generado, no se commitea)
packages/contracts  Tipos y esquemas Zod compartidos por embed, API y viewer
```

Monorepo Bun + Turborepo. TypeScript estricto, sin `any`.

## Arranque

Requisitos: [Bun](https://bun.sh) 1.3+ y una cuenta de [Neon](https://neon.tech) (gratis).

```bash
bun install
cp .env.example .env      # si aún no existe
```

### 1. Pega tu `DATABASE_URL` de Neon

En https://console.neon.tech → tu proyecto → **Connect** → copia la *connection string*
**pooled** (la del host con `-pooler`, termina en `?sslmode=require`) y pégala en el `.env`
de la raíz:

```
DATABASE_URL=postgresql://usuario:password@ep-xxx-pooler.region.aws.neon.tech/neondb?sslmode=require
```

Genera también `SESSION_SECRET` y `BLOB_UPLOAD_SECRET`; todas las variables están documentadas en
[`.env.example`](./.env.example). El `.env` vive en la raíz y `apps/web/.env` es un symlink
a él.

> Sin `DATABASE_URL`, el Panel no renderiza ni cae a fixtures. Las superficies que no
> necesitan Postgres, como el host de desarrollo y el almacenamiento de blobs, sí arrancan.

### 2. Migra y siembra

```bash
bun run db:migrate
bun run db:seed --email tu@correo.com --password "mínimo-8"
```

### 3. Levanta

```bash
bun run dev               # http://localhost:3003
```

El puerto es `3003` a propósito, para no pelear el `:3000` del front que estés revisando.
Se cambia con `PORT=3010 bun run dev`. `bun run dev` y `bun run build` construyen el embed
antes que la app: `apps/web/public/embed.js` nunca hay que generarlo a mano.

## Dónde ver cada superficie

| Ruta | Qué es |
| --- | --- |
| `/` | Portada |
| `/login`, `/signup` | Entrada y registro público del Panel |
| `/app` | Panel autenticado: solo los proyectos de la Cuenta |
| `/app/:projectId` | Detalle: snippet, API key y tabla de sesiones |
| `/s/demo` | El Documento real de la Demo sembrada (índice, 3 pantallas, marcadores) |
| `/s/:publicId` | Un documento real |
| `/dev/host` | Página dummy con la bolita cargada, para probar el embed sin otro repo |
| `/api/sessions/demo` | La Demo en JSON, pública por su link secreto |

## Pegar el snippet en un host externo

En `/app/:projectId` está el snippet listo para copiar. Es esto:

```html
<script src="http://localhost:3003/embed.js" data-key="pk_dev_armot_local"
        data-api="http://localhost:3003" defer></script>
```

Va antes de `</body>` del sitio que quieras revisar. `data-api` es el origen de Punto; en
producción, cuando el script y el API viven en el mismo origen, se puede omitir. Si el
sitio anfitrión tiene `Content-Security-Policy`, hay que permitir ese origen en
`script-src` y en `connect-src`.

## Quality gates

```bash
bun run lint
bun run typecheck
bun run build
```

Los tres deben salir limpios (PRD §12.9).

## Otros comandos

```bash
bun run db:generate                      # nueva migración a partir del schema de Drizzle
bun run --cwd packages/embed build:watch # recompila el embed al vuelo mientras lo editas
```
