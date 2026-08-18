---
status: accepted
---

# El Acceso vive en un JWT y no se puede revocar

El Panel (`/app`) pasa a requerir cuenta, así que hace falta recordar a una persona entre
requests. Elegimos guardar el Acceso entero en una cookie firmada (JWT, deslizante a 7 días,
re-emitida en cada visita) en vez de una tabla de sesiones en Postgres, porque no cuesta ni una
tabla ni un `SELECT` por request y es el camino que documenta Next.

## Considered Options

Una tabla `auth_sessions` con un id opaco en la cookie era la alternativa. Se descartó a pesar de
que resuelve la revocación: en este producto la palabra «sesión» ya está tomada —una Sesión es un
review, la tabla `sessions` ya existe y significa eso— y meter sesiones de login en la base
obligaba a un segundo término (`auth_sessions`) que el equipo tendría que desambiguar cada vez.

## Consequences

**Cerrar sesión es cosmético.** Borra la cookie del navegador; el token sigue siendo válido hasta
que caduque. No hay «cerrar sesión en todos los dispositivos».

**Cambiar la contraseña no invalida nada.** El formulario de cambio (que sí existe) cierra la
puerta a futuros inicios de sesión, no a los tokens ya emitidos.

**La caducidad es la única revocación.** De ahí los 7 días: es la ventana máxima de un token
robado, y es el motivo de rechazar los 30 días fijos.

Esto se combina con dos decisiones tomadas en la misma conversación y agrava el resultado: el
registro es público sin verificación de correo, y `/login` no tiene rate-limit. Una contraseña
adivinada da 7 días de acceso al Panel —y con él a las claves públicas de todos los proyectos de
esa Cuenta— sin forma de cortarlo salvo esperar. Si esto deja de ser aceptable, el orden de
arreglo es: Turnstile en `/login` y `/signup` primero (tapa también el registro), tabla de
sesiones después.
