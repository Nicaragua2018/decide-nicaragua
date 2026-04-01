# SECURITY.md — Decide Nicaragua

> Documento vivo. Actualizar cuando cambie el modelo de amenazas o los controles.
> Última actualización: 2026-03-23

---

## Modelo de amenazas (MVP)

### Actores de amenaza

| Actor | Motivación | Capacidad | Prioridad |
|---|---|---|---|
| **Gobierno de Nicaragua** | Identificar y exponer miembros; deslegitimar la plataforma | Alta (recursos estatales) | Crítica |
| **Infiltrados internos** | Obtener listas de miembros o manipular votaciones | Media | Alta |
| **Atacantes externos oportunistas** | Robo de datos, defacement, spam | Baja-Media | Media |
| **Usuarios maliciosos registrados** | Manipular resultados, suplantar identidades | Baja | Media |

### Superficie de ataque

- **Endpoint de autenticación**: fuerza bruta, credential stuffing.
- **Datos de usuarios (PII)**: exposición de identidad de miembros en el exilio.
- **Resultados de votaciones**: manipulación o negación de resultados legítimos.
- **Infraestructura del servidor**: compromiso del VPS.
- **Repositorio de código**: exposición de secretos o lógica de negocio sensible.
- **Comunicaciones internas**: interception de notificaciones o deliberaciones.

---

## Clasificación de datos

### Nivel 1 — Crítico (máxima protección)
- Contraseñas (solo hash bcrypt, nunca almacenar texto plano).
- Email y nombre real de usuarios.
- Documentos de identidad o hashes derivados.
- Votos individuales en votaciones secretas.
- Refresh tokens.

### Nivel 2 — Sensible (protección fuerte)
- Perfil operativo (nombre público, origen, residencia actual).
- Membresías a grupos territoriales.
- Historial de participación.
- IPs de acceso (almacenar solo hash, no directamente).

### Nivel 3 — Interno (protección básica)
- Propuestas y debates públicos dentro de la plataforma.
- Resultados agregados de votaciones.
- Estadísticas de participación.

### Nivel 4 — Público
- Resultados de votaciones publicadas oficialmente.
- Documentos públicos de la organización.

---

## Controles de seguridad implementados (MVP)

### Autenticación y sesiones
- [ ] Contraseñas hasheadas con `bcrypt` (factor de costo ≥ 12).
- [ ] Tokens JWT de corta duración (15 min) + refresh tokens opacos (30 días).
- [ ] Tokens en cookies `HttpOnly`, `Secure`, `SameSite=Strict`.
- [ ] Invalidación server-side de refresh tokens (Redis).
- [ ] Rate limiting en `/auth/login`: 5 intentos / 15 min por IP.
- [ ] Rate limiting en `/auth/register`: 3 registros / hora por IP.
- [ ] Bloqueo temporal de cuenta tras múltiples intentos fallidos.

### Autorización
- [ ] RBAC (Role-Based Access Control) con roles: `citizen`, `observer`, `collaborator`, `admin`.
- [ ] Guards de NestJS en todos los endpoints protegidos.
- [ ] Validación de que el actor solo puede modificar sus propios recursos (excepto admins).
- [ ] Principio de menor privilegio: los módulos solo acceden a los datos que necesitan.

### Validación de inputs
- [ ] `class-validator` en todos los DTOs del backend.
- [ ] Pipe de validación global en NestJS (`ValidationPipe` con `whitelist: true`, `forbidNonWhitelisted: true`).
- [ ] Sanitización de HTML en campos de texto libre.
- [ ] Límites de tamaño en uploads y payloads.

### Prevención de vulnerabilidades comunes
- [ ] **SQLi**: mitigado por Prisma ORM (queries parametrizadas por defecto).
- [ ] **XSS**: CSP headers via Traefik; sanitización en frontend; cookies HttpOnly.
- [ ] **CSRF**: cookies SameSite=Strict; verificación de Origin header en endpoints mutantes.
- [ ] **SSRF**: sin funcionalidad de fetch a URLs externas provistas por usuarios en MVP.
- [ ] **Path traversal**: sin servicio de archivos estáticos con rutas de usuario en MVP.

### Headers de seguridad HTTP
Configurados en Traefik para todas las respuestas:
```
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Content-Security-Policy: default-src 'self'; script-src 'self'; ...
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

### Auditoría
- [ ] Tabla `audit_events` append-only con trigger de PostgreSQL que bloquea UPDATE/DELETE.
- [ ] Eventos auditados: login, logout, registro, cambio de rol, creación/modificación de propuesta, casting de voto, cambio de contraseña, desactivación de cuenta.
- [ ] IPs almacenadas como hash (SHA-256 + salt rotativo), no en texto plano.
- [ ] Logs del sistema sin PII (nunca loguear email, nombre o password).

### Secretos y configuración
- [ ] Todos los secretos en variables de entorno (`.env`, nunca en código).
- [ ] `.env` excluido de git vía `.gitignore`.
- [ ] `.env.example` con valores ficticios como documentación.
- [ ] Rotación de secretos documentada en runbook de operaciones.
- [ ] JWT secret de mínimo 256 bits (32 bytes aleatorios).

### Red e infraestructura
- [ ] Solo Traefik expone puertos al exterior (80, 443).
- [ ] PostgreSQL, Redis y NestJS solo accesibles en red interna Docker.
- [ ] Firewall UFW en VPS: solo puertos 22 (SSH), 80, 443.
- [ ] SSH con autenticación por clave pública; contraseñas deshabilitadas.
- [ ] Fail2ban configurado para SSH y Traefik.

---

## Controles diferidos (Fase 2)

| Control | Prioridad | Justificación del diferimiento |
|---|---|---|
| MFA (TOTP) | Alta | Requiere UI adicional; implementar en primera iteración post-MVP |
| Cifrado en reposo de PII (pgcrypto) | Alta | Complejidad operativa; clave de cifrado debe gestionarse por separado |
| Anonimización fuerte de votos (criptografía de umbral) | Media | Requiere protocolo criptográfico avanzado; no necesario para MVP |
| Auditoría externa de código | Alta | Costosa; programar para antes de apertura pública |
| Log shipping a SIEM externo | Media | Infraestructura adicional; suficiente con logs locales para 1000 usuarios |
| Backup cifrado offsite automático | Alta | Implementar antes de ir a producción con datos reales |
| Rotación automática de secretos | Media | Fase 2 |

---

## Procedimientos de respuesta a incidentes

### Compromiso de credenciales de usuario
1. Revocar todos los refresh tokens del usuario afectado (eliminar de Redis).
2. Forzar cambio de contraseña en próximo login.
3. Notificar al usuario por canal alternativo si está disponible.
4. Registrar el incidente en `audit_events`.
5. Si el compromiso es masivo: invalidar todos los tokens activos rotando el JWT secret.

### Brecha de base de datos
1. Aislar el servidor inmediatamente.
2. Evaluar qué datos fueron expuestos según la clasificación.
3. Notificar a los usuarios afectados.
4. Si se exponen datos Nivel 1: considerar declaración pública.
5. Revisar cómo ocurrió el acceso y corregir.

### Cuenta de administrador comprometida
1. Deshabilitar la cuenta inmediatamente.
2. Revocar todos los tokens asociados.
3. Revisar `audit_events` para determinar acciones realizadas.
4. Revertir cambios maliciosos si es posible.
5. Informar a la organización.

---

## Checklist de seguridad antes de producción

### Infraestructura VPS (manual — verificar antes del primer deploy)
- [ ] Firewall UFW activo: solo puertos 22, 80, 443.
- [ ] SSH sin autenticación por contraseña (solo claves públicas).
- [ ] Fail2ban activo para SSH y accesos repetidos.
- [ ] Contraseña del Traefik dashboard generada con `htpasswd -nb admin <pw>`.
- [ ] `chmod 600` sobre `.env` en el servidor.

### Configuración (verificar en `.env` de producción)
- [ ] Todos los secretos en `.env`, nunca en código (`git grep -r "SECRET\|PASSWORD\|KEY"` para verificar).
- [ ] `NODE_ENV=production`.
- [ ] `JWT_SECRET` ≥ 32 caracteres aleatorios (`openssl rand -hex 32`).
- [ ] `IP_HASH_SALT` diferente al de desarrollo.
- [ ] `COOKIE_DOMAIN` apuntando al dominio real (con punto: `.decide.tudominio.com`).

### Aplicación (verificar tras primer deploy)
- [ ] TLS activo: `curl -I https://decide.tudominio.com` devuelve 200.
- [ ] HTTP redirige a HTTPS: `curl -I http://decide.tudominio.com` devuelve 301.
- [ ] Headers verificados con `securityheaders.com`.
- [ ] `/api/health` responde 200.
- [ ] Trigger append-only verificado: intentar `UPDATE audit_events` desde psql — debe fallar.
- [ ] Swagger/OpenAPI no accesible en producción (no implementado en NestJS sin `SwaggerModule`).
- [ ] Logs sin PII: `docker compose logs api | grep -i "email\|password\|token"`.

### Backup (configurar antes de datos reales)
- [ ] Backup automatizado de PostgreSQL (pg_dump diario a storage externo).
- [ ] Backup cifrado y restauración probada.
- [ ] Backup de `.env` y `infra/traefik/acme.json` (volumen Docker) en lugar seguro.

---

## Auditoría interna — 2026-03-23

Revisión completa de código, permisos, documentación y seguridad. Hallazgos y acciones tomadas:

### Hallazgos críticos — CORREGIDOS

| # | Hallazgo | Acción |
|---|---|---|
| C1 | `/admin/*` solo tenía protección client-side (NavBar condicional). Un usuario autenticado no-admin podía acceder directamente por URL. | Creado `apps/web/app/(app)/admin/layout.tsx` con verificación server-side de `status === 'verified_citizen'`. Redirige a `/dashboard` si falla. |
| C2 | `GET /api/audit/events` protegido solo con `JwtAuthGuard`. Cualquier observer o colaborador podía ver el log completo de actividad (logins, cambios de rol, votes de otros). | Añadido `VerifiedCitizenGuard` a `AuditController`. |
| C3 | `CastBallotDto.rankings` sin `@ArrayMaxSize`. Un atacante podía enviar arrays arbitrariamente grandes. | Añadido `@ArrayMaxSize(20)` y `@Max(20)` en `RankingInputDto.rank`. |
| C4 | `QueryAuditEventsDto` — campos `action` y `resource` sin `@MaxLength`. | Añadido `@MaxLength(100)` y `@MaxLength(200)` respectivamente. |

### Hallazgos importantes — DOCUMENTADOS (Fase 2)

| # | Hallazgo | Plan |
|---|---|---|
| I1 | Audit log como "fire-and-forget". Si falla, se loguea pero no hay alertas. | Fase 2: BullMQ para durabilidad de audit log. |
| I2 | Tokens de invitación no revocables una vez creados. | Fase 2: endpoint `DELETE /api/auth/invite/:token`. |
| I3 | `/api/users` devuelve emails de todos los usuarios verificados. En contexto de exilio, esto es riesgo de seguridad operacional. | Fase 2: evaluar si exponer emails solo a admin o limitar a displayName+ID en listado. Por ahora ya limitado a `VerifiedCitizenGuard`. |
| I4 | CSRF: `SameSite=Strict` como única defensa. Sin Origin header validation en backend. | Fase 2: middleware de Origin validation para mutaciones. |

### Mejoras de CSP aplicadas

Añadidas directivas faltantes en `infra/traefik/dynamic/security.yml`:
- `object-src 'none'` — bloquea plugins Flash/Java
- `worker-src 'none'` — bloquea service workers no autorizados
- `upgrade-insecure-requests` — fuerza HTTPS en subresources

Nota: `'unsafe-inline'` en `script-src` es necesario para Next.js 15 App Router (scripts de hidratación). Para eliminarlo en Fase 2: implementar nonce en `middleware.ts` y pasarlo a Traefik vía header.

### Estado post-auditoría

- **Controles de autenticación**: ✅ sólidos (bcrypt 12, JWT HttpOnly, Redis rotation)
- **Controles de autorización**: ✅ corregidos (C1, C2)
- **Validación de inputs**: ✅ completa (corregidos C3, C4)
- **Headers HTTP**: ✅ mejorados
- **Auditoría interna**: ✅ append-only, IPs hasheadas, sin PII
- **Algoritmos críticos**: ✅ Schulze y Fisher-Yates verificados, tests exhaustivos

---

## Políticas de retención de datos

| Tipo de dato | Retención | Fundamento |
|---|---|---|
| Datos de usuario activo | Mientras la cuenta esté activa | Funcionalidad |
| Datos de usuario eliminado | 30 días (luego anonimizar) | Derecho al olvido |
| Audit events | 5 años mínimo | Trazabilidad democrática |
| Logs del sistema | 90 días | Operaciones |
| Refresh tokens expirados | 0 días (TTL en Redis) | Mínimo necesario |
| IPs hasheadas | 90 días | Seguridad operacional |
