# ROADMAP.md — Decide Nicaragua

> Última actualización: 2026-03-21
> Este roadmap es orientativo. Las fechas son estimaciones relativas, no absolutas.

---

## Visión

Construir la infraestructura digital de participación democrática más confiable para ciudadanos nicaragüenses en el exilio, verificable independientemente y diseñada para resistir presiones políticas adversas.

---

## Estado actual: Pre-MVP (Fundamentos)

El repositorio está en fase de scaffolding. No hay código de producción aún.

---

## Fase 0 — Fundamentos del sistema (Semanas 1-2)

**Objetivo:** Monorepo funcional con entorno de desarrollo reproducible y pipeline de CI básico.

### Entregables
- [ ] Monorepo configurado (pnpm + Turborepo)
- [ ] `apps/api` — NestJS inicializado con módulos base
- [ ] `apps/web` — Next.js 15 inicializado con App Router
- [ ] `packages/shared` — tipos base compartidos
- [ ] `packages/tsconfig` — configuraciones TypeScript base
- [ ] Docker Compose para desarrollo local (API, Web, PostgreSQL, Redis)
- [ ] Docker Compose para producción con Traefik
- [ ] Schema de Prisma inicial con tablas base
- [ ] Variables de entorno documentadas en `.env.example`
- [ ] `.gitignore` completo
- [ ] CI básico: typecheck + lint en cada PR (GitHub Actions)

### Criterios de éxito
- `pnpm dev` levanta todo el stack en local.
- `pnpm build` genera builds sin errores.
- Los tipos de `@decide/shared` son usados por `web` y `api`.

---

## Fase 1 — Autenticación y usuarios (Semanas 3-5)

**Objetivo:** Sistema de auth completo y seguro con gestión de identidad separada del perfil operativo.

### Entregables
- [ ] Módulo `auth` en NestJS:
  - [ ] Registro con email + password (bcrypt)
  - [ ] Login con JWT (access + refresh en cookies HttpOnly)
  - [ ] Logout con invalidación de refresh token
  - [ ] Refresh de tokens
  - [ ] Rate limiting en endpoints de auth
- [ ] Módulo `users` en NestJS:
  - [ ] CRUD de usuarios con RBAC
  - [ ] Roles: `citizen`, `observer`, `collaborator`, `admin`
  - [ ] Estados de cuenta: `pending`, `active`, `suspended`, `deleted`
- [ ] Módulo `profiles` en NestJS:
  - [ ] Perfil operativo separado de identidad
  - [ ] Campos: nombre público, departamento de origen, país de residencia
- [ ] Módulo `audit` en NestJS:
  - [ ] Interceptor de auditoría transversal
  - [ ] Tabla append-only con trigger PostgreSQL
- [ ] Frontend:
  - [ ] Páginas de login, registro, dashboard básico
  - [ ] Gestión de sesión con cookies (sin localStorage)
  - [ ] Guards de rutas por autenticación y rol
- [ ] Tests unitarios en módulos de auth y users
- [ ] Tests de integración de flujo completo de auth

### Criterios de éxito
- Un usuario puede registrarse, iniciar sesión, actualizar su perfil y cerrar sesión.
- Los tokens expiran y se renuevan correctamente.
- Todos los eventos de auth aparecen en `audit_events`.
- Rate limiting funciona: el 6° intento de login es rechazado.

---

## Fase 2 — Grupos territoriales y deliberación (Semanas 6-9)

**Objetivo:** Los usuarios pueden organizarse por territorio y participar en debates estructurados.

### Entregables
- [ ] Módulo `groups`:
  - [ ] Grupos por departamento de origen (17 departamentos de Nicaragua)
  - [ ] Grupos por país de residencia
  - [ ] Membresías automáticas basadas en perfil
  - [ ] Grupos personalizados creados por admins
- [ ] Módulo `deliberation`:
  - [ ] Creación de propuestas con estado (draft, active, closed)
  - [ ] Comentarios y respuestas anidadas
  - [ ] Sistema de consenso/disenso básico (señal de acuerdo/desacuerdo)
  - [ ] Moderación por admins
- [ ] Frontend:
  - [ ] Vista de grupos del usuario
  - [ ] Feed de propuestas por grupo
  - [ ] Interfaz de debate con comentarios
  - [ ] Notificaciones básicas (in-app)
- [ ] Tests unitarios e integración de módulos nuevos

### Criterios de éxito
- Un ciudadano puede ver sus grupos territoriales automáticamente.
- Puede crear y comentar propuestas en sus grupos.
- Los admins pueden moderar contenido.

---

## Fase 3 — Votación Condorcet (Semanas 10-13)

**Objetivo:** Sistema de votación verificable con método Condorcet (Schulze).

### Entregables
- [ ] Módulo `voting`:
  - [ ] Creación de elecciones con candidatos/opciones
  - [ ] Votación por ranking (método Condorcet-Schulze)
  - [ ] Validación de elegibilidad (rol, grupo)
  - [ ] Período de votación con apertura/cierre automático
  - [ ] Resultado verificable: hash de todos los votos publicado
  - [ ] Exportación de resultados en formato abierto (JSON, CSV)
- [ ] Implementación del algoritmo Schulze con tests exhaustivos
- [ ] Verificador independiente: script standalone que recalcula resultados desde datos exportados
- [ ] Frontend:
  - [ ] Interfaz de votación con drag-and-drop para ranking
  - [ ] Resultados con visualización del método Condorcet
  - [ ] Descarga del paquete de verificación

### Criterios de éxito
- Los resultados calculados por el sistema son idénticos a los del verificador externo.
- Un observador sin acceso al servidor puede verificar el resultado con los datos exportados.
- Los votos individuales son privados; los agregados son públicos.

---

## Fase 4 — Sortition verificable (Semanas 14-16)

**Objetivo:** Selección aleatoria de representantes verificable por cualquier participante.

### Entregables
- [ ] Módulo `sortition`:
  - [ ] Definición de pools de elegibles con criterios (grupo, rol, voluntario)
  - [ ] Generación de seed aleatorio verificable (compromiso previo + reveal)
  - [ ] Selección determinística a partir del seed
  - [ ] Registro público del proceso (seed, pool, selección)
- [ ] Protocolo de compromiso (commit-reveal) para seed
- [ ] Frontend:
  - [ ] Panel de sortition con transparencia del proceso
  - [ ] Verificador de selección (cualquier usuario puede recalcular)

### Criterios de éxito
- Cualquier persona puede verificar que la selección fue aleatoria y no manipulada.
- El proceso es reproducible dado el seed público.

---

## Fase 5 — Auditoría pública y donaciones (Semanas 17-20)

**Objetivo:** Transparencia financiera y acceso público al audit log.

### Entregables
- [ ] Módulo `donations`:
  - [ ] Registro de causas y presupuestos
  - [ ] Trazabilidad de donaciones (sin procesamiento de pagos en MVP)
  - [ ] Estados: comprometido, recibido, gastado, reportado
  - [ ] Exportación de libro de registro
- [ ] API pública de auditoría:
  - [ ] Endpoint público para consultar eventos de auditoría (sin PII)
  - [ ] Verificación de integridad de la cadena de eventos
- [ ] Frontend:
  - [ ] Dashboard público de transparencia
  - [ ] Historial de causas y uso de fondos

---

## Fase 6 — Endurecimiento de seguridad (Semanas 21-24)

**Objetivo:** Preparar el sistema para mayor escala y amenazas más sofisticadas.

### Entregables
- [ ] MFA con TOTP (Google Authenticator compatible)
- [ ] Cifrado en reposo de datos Nivel 1 (pgcrypto o cifrado a nivel aplicación)
- [ ] Backup cifrado automático a almacenamiento offsite
- [ ] Log shipping a sistema de monitoreo externo
- [ ] Auditoría externa de código (contratar o voluntarios de seguridad)
- [ ] Política de divulgación responsable de vulnerabilidades
- [ ] Documentación de procedimientos de respuesta a incidentes

---

## Fuera del alcance (por ahora)

- Procesamiento de pagos en línea.
- Aplicación móvil nativa.
- Anonimato fuerte a nivel de red (Tor integration).
- Microservicios (todo en monolito modular hasta necesitar escala).
- IA/ML para moderación de contenido.
- Integración con sistemas externos de identidad.

---

## Decisiones de prioridad pendientes

Antes de iniciar Fase 1, se debe decidir:

1. **Verificación de identidad en el MVP**: ¿invitación manual por admin, código de referido, o formulario de solicitud con revisión?
2. **Dominio de producción**: confirmar dominio definitivo para configurar TLS y CORS.
3. **Proveedor de email**: SMTP propio en VPS o servicio externo (Resend, Postmark, SES).
4. **Idioma del sistema**: ¿solo español, o soporte para inglés desde el inicio?

---

## Métricas de éxito del MVP completo

| Métrica | Objetivo |
|---|---|
| Usuarios registrados y verificados | 100+ para primera votación real |
| Tiempo de respuesta del API (p95) | < 500ms |
| Uptime | > 99% mensual |
| Votaciones completadas sin incidentes | 1 votación piloto exitosa |
| Resultados verificados externamente | 100% de votaciones |
| Incidentes de seguridad Nivel 1 | 0 |
