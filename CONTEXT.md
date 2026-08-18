# Punto

Plugin instalable para reviews de UI: una bolita flotante deja anotar elementos reales de una
pantalla y acumula esas anotaciones en un documento compartible, legible por un humano y por
un agente.

## Language

### Superficies

**Panel**:
La zona autenticada del producto (`/app`): donde una persona administra sus proyectos y
encuentra sus sesiones. Requiere cuenta.
_Avoid_: Dashboard, admin, backoffice

**Documento**:
La página pública de una sesión (`/s/:publicId`). Se accede por link secreto, nunca por cuenta;
el mismo recurso responde JSON para un agente.
_Avoid_: Reporte, viewer, informe

**Embed**:
El `<script>` que se instala en el sitio del cliente y pinta la bolita. Autentica con la clave
pública del proyecto, nunca con una cuenta.
_Avoid_: Snippet (el snippet es el texto que se pega; el embed es lo que corre), widget, plugin

### Cuentas

**Cuenta**:
Una persona identificada por su correo, capaz de entrar al Panel. Es la dueña de sus proyectos.
_Avoid_: Usuario, user, miembro, perfil

**Dueño**:
La única Cuenta a la que pertenece un Proyecto. Un Proyecto tiene exactamente un Dueño y no se
comparte; nadie más lo ve en su Panel.
_Avoid_: Owner, admin, propietario

**Revisor**:
Quien anota desde la bolita en el sitio del cliente. No tiene Cuenta ni la necesita: le basta la
bolita y el link del Documento.
_Avoid_: Usuario, invitado, colaborador

**Correo**:
El identificador único de una Cuenta. No es un canal: Punto no envía correo, así que un Correo
nunca se verifica ni recibe nada.
_Avoid_: Email, mail, dirección

### Sesiones — dos cosas distintas

**Sesión**:
Sin apellido, siempre significa la sesión de review: el conjunto de pantallas anotadas que forma
un Documento. Es lo que ya vive en la tabla `sessions`.
_Avoid_: Review, reporte, ronda

**Acceso**:
La prueba de que una Cuenta entró al Panel. Vive entera en la cookie firmada, no en la base.
Nunca se le dice «sesión» a secas.
_Avoid_: Sesión de usuario, login session, auth session

### Artefactos para agentes

**Instructivo de instalación**:
Markdown generado por Proyecto que un agente ejecuta en el repo del cliente para dejar el Embed
instalado. Su lector es un agente, nunca un humano.
_Avoid_: Guía de instalación, docs, readme

**Prompt de corrección**:
Markdown de una Sesión que un agente ejecuta para arreglar lo anotado. Vive en el Documento y es
lo único que ya existía cuando se dijo «para el agente».
_Avoid_: Prompt del agente, agent.md, reporte

**Demo**:
La Sesión fija que vive en `/s/demo` y sirve de escaparate en la landing. Es el Documento real
con datos sembrados, no una réplica: si el visor se rompe, la Demo se rompe.
_Avoid_: Mock, fixture, ejemplo
