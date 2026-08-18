# @punto/web

App Next.js 16 (App Router) de Punto: el panel (`/app`), el documento público
(`/s/:publicId`), el API (Route Handlers en `app/api/**`) y el host de pruebas
(`/dev/host`).

No se arranca desde aquí: el arranque, el `.env` y los gates están en el
[README de la raíz](../../README.md). Desde la raíz, `bun run dev` levanta esto en el
puerto `3003` después de construir el embed.

```
app/api/**        API pública del Documento y API-key del Embed; el Panel no expone API
app/s/[publicId]  el documento público (§8)
app/app/**        el Panel autenticado (§9)
app/dev/host      página dummy para probar la bolita del embed
components/punto  los cinco componentes propios del §6
components/ui     shadcn/ui
lib/db/**         Drizzle + Neon
lib/fixtures.ts   datos fuente que `db:seed` inserta para la Demo
public/mock/**    snapshots rrweb y thumbnails fuente; el seed los lleva a `.data/blobs`
```

Comandos propios (se ejecutan mejor desde la raíz, que carga el `.env`):

```bash
bun run db:generate   # nueva migración a partir de lib/db/schema.ts
bun run db:migrate
bun run db:seed --email tu@correo.com --password "mínimo-8"
```
