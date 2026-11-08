# Plan 3C: elegir a quienes nos representan (diseño)

Fecha: 2026-11-07. Carlos pidió un diseño completo, «intuitivo y sencillo, pero visualmente atractivo e ilustrativo», sin ronda de preguntas. Por eso todo lo que no viene del diseño general está marcado como **(decisión mía)** y se puede cambiar.

Base:
- el diseño general (`2026-11-01-primeros-200-design.md`, §3 Roles, §6 Cargos y §9 Auditoría);
- el spec 3A (§1: los cargos sirven al ciclo comunitario);
- el código en `main` (8f19ef7): `Election`, `ElectionCandidate`, `Ballot`, `ElectionResult`, el conteo Schulze, `BoardSeat` con `source: fundador | eleccion`, el sorteo verificable, la papeleta ordenada de 3A-3 y las 8 reglas sin conectar.

## 1. Propósito

Que cada comunidad y toda la plataforma elijan a quienes organizan, moderan y vigilan, con el mismo espíritu del resto: **fácil de entender, imposible de amañar y sin caudillos**. Los cargos sirven al ciclo comunitario (inquietud → debate → votación → comisión), no al revés.

Al terminar la 3C:
- la mesa fundadora (Carlos y los primeros invitados) cede su lugar a una mesa elegida;
- cada comunidad activa tiene 2 coordinadores;
- hay observadores que vigilan sin poder decidir.

## 2. Principios

- **Una sola forma de votar.** La papeleta es la misma que ya se usa para las soluciones (3A-3): ordenas solo a quienes aceptas; a quien no pones, lo rechazas; o te abstienes. Nada nuevo que aprender.
- **Elegido por mayoría, ordenado por preferencia.** Para quedar elegida, una persona debe estar en más de la mitad de las papeletas (sin contar abstenciones). Entre quienes lo logran, el orden lo da Schulze.
- **Voto secreto, resultado verificable.** Nadie ve por quién votó otra persona. Al cerrar, se publican las matrices completas y cualquiera puede repetir el conteo.
- **Sin campañas de bando.** Cada candidatura es una ficha igual para todos: presentación y compromisos, sin fotos de campaña, sin propaganda pagada y sin listas. El asistente no resume, no compara y no recomienda candidaturas **(decisión mía)**: solo explica cómo votar.
- **Un cargo a la vez.** Nadie ocupa dos cargos al mismo tiempo, y quien observa no ocupa ningún otro.
- **Nada se detiene.** Si una elección no logra elegir a nadie, quien ocupa el cargo sigue hasta la siguiente; la plataforma nunca queda sin mesa.

## 3. Los cargos

| Cargo | Cuántos | Quién vota | Período (regla) | Qué hace |
|---|---|---|---|---|
| Mesa: administrador, coordinador general y secretario | 1 cada uno | Toda la plataforma | 12 meses (`cargos.periodo_mesa_meses`) | Lo de siempre: 2 de 3 para las acciones graves, revisión de moderación, reglas de la colmena, agenda de «Exilio y diáspora» |
| Observadores | 7 (`observadores.numero`) | Toda la plataforma | 12 meses (mismo período que la mesa) | Leen la auditoría y las estadísticas (§8). No votan en la mesa ni moderan |
| Coordinadores de comunidad | 2 por comunidad activa | Las personas de esa comunidad | 6 meses (`cargos.periodo_coordinadores_meses`) | Organizan la agenda y moderan en su comunidad: lo que hoy hace la mesa por ellos |

**Qué cambia en los permisos:** `ForumsService.canOrganize` y `canModerate` pasan a aceptar a los coordinadores elegidos de esa comunidad, además de la mesa.
- En «Exilio y diáspora» sigue organizando la mesa.
- Las apelaciones siguen yendo a la mesa.

**Las comunidades se activan** al llegar a `comunidad.minimo_activacion` personas verificadas (7). La activación abre sola su primera elección de coordinadores.

## 4. Cómo es una elección

Cuatro pasos, siempre iguales, que la página muestra como una línea de tiempo ilustrada.

**1. Convocatoria.** La convoca el sistema, nunca una persona:
- **primera elección de la mesa y los observadores:** al llegar a `eleccion.minimo_primera` personas verificadas (12);
- **primera elección de coordinadores:** al activarse la comunidad;
- **renovación:** 21 días antes de que termine el período **(decisión mía)**, para que el cambio de cargo ocurra sin hueco;
- **elección anticipada:** por revocación, renuncia o vacante (§6).

La mesa y los observadores se eligen el mismo día, en una sola «jornada electoral» con cuatro papeletas: tres cargos de la mesa y observadores **(decisión mía)**.

**2. Candidaturas** (`eleccion.plazo_candidaturas_dias`, 7):
- Cualquier persona verificada del electorado puede presentarse a un solo cargo de la jornada.
- La ficha tiene:
  - **presentación**, de hasta 600 caracteres;
  - **hasta 3 compromisos**, de 140 caracteres cada uno;
  - **comunidades** de origen y de acogida, que se muestran solas.
- La ficha pasa por la moderación previa de 3B.
- Puede retirarse hasta que empiece la votación.
- **Pocas candidaturas:** si hay menos que puestos, el plazo se alarga 7 días una vez. Después se vota con quienes haya **(decisión mía)**.

**3. Votación** (`eleccion.plazo_votacion_dias`, 7):
- Es la papeleta de 3A-3:
  - tocas o arrastras a las personas que aceptas, en tu orden de preferencia;
  - «Rechazo a todas» y «Me abstengo» son botones.
- Puedes cambiar tu voto hasta el cierre.
- Nadie ve cifras antes de cerrar; solo «N personas han votado», redondeado de 5 en 5.
- **Participación mínima:**
  - la regla `votacion.quorum_porcentaje` del ámbito (20 %);
  - las abstenciones cuentan para ella.

**4. Resultado y toma del cargo:**
- **Quién queda elegido:**
  - quien está en más de la mitad de las papeletas no abstenidas;
  - en orden Schulze, hasta llenar los puestos;
  - un empate exacto se resuelve con el sorteo verificable que ya existe, con semilla pública **(decisión mía)**.
- **Si queda un puesto sin elegir** (nadie llega a la mayoría, o no se alcanza la participación mínima):
  - quien lo ocupaba sigue, con la marca «en funciones»;
  - se convoca otra elección en 30 días **(decisión mía)**.
- **La toma del cargo es automática** al contarse:
  - el asiento pasa a `source: eleccion`;
  - empieza el período;
  - queda en la auditoría.

## 5. Cómo se ve (sencillo, atractivo e ilustrativo)

Todo usa el estilo de dibujo de la marca: tinta y acuarela, con abejas.

**La imagen guía es el enjambre que elige su nuevo hogar** (Seeley):
- las exploradoras presentan cada lugar;
- todas comparan;
- gana el que convence a la mayoría.

Es una metáfora sin jefes, sin bandos y fácil de entender.

**Páginas nuevas:**

1. **«Elecciones»** (menú principal):
   - una tarjeta por elección abierta, con la línea de tiempo de cuatro pasos;
   - el paso actual iluminado en dorado y los pasados en azul;
   - una cuenta atrás grande («Faltan 3 días para votar») y un solo botón con la acción del momento: «Presentarme», «Votar» o «Ver resultado».
2. **La papeleta** de cada elección:
   - fichas de candidatura iguales para todas, con las iniciales en un hexágono de color (sin fotos) **(decisión mía)**, nombre visible, comunidades, presentación y compromisos;
   - un orden al azar distinto para cada persona, para que nadie gane por salir primero.
3. **El resultado:**
   - quienes quedaron elegidos, destacados en un panal dorado;
   - «Cómo se decidió», en tres frases sencillas y un dibujo de duelos (quién gana a quién, con flechas y grosor según la ventaja);
   - las matrices completas plegadas bajo «Para verificar»;
   - un botón «Descargar los datos».
4. **«Quiénes nos representan»** (pública, también para visitantes):
   - la mesa, los observadores y los coordinadores de cada comunidad;
   - cada cargo con su barra de mandato (desde, hasta y cuánto falta);
   - el enlace «Pedir la revocación» para quien puede hacerlo.
5. **«Observar»** (solo para observadores): ver §8.

**El asistente acompaña:**
- La tarjeta «Desde tu última visita» de 3B-2 añade «Se abrieron las candidaturas para…» y «Vota antes del…».
- El panel de preguntas explica cómo votar.
- Nunca opina sobre las candidaturas.

## 6. Revocación, renuncia y vacantes

**Revocación** (`revocacion.fraccion`, 33 %):
- **Quién la pide:** cualquier persona del electorado de ese cargo.
- **Qué escribe:** un motivo de hasta 600 caracteres, que pasa por la moderación previa.
- **Apoyos:**
  - los demás apoyan con un clic, como una inquietud;
  - se cuentan, pero no se publica quién apoyó **(como en 3A-1)**.
- **Si en 14 días llega a la fracción del electorado** **(decisión mía)**:
  - se abre una elección anticipada para ese cargo;
  - la persona revocada puede volver a presentarse y sigue «en funciones» hasta el resultado;
  - el nuevo período dura lo que faltaba del anterior **(decisión mía)**.
- **Límites:**
  - un solo pedido abierto por cargo;
  - quien lo pidió no puede repetirlo para el mismo cargo en 60 días **(decisión mía)**.

**Renuncia:** quien ocupa un cargo puede dejarlo con un botón. Se abre una elección anticipada y el puesto queda vacante hasta el resultado.

**Mesa incompleta:**
- Si la mesa queda con 2 cargos, sigue funcionando: 2 de 2.
- Si queda con menos de 2, los 2 observadores con más preferencias en su elección cubren de forma provisional solo la revisión de 2 firmas, hasta la elección anticipada **(decisión mía)**. Así la moderación nunca se detiene.

**Suspensión de quien ocupa un cargo:** la acción de la mesa (2 de 3) deja el cargo vacante y abre una elección anticipada.

## 7. Reactivación de cuentas

**Pedir la reactivación:** una cuenta suspendida, al entrar, ve por qué se suspendió y el botón «Pedir la reactivación», con un texto de hasta 1000 caracteres.

**Cómo resuelve la mesa:**
- crea la acción `reactivate_user`, con 2 de 3, como `suspend_user`;
- si la rechaza, la persona recibe el motivo y puede volver a pedirla en 30 días **(decisión mía)**.

**Al reactivarse:** la cuenta vuelve a sus comunidades, sin los cargos que tenía.

## 8. Observadores

**Qué ven, en la página «Observar», solo de lectura:**
- la auditoría completa sin contenido:
  - invitaciones, verificaciones, votos emitidos sin su contenido, resultados, sorteos, cambios de reglas, moderación y acciones de la mesa con sus dos firmas;
- las estadísticas de verificación: quién confirma más referencias, con nombre visible;
- las matrices de todas las elecciones y votaciones, y las semillas de los sorteos;
- los gastos del asistente.

**Qué no ven:** correos, nombres reales, IP ni el contenido de ningún voto.

**Qué no pueden hacer:** no votan en las acciones de la mesa, no moderan y no organizan.

**Señalar:** pueden poner una «observación pública» de hasta 1000 caracteres sobre un evento. Se publica en «Quiénes nos representan» con su nombre **(decisión mía)**. Así la vigilancia tiene voz sin tener poder.

## 9. Reglas que se conectan

Las 8 reglas «sin conectar» pasan a tener efecto, y se pueden votar con el flujo de 3A-5:
- `observadores.numero`
- `comunidad.minimo_activacion`
- `eleccion.minimo_primera`
- `revocacion.fraccion`
- `cargos.periodo_mesa_meses`
- `cargos.periodo_coordinadores_meses`
- `eleccion.plazo_candidaturas_dias`
- `eleccion.plazo_votacion_dias`

Un cambio de período o de número de observadores rige desde la siguiente elección, no corta un mandato en curso **(decisión mía)**.

## 10. Privacidad y seguridad

- **El voto es secreto:**
  - la papeleta se guarda para el conteo, pero ninguna pantalla ni ningún informe dice quién votó qué;
  - la auditoría registra «votó», sin contenido, como en el plan 2.
- **Los apoyos a una revocación** se cuentan sin publicar nombres.
- **Las fichas de candidatura** usan el nombre visible, nunca el nombre real ni el correo.
- **Verificación en dos pasos:** el diseño general la pide obligatoria para la mesa y los observadores. Si todavía no existe en la plataforma, queda para el plan 5 **(decisión mía)**. Hasta entonces, la toma del cargo muestra un aviso para que la persona use una contraseña fuerte.

## 11. Fuera de este plan

- Democracia líquida y voceros por tema (fase 2).
- Publicar un hash de cada votación fuera de la plataforma (3C o fase 3, según el spec 3B; queda para la fase 3).
- Verificación por documentos (fase 2).
- Notificaciones por correo o teléfono.

## 12. División en planes

- **3C-1: elegir.**
  - **El motor de elecciones:** convocatoria automática, candidaturas, papeleta, conteo con mayoría y Schulze, desempate por sorteo y toma del cargo.
  - **Las elecciones:** la mesa, los observadores y los coordinadores, más la activación de comunidades.
  - **Los permisos** de los coordinadores.
  - **Las páginas** «Elecciones», papeleta, resultado y «Quiénes nos representan».
  - **Las 8 reglas** conectadas.
- **3C-2: cuidar los cargos.**
  - Revocación, renuncia, vacantes y mesa incompleta.
  - Reactivación de cuentas.
  - La página «Observar» y las observaciones públicas.
  - Las elecciones en la tarjeta «Desde tu última visita».

Cada plan se construye y se revisa como los anteriores, y se entrega en su propio PR.

## 13. Pruebas

Pruebas automáticas:
- **la mayoría:** nadie queda elegido sin estar en más de la mitad de las papeletas no abstenidas;
- **el conteo:** el orden Schulze con varios puestos, el desempate por sorteo reproducible con la semilla y la participación mínima con abstenciones;
- **sin hueco:** con un puesto sin elegir, quien lo ocupaba sigue «en funciones» y se convoca otra elección en 30 días;
- **la convocatoria:**
  - es automática en cada disparador;
  - nunca hay dos elecciones abiertas para el mismo cargo;
- **un cargo a la vez,** en la candidatura y en la toma del cargo;
- **los permisos:** un coordinador organiza y modera solo su comunidad;
- **la privacidad:** ninguna respuesta de la API dice quién votó qué, y los apoyos de revocación no exponen nombres (3C-2);
- **la revocación:** al llegar a la fracción se abre la elección anticipada, y el nuevo período dura lo que faltaba (3C-2);
- **la mesa incompleta:** la revisión de 2 firmas sigue funcionando (3C-2).
