# Plan 3A — El ciclo de la comunidad

**Fecha:** 2026-11-04
**Estado:** borrador para revisión de Carlos Robleto
**Base:** `docs/superpowers/specs/2026-11-01-primeros-200-design.md` (diseño general aprobado) y el plan 2 ya unido (foros, propuestas formales, consensos públicos y moderación, ADR-017).

## 1. Propósito

Los cargos existen para **servir a la conversación de la comunidad**, no para mandar. El centro de Nicaragua Decide es este ciclo:

1. **Inquietud o necesidad**: cualquier miembro la plantea y los demás la apoyan.
2. **Selección**: quien organiza la agenda decide qué se abre a debate. Son los coordinadores en su comunidad y la mesa en «Toda la comunidad».
3. **Debate en el foro**: comentarios, señales y frases cortas al estilo Pol.is.
4. **Votación de soluciones**: la respuesta o solución que surgió del debate.
5. **Resultado público**: consenso y resultado visibles para cualquier visitante.
6. **Comisión**: lleva a cabo lo aprobado y rinde cuentas.

La mesa directiva y los coordinadores son **moderadores y organizadores de la agenda**, según las inquietudes y necesidades de la comunidad y de sus territorios. Las comisiones **llevan a cabo** lo que la comunidad decidió. Las elecciones de cargos van aparte (plan 3C).

**Inspiración.** De **Pol.is** vienen las frases cortas con acuerdo, desacuerdo o paso, los grupos de opinión y las frases puente. De **Talk to the City** viene el mapa de temas con citas, que hará el agente en 3B. La **democracia de las abejas** (Seeley) aporta tres ideas: cada exploradora evalúa por su cuenta, se decide por quórum y la minoría puede bifurcarse sin dejar la colmena.

**Criterio de éxito.** Ninguna inquietud con suficiente apoyo queda sin respuesta. Cada decisión se puede seguir de punta a punta, desde la inquietud hasta el debate, la votación, la comisión y su informe final. Nadie puede saber cómo votó o qué apoyó otra persona.

## 2. División del plan 3

| Parte | Contenido | Orden |
|---|---|---|
| **3A** (este documento) | Inquietudes y agenda, debate con frases, votación de soluciones, bifurcaciones, comisiones, reglas en dos niveles | 1.º |
| 3B | Agente asistente: guía de valores, examen, agrupar inquietudes, avisos, resúmenes con citas, borradores de soluciones y respuestas | 2.º |
| 3C | Elecciones de cargos (mesa, coordinadores, observadores), revocación, reactivación de cuentas | 3.º |

Mientras no existan coordinadores elegidos (3C), **la mesa organiza la agenda de todas las comunidades**. Todo permiso de «organizar la agenda» pasa por una sola función, `canOrganize(profileId, groupId)`, que hoy equivale a `ForumsService.canModerate`. En 3C se le agregan los coordinadores de esa comunidad.

3A deja preparados los **puntos de conexión del agente** (§9), pero no lo implementa.

## 3. Inquietudes y agenda

- **Quién plantea:** un miembro verificado, en cualquiera de sus comunidades (origen, acogida o «Toda la comunidad»). Una inquietud tiene título (10–140 caracteres) y explicación (hasta 2000).
- **Apoyo:** uno por miembro y retirable. Se muestra **cuántos** apoyan, nunca **quiénes**. La lista se ordena por apoyo y antigüedad.
- **Umbral de respuesta:** `max(3, ⌈10 % de los miembros de esa comunidad⌉)`. Son las reglas locales `inquietud.apoyo_minimo_personas` (3) y `inquietud.apoyo_minimo_porcentaje` (10).
- **Plazo:** al cruzar el umbral, la inquietud entra **en plazo**, que dura 7 días (regla local `inquietud.plazo_respuesta_dias`; la colmena lo limita a 30 como máximo). El plazo no se reinicia si el apoyo baja y vuelve a subir.
- **Respuestas posibles** de quien organiza:
  - **Abrir debate:** crea un tema en el foro por defecto de la comunidad, con una o varias inquietudes vinculadas. Juntar inquietudes es abrir un solo debate con varias.
  - **Responder públicamente** por qué no se abre, con un texto de 50–2000 caracteres. La inquietud queda «respondida» y puede seguir recibiendo apoyo, pero no vuelve a entrar en plazo.
- **Sin respuesta a tiempo:** un proceso periódico (cada hora) abre el debate automáticamente, con la etiqueta «Abierto por la comunidad: no hubo respuesta en el plazo». El texto del debate es el de la inquietud.
- **Estados:** `abierta` → `en_plazo` → `en_debate` | `respondida` | `abierta_por_la_comunidad`. Los cambios se auditan sin texto ni nombres.
- **Moderación:** igual que temas y respuestas (plan 2). Una inquietud oculta no suma apoyos, no entra en plazo y su texto no sale por ningún camino.

## 4. Debate con frases (al estilo Pol.is)

- **Frases:** dentro de un tema abierto, cualquier miembro del grupo escribe frases de 10–140 caracteres. Las frases se moderan igual que las respuestas.
- **Votar una frase:** `de_acuerdo`, `en_desacuerdo` o `paso`, una vez por persona y frase; se puede cambiar mientras el tema siga abierto.
- **Independencia:** el resultado de una frase solo se muestra a quien ya la votó. La siguiente frase por votar se elige de forma que todas reciban votos parecidos: primero las de menos votos y, entre ellas, al azar.
- **Cálculo** en el servidor, sin IA y con código abierto:
  - matriz persona × frase (+1, −1 o 0);
  - reducción a 2 dimensiones (PCA) y agrupación (k-means con k de 2 a 4, elegido por silueta), con la semilla fija guardada;
  - **frases puente**: las que tienen acuerdo ≥ 60 % en **cada** grupo (cada grupo con al menos 3 personas que votaron esa frase);
  - **frases que dividen**: acuerdo ≥ 60 % en un grupo y ≤ 40 % en otro.
- **Privacidad:**
  - el mapa de grupos y las cifras por grupo solo se muestran con al menos 7 participantes en el tema (regla local `debate.minimo_para_grupos`);
  - nunca se muestra quién está en qué grupo, ni el voto de nadie;
  - las cifras por grupo se redondean y se ocultan si un grupo tiene menos de 3 personas.
- **Puentes → soluciones:** al proponer una solución (§5), el formulario muestra las frases puente como punto de partida.

## 5. Votación de soluciones

**Fase de soluciones (durante el debate)**
- Cualquier miembro propone una solución con título (10–140) y descripción (hasta 2000). Quien organiza puede **juntar** soluciones repetidas, y queda un aviso público.
- El tema tiene un plazo de debate (regla local `debate.plazo_dias`, 7). Cuando termina, las soluciones quedan fijas.

**Excluyentes o compatibles**
- Al cerrar el plazo, quien organiza propone `excluyentes` o `compatibles`. La propuesta queda abierta a objeción durante 3 días (regla local `debate.plazo_objecion_modo_dias`).
- Si se oponen al menos un tercio de las personas que participaron en el debate (regla local `debate.fraccion_objecion_modo`, 1/3), se usa el otro modo. Participar significa haber comentado, señalado, escrito o votado frases, o propuesto una solución.
- Con una sola solución, el modo es `compatibles` y no hay fase de objeción.

**Papeleta** (decisión de Carlos, 2026-11-04)
- **Una sola solución:** tres botones, **Apruebo**, **No apruebo** y **Me abstengo**.
- **Varias soluciones:** cada persona **ordena solo las que acepta**, de la más preferida a la menos (sin empates). **Las que deja fuera, las rechaza.** También puede elegir **Rechazo todas** o **Me abstengo**.
- **Me abstengo** cuenta para el quórum, pero no entra en ningún cálculo de aprobación ni de preferencia.
- Se puede cambiar la papeleta mientras la votación esté abierta.
- Dura 7 días (regla local `votacion.plazo_dias`).
- **Quórum:** votaron al menos el 20 % de los miembros de la comunidad, contando abstenciones (regla local `votacion.quorum_porcentaje`; la colmena exige al menos un 10 %).

**Resultado** (al cerrar el plazo, automático). Las papeletas válidas son las que no son abstención.
- **Sin quórum:** «Sin decisión: no se alcanzó la participación mínima».
- **Aprobada:** una solución está aprobada si más de la mitad de las papeletas válidas la incluye en su orden. Con una sola solución, «Apruebo» cuenta como incluirla y «No apruebo» como dejarla fuera.
- **Excluyentes:** gana la solución preferida según Schulze, pero solo si está aprobada.
  - Para el cálculo, cada papeleta pone sus soluciones ordenadas en ese orden, por encima de todas las que dejó fuera; las que dejó fuera quedan empatadas entre sí.
  - Si la preferida no está aprobada, no se aprueba nada.
  - Si hay empate entre soluciones aprobadas, se usa el desempate que ya tiene el módulo de votación; si no lo resuelve, queda «Empate», sin decisión.
- **Compatibles:** se aprueban todas las soluciones aprobadas.
- **Publicación:** las ganadoras, las cifras de aprobación de cada solución, las abstenciones, la matriz por pares y la de rutas de Schulze, y el número de papeletas. El consenso público del plan 2 (`GET /api/public/consensos`) suma las soluciones aprobadas.
- **Reemplazo del plan 2:** la propuesta formal con «A favor / En contra / Abstención» pasa a este flujo. Una propuesta formal es un debate con una sola solución, que se vota con «Apruebo / No apruebo / Me abstengo». Las votaciones del plan 2 que ya existan se cuentan como antes.

## 6. Bifurcaciones

- **Cuándo:** una solución puede bifurcarse si perdió en modo `excluyentes` o si la votación quedó sin quórum.
- **Quién puede sumarse:** solo quienes la incluyeron en su orden (o votaron «Apruebo»), durante 14 días (regla local `bifurcacion.plazo_dias`). El sistema lo comprueba con la papeleta y nunca lo revela.
- **Nace** al sumarse 7 personas (regla local `bifurcacion.minimo_personas`). Tiene su propio foro, visible solo para sus miembros, y su propia comisión (§7), formada por esos miembros.
- **Identidad pública:** aparece como «Iniciativa de un grupo», aparte de las decisiones de la comunidad. Fuera del grupo se ve cuántos se sumaron, nunca quiénes.
- **Límites:** no puede hablar en nombre de la comunidad ni ir contra lo decidido. Quien organiza la agenda puede **pausarla** con un motivo de 10–500 caracteres. Sus miembros pueden apelar una vez y la mesa resuelve, igual que en la moderación del plan 2.
- **Volver a la colmena:** sus miembros pueden presentar la iniciativa como solución en un debate nuevo de la comunidad.
- Todos sus miembros **siguen** en sus comunidades para todo lo demás.

## 7. Comisiones

- **Origen:** una solución aprobada o una bifurcación. Quien organiza define la tarea (hasta 2000 caracteres), los puestos (regla local `comision.puestos_min` 3 y `comision.puestos_max` 7) y la frecuencia de los informes.
- **Convocatoria:** dura 7 días (regla local `comision.plazo_convocatoria_dias`) entre los miembros de la comunidad, o los de la bifurcación. Cada voluntario puede escribir su **experiencia relacionada** (hasta 500 caracteres; el formulario pide no poner datos que lo identifiquen).
- **Forma de elegir:**
  - `sorteo` por defecto (regla local `comision.forma`), con el sorteo verificable que ya existe (semilla pública, Fisher-Yates con SHA-256);
  - `preferencias` si la regla local lo dice o si la comunidad lo vota para ese caso: elección Schulze entre los voluntarios, con su experiencia visible.
  - Si hay menos voluntarios que puestos, quien organiza decide entre formarla con los que hay o ampliar la convocatoria 7 días más (una sola vez).
- **Informes:** cada 30 días (regla local `comision.informe_cada_dias`) se publica uno en el foro del tema. Si se atrasan dos informes, cualquier miembro puede pedir la **renovación**. Con el apoyo de un tercio de los participantes del debate original, se abre una convocatoria nueva.
- **Cierre:** un informe final (hasta 5000 caracteres) se publica junto al consenso y es visible para visitantes. Se publica el informe, nunca los nombres de los integrantes.
- **Privacidad:** dentro de la comunidad se ven los nombres de los integrantes (perfil, no identidad). Los visitantes solo ven cuántos son.

## 8. Reglas en dos niveles

- **Página «Reglas»:** cada parámetro con su valor vigente, su nivel (colmena o local), sus límites y su historial.
- **Reglas de la colmena:** las de §8 del diseño general (observadores, activación, primera elección, períodos y plazos de cargos, revocación, invitaciones, participación mínima del 30 %), más los **límites** de cada regla local (mínimo y máximo) y el quórum mínimo de colmena para votaciones locales (10 %).
- **Reglas locales**, por comunidad: todas las marcadas «regla local» en este documento. Cada comunidad arranca con el valor por defecto de la colmena.
- **Cambiar una regla:** un miembro de la comunidad (o de la colmena) propone el cambio. Se vota con la papeleta de §5 para una sola solución: «Apruebo / No apruebo / Me abstengo». Para valer, debe votar al menos el 30 % (regla de colmena `reglas.participacion_minima`, que también aplica a las locales).
  - **Colmena:** si gana, la aplican el coordinador general y el secretario, 2 de 3 (acción de la mesa del plan 1).
  - **Local:** si gana, se aplica sola al publicarse el resultado. El valor propuesto debe estar dentro de los límites de la colmena, y se valida al proponer y de nuevo al aplicar.
- **Auditoría:** cada propuesta, resultado y aplicación de regla, sin datos personales.

## 9. Puntos de conexión del agente (para 3B)

3A deja un lugar marcado para cada sugerencia futura del agente. Cada uno funciona sin el agente:

| Punto | Sin agente (3A) | Con agente (3B) |
|---|---|---|
| Agrupar inquietudes parecidas | Quien organiza junta a mano | Sugiere grupos y borrador del título del debate |
| Aviso de umbral y de plazo | Aviso automático a quien organiza | Más un resumen de lo que pide la gente y un borrador de respuesta |
| Debate abierto por la comunidad | Texto de la inquietud | Presentación neutral escrita a partir de las inquietudes |
| Resumen del debate | Frases puente y que dividen | Mapa de temas con citas (Talk to the City) |
| Proponer soluciones | Frases puente como punto de partida | Borradores de soluciones a partir de las frases puente |
| Comisiones | Experiencia que escriben los voluntarios | Comentario sobre las capacidades que pide la tarea |

En la base de datos, cada texto que el agente pueda sugerir tiene un campo de origen (`origen: 'persona' | 'asistente'`), para mostrar siempre «sugerencia del asistente».

## 10. Privacidad y seguridad

- Nunca se muestra quién apoyó una inquietud, cómo votó alguien una frase o una solución, ni quién está en un grupo de opinión.
- El apoyo, el voto de frases, la papeleta y la membresía de bifurcaciones se guardan ligados al perfil, porque hacen falta para validar y para que cada persona cambie lo suyo. Las respuestas públicas solo dan cifras agregadas.
- Visitantes: ven consensos, soluciones aprobadas, resultados y cifras, e informes finales de comisiones. Nunca ven conversaciones, nombres ni inquietudes.
- El contenido oculto por moderación no sale por ningún camino (regla del plan 2), y ahora también aplica a inquietudes, frases, soluciones e informes.
- Toda acción nueva se audita sin texto ni nombres en `metadata`.

## 11. Pruebas

Se suman pruebas automáticas a las 283 actuales:
- **Umbral y plazo:** cruzar el umbral, no reiniciar el plazo, apertura automática, respuesta pública.
- **Frases:** el resultado queda oculto antes de votar, el cálculo de grupos es reproducible con su semilla y no hay grupos con menos de 7 participantes.
- **Papeleta:** dejar fuera es rechazar, la preferida no aprobada no gana, «Rechazo todas», la abstención cuenta para el quórum pero no para aprobar, compatibles contra excluyentes, objeción de un tercio y sin quórum.
- **Bifurcación:** solo se suma quien aprobó la solución, nace con el mínimo y no revela nombres.
- **Comisiones:** sorteo verificable, renovación y falta de voluntarios.
- **Reglas:** la regla local respeta los límites y se aplica sola; la de colmena requiere 2 de 3.
- **Permisos:** el visitante no ve conversaciones, un no miembro no participa y un suspendido no actúa.
