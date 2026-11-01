# Nicaragua Decide — Primeros 200: diseño

Fecha: 2026-11-01 · Autor del pedido: Carlos Robleto · Estado: aprobado por partes en conversación, pendiente de revisión escrita

## 1. Objetivo

Que los primeros ~200 nicaragüenses de la diáspora se organicen por **territorio de origen** y por **comunidad de acogida**, elijan a sus autoridades, deliberen y voten, en una plataforma completa, intuitiva y segura, publicada en **nicaraguadecide.org**.

Primeras decisiones que debe permitir:

- Elegir la **mesa directiva** del sitio (administrador, coordinador general, secretario) y a los **observadores**.
- Organizar comunidades por territorio y por lugar de acogida, que crecen a su ritmo.
- Elegir **2 coordinadores** por comunidad.
- Debatir en **foros** las oportunidades, ventajas, retos y necesidades de cada territorio y comunidad, y colaborar en asuntos de inmigración en la comunidad de acogida.

Criterio de éxito de la fase 1: los primeros invitados se registran, se verifican, se ubican en sus dos comunidades, debaten en foros, eligen coordinadores y a la mesa, y un visitante puede ver los consensos y resultados, todo sin ayuda técnica y sin exponer la identidad de nadie.

## 2. Base

Se evoluciona el prototipo existente (`decide-nicaragua`, monorepo pnpm + Turborepo: `apps/api` NestJS + Prisma + PostgreSQL + Redis, `apps/web` Next.js 15, 155 pruebas). Ya trae: invitación, separación identidad/perfil, grupos territoriales (17), deliberación con señales, votación Schulze con tablas completas, sorteo con semilla pública, auditoría append-only y estados de cuenta (incluido `observer`).

Trabajo de julio 2026 sin confirmar en `main` (142 archivos): se revisa y **se rescatan los foros/encuestas y la configuración de despliegue** para la fase 1; el **agente cívico de IA** pasa a la fase 2; el **anclaje en blockchain** queda para la fase 3. Nada de ese trabajo se descarta: se conserva en una rama propia antes de tocar `main`.

Decisiones descartadas: Decidim (sin democracia líquida ni la verificación pedida, difícil de adaptar en 3 semanas) y piezas sueltas tipo Discourse + votación externa (experiencia partida, identidad y auditoría no unificadas).

## 3. Roles y permisos

| Rol | Cómo se obtiene | Puede |
|---|---|---|
| Visitante | Sin cuenta | Portada pública: qué es, reglas vigentes, cargos (perfil público), **consensos** de foros y debates cerrados y **resultados** de votaciones; formulario de contacto (llega al secretario). No ve conversaciones ni nombres de participantes. |
| Invitado | Invitación por correo | Crear cuenta, elegir territorio de origen y comunidad de acogida, leer; espera verificación. |
| Miembro verificado | Verificación (§4) | Foros, propuestas, votaciones, delegación (fase 2), postularse, invitar (máx. N invitaciones pendientes, regla votable, sugerido 5), ser segunda referencia. |
| Coordinador de comunidad | Elección en su comunidad (§6) | Dentro de su comunidad: crear foros y debates, abrir votaciones internas, moderar (ocultar con motivo registrado; apelable ante la mesa). No ve datos personales. |
| Observador | Elección global (§6) | Solo lectura de lo auditable (§9). No vota ni propone. No ve correos, nombres reales ni IP. Puede ser externo o miembro; sus requisitos los fija la comunidad (regla votable). |
| Mesa directiva | Elección global (§6) | Administrador: técnica, invitaciones, verificaciones, cuentas. Coordinador general: agenda global, convoca elecciones y votaciones de reglas, representa. Secretario: actas, registro de reglas, resultados oficiales, responde a visitantes. |

**Regla de 2 de 3:** suspender una cuenta, aplicar o revertir una regla, anular un proceso y cambiar los permisos de alguien requieren la confirmación de 2 de los 3 miembros de la mesa. Cada confirmación queda en la auditoría.

**Arranque:** Carlos Robleto ocupa la mesa con 2 o 3 primeros invitados (la regla de 2 de 3 rige desde el inicio). Cuando la plataforma alcanza el mínimo de miembros verificados (regla votable, sugerido 12), se convoca automáticamente la primera elección de la mesa y de los observadores.

## 4. Verificación

Garantías exigidas: **persona única** y **nicaragüense**. El territorio de origen es declarado.

**Fase 1 — dos referencias:** el invitado queda verificado cuando lo confirman (a) **quien lo invitó** y (b) **una segunda persona distinta**: el administrador u otro miembro verificado de su mismo territorio de origen o de su misma comunidad de acogida. Cada referencia declara: «conozco a esta persona, es nicaragüense y es una sola persona». Ambas quedan en la auditoría con el perfil público de quien confirma. Las estadísticas de quién confirma más quedan visibles para los observadores.

**Fase 2 — documentos:**

- Pasaporte con chip (ICAO 9303): prueba de conocimiento cero. La plataforma recibe solo «nacionalidad = NIC» y un nulificador único por documento (impide dos cuentas), nunca nombre ni número.
- Cédula o documento del país de acogida sin chip: revisión por el administrador (videollamada o foto que se borra al confirmar); se guarda solo «verificado por documento».
- Las dos referencias siguen disponibles para quien no tiene documentos.

Visitantes curiosos no se verifican.

## 5. Comunidades

- Cada persona pertenece a **dos comunidades**: territorio de origen (uno de los 17: 15 departamentos y 2 regiones autónomas) y comunidad de acogida (país; en EE. UU., estado). La lista de acogida empieza con los países de mayor diáspora y crece a pedido (lo aprueba la mesa).
- **Sin tope de tamaño.** Una comunidad se **activa** (puede elegir coordinadores) al llegar a un mínimo de miembros verificados (regla votable, sugerido 7). Antes de eso ya tiene su foro.
- **Autonomía:** cada comunidad tiene sus foros, debates y votaciones internas.
- **Participación directa en lo global:** todo miembro verificado vota directamente en los asuntos de toda la plataforma.
- Cambio de comunidad de acogida: libre (se registra). Cambio de territorio de origen: solo por solicitud aprobada por la mesa (2 de 3), registrada.

## 6. Cargos, elecciones, delegación y sorteo

**Elecciones periódicas (Schulze):**

| Cargo | Electorado | Período sugerido |
|---|---|---|
| Administrador, coordinador general, secretario (una elección por cargo) | Toda la plataforma | 12 meses |
| Observadores (7 sugeridos) | Toda la plataforma | 12 meses |
| 2 coordinadores por comunidad | Esa comunidad | 6 meses |

Plazo de candidaturas y de votación (sugeridos 7 días cada uno). Resultados con matrices completas. **Revocación anticipada** si la pide una fracción del electorado (sugerido 1/3), que abre elección anticipada. Períodos, plazos y fracción son reglas votables. Para los 7 observadores se elige a los 7 primeros del orden Schulze.

**Democracia líquida (fase 2), solo para voceros y representantes por tema:** cada comunidad crea temas (p. ej. «Inmigración en Costa Rica»); en cada tema, cada miembro delega su confianza en otro o la guarda; la confianza se propaga hasta 3 saltos, sin ciclos; las personas con más confianza quedan acreditadas como voceras del tema; se retira en cualquier momento; todo es público dentro de la comunidad.

**Sorteo:** para formar comisiones o mesas de trabajo entre personas de méritos o capacidades muy similares, o cuando elegir sería una cuestión de afinidad o de bando. Quien convoca (la mesa o los coordinadores de una comunidad) define puestos y elegibles; se usa la semilla pública ya existente; cualquiera puede repetir el cálculo.

## 7. Foros y propuestas

- Foros por comunidad y uno general (se adaptan los de julio).
- Temas, respuestas y señales de apoyo, neutral u objeción.
- Los coordinadores abren foros en su comunidad; la mesa en el general.
- Un tema puede convertirse en **propuesta formal**: deliberación durante un plazo y luego votación.
- Al cerrarse, se publica el **consenso**: conclusión, conteo de señales y objeciones de la minoría. Es lo que ven los visitantes.

## 8. Reglas votables

Página «Reglas»: cada parámetro, su valor y su historial. Parámetros iniciales: número de observadores (7), mínimo para activar comunidad (7), mínimo para la primera elección global (12), períodos de cargos, plazos de candidatura y votación, fracción para revocar (1/3), invitaciones pendientes por miembro (5), participación mínima para cambiar una regla (30 %). Cambiar una regla: propuesta + votación global con mayoría y participación mínima; si gana, el coordinador general y el secretario la aplican (2 de 3). Todo queda auditado.

## 9. Auditoría y observadores

Se registran en la tabla append-only existente: invitaciones, verificaciones (quién confirmó), votos emitidos (sin el contenido del voto), resultados, sorteos, cambios de reglas, moderación, acciones de la mesa y cambios de comunidad. Panel de observadores, solo lectura: el registro, las matrices de cada votación, las semillas de los sorteos y estadísticas de verificación (por camino, y quiénes confirman más). Sin correos, nombres reales ni IP.

## 10. Agente de IA (fase 2)

Asistente de los foros: (a) **moderación**: marca mensajes que parecen romper las normas y avisa a los coordinadores, que deciden; nunca oculta por sí solo; (b) **síntesis y opciones**: al cerrar un debate, lee los puntos de consenso y las objeciones y propone opciones para votar. Siempre etiquetado como IA, citando los mensajes en que se basa; la comunidad decide. El texto pasa por un filtro de datos personales (como el de HONEY) antes de salir del servidor, y las comunidades saben qué se procesa. Se parte del agente de julio.

## 11. Publicación y seguridad

- nicaraguadecide.org en el VPS de OpenCivic, en contenedores y base de datos propios, detrás del Traefik existente con certificado automático. Carlos apunta el DNS (dos registros) con guía paso a paso.
- Correo de invitaciones por el mismo proveedor SMTP que usa el boletín de OpenCivic.
- Despliegue por PR aprobada por Carlos, como el sitio de OpenCivic.
- Identidad separada del perfil; IP solo como huella cifrada; verificación en dos pasos obligatoria para la mesa y los observadores, opcional para los demás; copias de seguridad diarias cifradas; sin rastreadores de terceros ni Google; revisión de seguridad completa antes de abrir a los 200.

## 12. Fases

| Fase | Contenido | Tiempo |
|---|---|---|
| 1. Primera versión | Roles y visitante, invitaciones, verificación por dos referencias, comunidades de origen y acogida, foros y propuestas con consenso público, mesa de 3 con 2 de 3, elecciones periódicas con revocación, sorteo, reglas votables, panel de observadores, portada pública, publicación en nicaraguadecide.org | 2–3 semanas |
| 2. Ampliación | Democracia líquida para voceros por tema, verificación con documentos, agente de IA de los foros | Tras el uso de la fase 1 |
| 3. Más adelante | Anclaje de la auditoría en blockchain | Cuando la comunidad lo decida |

## 13. Pruebas

Cada módulo nuevo con pruebas automáticas (sumadas a las 155 existentes): verificación por referencias (incluidos los casos inválidos: misma persona dos veces, segunda referencia de otra comunidad, autoconfirmación), regla de 2 de 3, elecciones con revocación, reglas votables con participación mínima, permisos por rol (un visitante y un observador nunca ven datos personales ni conversaciones). Antes del lanzamiento, ensayo con los primeros invitados.

## 14. Preguntas abiertas

- Lista inicial exacta de comunidades de acogida (propuesta: Costa Rica, EE. UU. por estado, España, Panamá, Honduras, México, Canadá, Guatemala, El Salvador, otros países a pedido).
- Requisitos de los observadores (por ejemplo, si un observador que es miembro puede votar mientras ejerce): los fija la comunidad; la fase 1 parte sin requisitos más allá de no ocupar otro cargo.
- Proveedor de la prueba de conocimiento cero del pasaporte (fase 2): evaluar Self, zkPassport u otros por soporte de pasaportes nicaragüenses.
