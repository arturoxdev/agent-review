---
status: accepted
---

# El Panel no expone API HTTP; el Embed sí

Al meter cuentas descubrimos que `GET /api/projects` devolvía todos los proyectos de la base y
`POST /api/projects` creaba uno con su clave pública, ambos sin autenticar: un agujero que
saltaba el login entero. Borramos las dos rutas en vez de protegerlas, porque el Panel es Server
Components y lee Postgres directo —nunca consumió su propio API por HTTP— y crear proyecto cabe
en una Server Action.

## Consequences

La tabla de endpoints del PRD §4 listaba esas rutas como «endpoints que la UI consume». Era falso
y ahora tampoco existen.

La frontera queda así, y es lo que hay que respetar al añadir rutas: las del **Embed**
(`POST /api/sessions`, `/entries`, `PUT|GET /api/blobs/:uuid`) autentican con `x-api-key` y las
llama el sitio del cliente, donde no hay ninguna cookie nuestra — meterles Acceso rompe el
producto. Las del **Documento** (`GET /api/sessions/:publicId`, `.../agent.md`) son públicas por
diseño: el link secreto es la credencial, y el agente que las lee no tiene cuenta. Lo único
autenticado es el Panel, y el Panel no tiene rutas.

Si algún día hace falta un API HTTP del Panel (un CLI, un integrador), necesita su propio esquema
de tokens de portador. La cookie del Acceso no sirve para eso.
