# CLAUDE.md

## Proyecto
Este repositorio contiene la construcción de la plataforma “Decide Nicaragua”, una infraestructura digital para participación democrática verificable, transparencia organizativa y toma de decisiones auditables para ciudadanos nicaragüenses, iniciando con miembros en el exilio.

## Principios permanentes
- Prioridad a seguridad, privacidad y trazabilidad.
- Diseñar primero para legitimidad democrática, luego para escala.
- Favorecer modularidad, claridad y componentes auditables.
- Todo resultado importante debe ser verificable de forma independiente.
- Evitar complejidad innecesaria.
- Mantener enfoque 80/20: primero lo mínimo que produce confianza real.

## Contexto operativo
- Usuarios iniciales: hasta 1000.
- Fase inicial: círculo cerrado de miembros en el exilio.
- No se requiere anonimato fuerte desde el día 1.
- Sí se requiere seguridad seria y protección de datos personales.
- La arquitectura debe poder endurecerse para escenarios de mayor riesgo en el futuro.
- Desarrollo en VS Code con Claude Code.
- Despliegue inicial en VPS Ubuntu de Hostinger con Docker Compose.

## Stack preferido
- TypeScript end-to-end
- Frontend: Next.js
- Backend: NestJS
- Base de datos: PostgreSQL
- Redis para colas, caché y rate limiting
- Docker Compose para desarrollo y producción inicial
- Reverse proxy con Nginx o Traefik
- Monorepo con pnpm + Turborepo, salvo que exista una razón fuerte para no usarlo

## Módulos MVP esperados
- Autenticación y registro seguro
- Roles de usuario: ciudadano nicaragüense, observador, colaborador externo
- Perfil con lugar de nacimiento y residencia
- Grupos territoriales por origen y residencia
- Debate/consenso
- Sortition verificable
- Votación Condorcet
- Auditoría pública
- Causas, presupuestos y donaciones trazables en versión básica

## Reglas de trabajo para Claude
- Trabajar por iteraciones pequeñas y explícitas.
- Antes de cambios grandes: explicar plan, archivos a tocar y riesgos.
- No hacer refactors masivos sin justificación.
- Documentar decisiones técnicas en `docs/DECISIONS.md`.
- Mantener actualizado `docs/ARCHITECTURE.md` cuando cambie la arquitectura.
- Mantener actualizado `docs/SECURITY.md` cuando cambie el modelo de amenazas.
- Escribir código claro, mantenible y con nombres explícitos.
- Incluir tests en los módulos críticos.
- Justificar decisiones de seguridad.
- No exponer secretos ni hardcodear credenciales.
- Preferir software libre y componentes auditables.

## Prioridades de seguridad
- Separar identidad real, perfil operativo y perfil público cuando aplique.
- Proteger datos sensibles.
- Implementar rate limiting, validación de inputs y logging seguro.
- Prevenir CSRF, XSS, SQLi y exposición accidental de datos.
- Mantener secretos fuera del repositorio.
- Diseñar auditoría append-only para eventos críticos.

## Forma de responder esperada
En cada iteración:
1. objetivo
2. archivos a crear o editar
3. implementación
4. tests
5. resumen de cambios
6. riesgos
7. siguiente paso recomendado