# Mejoras propuestas — decide-nicaragua

> Archivo de trabajo para registrar mejoras identificadas durante el desarrollo.
> Actualizado: noviembre 2026.

---

## 1. Deuda técnica (correcciones pendientes)

### Alta prioridad

| # | Área | Descripción | Archivo(s) relevante(s) |
|---|------|-------------|------------------------|
| T1 | Backend · Auth | Re-verificar estado `verified_citizen` en cada request (actualmente la comprobación tiene una ventana de ~15 min que podría ser explotada) | `apps/api/src/auth/` |
| T2 | Backend · Audit | `auditBase()` hace una consulta extra a BD para obtener `userId`; pasarlo directamente desde el JWT evita el round-trip | `apps/api/src/audit/audit.service.ts` |
| T3 | Backend · Deliberación | Las señales de consenso se guardan en memoria en `listGroupProposals` y `getProposalById`; deberían venir de BD con una única query | `apps/api/src/deliberation/deliberation.service.ts` |
| T4 | Backend · Usuarios | `UsersService.listUsers` carece de paginación; con muchos usuarios la respuesta puede crecer sin límite | `apps/api/src/users/users.service.ts` |
| T5 | BD · Índices | Faltan índices en: `ballots.profileId`, `consensus_signals.profileId`, `consensus_signals.proposalId` y campos de búsqueda frecuente | Migraciones Prisma |
| T6 | Frontend · NavBar | El enlace "Auditoría" se muestra a todos los usuarios aunque la ruta está protegida por `verified_citizen`; debería ocultarse | `apps/web/app/(app)/layout.tsx` o componente NavBar |
| T7 | Frontend · Dashboard | `group.memberCount` se referencia en `dashboard/page.tsx` pero no existe en el tipo `GroupSummary`; causa error TS | `apps/web/app/(app)/dashboard/page.tsx`, `packages/shared/src/types/` |

---

## 2. Funcionalidades nuevas

### Alta prioridad (impacto directo en la misión)

#### F1 — Modo observador (lectura pública sin autenticación)
- Visitantes externos (periodistas, observadores internacionales, diáspora sin cuenta) deben poder leer propuestas, deliberaciones y resultados electorales publicados sin registrarse.
- Requiere: rutas públicas bajo `/public/`, guard de solo-lectura, opción de «publicar» una propuesta o resultado.
- Archivos: `apps/web/app/(public)/`, `apps/api/src/deliberation/` (endpoint público).

#### F2 — Notificaciones en tiempo real
- Aviso cuando una propuesta en la que el usuario participó recibe un nuevo comentario o cambia de estado.
- Aviso cuando una elección en la que votó se talliza.
- Opciones: Server-Sent Events (SSE) desde NestJS, o un webhook a email/Telegram.
- Archivos: `apps/api/src/notifications/` (nuevo módulo), `apps/web/app/(app)/layout.tsx`.

#### F3 — Verificación ciudadana mejorada
- El flujo actual de `verified_citizen` no está documentado en la UI; los nuevos usuarios no saben qué hacer para participar.
- Añadir: pantalla de onboarding con pasos claros, estado visible en el perfil, enlace al proceso de verificación.
- Archivos: `apps/web/app/(app)/profile/`, `apps/web/app/(app)/onboarding/` (nuevo).

#### F4 — Exportación de resultados
- Los resultados electorales y las señales de consenso deberían poder exportarse como JSON/CSV con hash SHA-256 para verificación independiente.
- Aplica también a los sorteos (sortition): exportar la lista de seleccionados con la semilla reproducible.
- Archivos: `apps/api/src/voting/`, `apps/api/src/sortition/`, nuevo endpoint `GET /api/voting/elections/:id/export`.

### Media prioridad

#### F5 — Delegación de voto (con revocación)
- Un ciudadano puede delegar su voto a otro miembro de confianza para una elección específica.
- **Restricción de seguridad**: la delegación debe poder revocarse en cualquier momento antes del cierre. Sin revocación, no se implementa.
- Archivos: `apps/api/src/voting/`, `packages/shared/src/types/`.

#### F6 — Propuestas vinculadas a inquietudes
- El campo `inquietudes` en `ProposalDetail` ya existe en el backend; falta la UI para vincular/desvincular inquietudes desde la pantalla de edición de propuesta.
- Archivos: `apps/web/app/(app)/proposals/[id]/page.tsx`, `apps/api/src/deliberation/`.

#### F7 — Panel de moderación centralizado
- Actualmente la moderación se hace propuesta a propuesta. Un panel `/admin/moderation` que liste todos los contenidos en revisión agilizaría el trabajo de los moderadores.
- Archivos: `apps/web/app/(app)/admin/` (nuevo), `apps/api/src/forums/moderation/`.

#### F8 — Resumen automático de deliberaciones
- Al cerrar una propuesta, generar un resumen ejecutivo de los argumentos a favor/en contra y las señales de consenso.
- Debe ser trazable (no «síntesis de IA no trazable»): el resumen se genera a partir del texto de los comentarios y se almacena junto con un hash del conjunto de comentarios usado.
- Archivos: `apps/api/src/deliberation/`, nuevo servicio `SummaryService`.

### Baja prioridad / largo plazo

#### F9 — App móvil (PWA o nativa)
- La web actual es responsive pero no está optimizada para notificaciones push en móvil.
- Primera iteración: PWA con `manifest.json` y service worker para notificaciones.

#### F10 — Integración con identidad digital nicaragüense
- Explorar integración con documentos de identidad digitales emitidos por entidades reconocidas de la diáspora para fortalecer la verificación ciudadana.

---

## 3. Mejoras de UX identificadas

| # | Pantalla | Mejora | Notas |
|---|----------|--------|-------|
| U1 | Propuesta · detalle | Mostrar cuántos usuarios han señalado (no solo conteos) | Preservar anonimato: solo el total |
| U2 | Elecciones · nueva | Validar que `startsAt` esté en el futuro al crear | Hoy solo valida que `startsAt < endsAt` |
| U3 | Grupos · lista | Mostrar indicador visual cuando hay actividad reciente (propuestas nuevas en las últimas 24h) | |
| U4 | Perfil | Página de perfil propia con historial de participación (propuestas creadas, señales emitidas, votos) | Sin desanonimizar a terceros |
| U5 | Sortition | Explicar el método de sorteo (Fisher-Yates + SHA-256) en la UI, no solo en docs | Transparencia |
| U6 | General | Modo oscuro (el CSS ya tiene `@media prefers-color-scheme: dark` en parte del sitio; unificar) | |

---

## 4. Seguridad — restricciones que deben mantenerse

> Estas restricciones vienen del documento de diseño (HRP whitepaper) y no deben violarse en ninguna implementación futura.

- Sin claves privadas en el repositorio ni en variables de entorno commiteadas.
- Sin desanonimización de participantes (ni por cruce de datos, ni en exportaciones).
- Sin targeting por dirección Bitcoin o wallet.
- Sin pánico cuántico manufacturado.
- Sin reclamos de autoridad de gobernanza sobre Bitcoin.
- Sin votos vinculantes de Bitcoin ni gobernanza de tokens.
- Sin síntesis de IA no trazable (cualquier resumen automático debe incluir el hash de los textos fuente).
- Sin reputación sin evidencia pública verificable.
- Sin delegación sin mecanismo de revocación explícita.
- Sin ponderación oculta en ningún algoritmo de decisión.
- Sin reporte canónico sin hash reproducible.

---

## 5. Bugs conocidos (no críticos)

| # | Descripción | Estado |
|---|-------------|--------|
| B1 | `group.memberCount` referenciado en `dashboard/page.tsx` pero no existe en `GroupSummary` — error TS en build | Pendiente |
| B2 | El enlace "Auditoría" en la NavBar se muestra a usuarios no verificados | Pendiente |
| B3 | `LiveBallotCount` usa `fetch` directo al backend; si el backend cambia el path de la API, dejará de funcionar silenciosamente | Pendiente |

---

*Este archivo se actualiza manualmente. Para bugs críticos de seguridad, ver `docs/SECURITY.md`.*
