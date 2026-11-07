# Plan 3B: el asistente de Nicaragua Decide (diseño)

Fecha: 2026-11-06. Aprobado en conversación por Carlos Robleto; este documento lo deja por escrito.
Base: spec 3A (`2026-11-04-plan-3a-ciclo-comunitario-design.md`, §9 «Puntos de conexión del agente»), spec 3A-4 y el código unido en `main` (1884e80).

## 1. Propósito

El asistente acompaña a cada miembro y a cada comunidad para que **proponer, debatir y votar sea fácil**, y para que la comunidad crezca. Es la pieza que hace realidad la regla de Carlos: «toda la complejidad automatizada».

Hace seis cosas:

1. **Guía desde la inscripción.** Responde preguntas sobre cómo funciona la plataforma y sobre lo que la persona puede ver.
2. **Pone al día.** Al volver, resume lo nuevo en las dos comunidades de la persona y en «Exilio y diáspora».
3. **Anima a crecer.** Cuando una comunidad es pequeña, motiva a sus miembros a invitar a gente de confianza, mostrando las garantías y facilidades que da la comunidad.
4. **Ayuda a encontrar acuerdos** al estilo Talk to the City y vTaiwán (el caso Uber). Agrupa inquietudes parecidas, dibuja el mapa de opiniones de un debate y redacta borradores de soluciones a partir de las frases en las que casi todos coinciden.
5. **Modera** el lenguaje en tres niveles (§6).
6. **Siembra los primeros temas.** Propone las once preguntas iniciales (artículo del blog «¿De qué tenemos que hablar primero?», publicado el 9 de noviembre de 2026) como inquietudes en «Exilio y diáspora».

## 2. Principios (no negociables)

- **Nunca decide.** No vota, no apoya, no cierra plazos y no aprueba nada. Tampoco oculta contenido ya publicado: eso sigue en manos de la mesa, con el flujo de 3A-3b. La única excepción es el nivel 2 de §6: un texto con odio, amenazas o datos personales no se publica tal como está, y la persona puede pedir que la mesa lo revise.
- **Siempre marcado.** Todo texto suyo que se ve en la plataforma lleva «sugerencia del asistente» (`origen: 'asistente'`). Las personas pueden adoptarlo, cambiarlo o descartarlo.
- **Sin nombres.** Nunca dice quién escribió, apoyó o votó algo, ni quién está en un grupo de opinión. Habla de grupos y cifras agregadas, con las mismas reglas de privacidad que 3A (§10): redondeos, mínimos de 5 respuestas y nada antes del conteo.
- **Ve solo lo que ve la persona.** Cuando responde a alguien, solo usa contenido que esa persona puede leer, según `GroupAccessService`. Por ejemplo, no ve el foro de una bifurcación ajena.
- **El contenido es dato, no orden.** Lo que escriben los miembros se le entrega como material para resumir, nunca como instrucciones (§7).
- **Imparcial.** No toma partido en lo político. Criticar al gobierno, a la oposición, a un partido o a una persona pública con argumentos es legítimo y **nunca** se frena por eso. Solo se frena el ataque a personas: odio, amenazas, insultos, datos personales.
- **Guía de valores.** Busca consenso, cuida el tejido social y suma identidades (origen, acogida, diáspora) en vez de enfrentarlas. Esta guía vive en un archivo de texto versionado en el repositorio, y forma parte de las instrucciones del asistente y del examen.

## 3. Guía y preguntas

- **Dónde aparece:** un botón «Pregúntale al asistente» en todas las páginas de la aplicación abre un panel lateral de conversación.
- **Quién lo usa:** cualquier cuenta que haya entrado, también la que espera verificación. Así ayuda desde el registro: le explica en qué paso está su verificación y qué viene después. Los visitantes sin cuenta no lo usan.
- **Qué sabe:**
  - una guía de la plataforma, escrita en el repositorio como base de conocimiento: qué es una inquietud, cómo se vota, qué hace la mesa, qué son las reglas, etc.;
  - el estado de la propia persona: sus comunidades, sus invitaciones disponibles, los plazos que la afectan;
  - el contenido que esa persona puede leer, consultado por el sistema según la pregunta.
- **Qué no hace:** no actúa en nombre de la persona. Puede llevarla a la página correcta, por ejemplo «Para apoyar esta inquietud, pulsa aquí», pero el clic lo da ella.
- **Memoria:** la conversación dura mientras el panel está abierto. No se guarda el texto de las conversaciones en la base de datos; solo un contador de uso para los límites de §7.

## 4. Ponerse al día

- Al entrar, si pasaron más de 12 horas desde la última visita, aparece arriba una tarjeta: «Desde tu última visita».
- **La lista la arma el sistema, sin IA:**
  - debates nuevos;
  - votaciones que se abrieron o cierran en menos de 48 horas;
  - decisiones nuevas (aprobadas o rechazadas);
  - informes de comisiones;
  - inquietudes que cruzaron el umbral.

  Todo por comunidad, y solo lo que la persona puede leer.
- **El asistente añade un párrafo corto** que resume lo más importante y dice qué puede hacer la persona ahora («Tienes 2 votaciones abiertas; la de Chinandega cierra mañana»). Si el asistente no está disponible, la tarjeta muestra solo la lista.
- Se guarda la fecha de la última visita en el perfil (campo nuevo).

## 5. Crecer la comunidad

- En la página de cada comunidad con **menos de 7 miembros** (aún sin activar), y en la de comunidades activas con menos de 20, aparece una tarjeta del asistente. Dice cuántos faltan y qué ganan al crecer:
  - **Garantías:** identidad protegida, voto secreto, reglas votadas por todos, sin caudillos, cada miembro avalado por dos personas.
  - **Facilidades:** debates y votaciones propios, grupos de trabajo, comisiones, apoyo mutuo en papeles, trabajo y seguridad.
- El texto lo escribe el asistente con los datos reales de la comunidad (nombre, miembros, cuántos faltan para activarse) y se renueva como mucho una vez al día por comunidad.
- La tarjeta lleva a la página de invitaciones que ya existe, y ofrece un **mensaje de invitación** escrito por el asistente. La persona lo edita, lo copia y lo envía ella por su cuenta (WhatsApp, correo).
- **Nunca** contacta a nadie de fuera, no envía invitaciones y no insiste. La tarjeta se puede cerrar y no vuelve en 7 días para esa persona.

## 6. Moderación en tres niveles

Se aplica a todo texto que un miembro publica:
- inquietudes y su respuesta;
- frases;
- soluciones;
- propuestas y comentarios de foro;
- informes de comisión;
- motivos de cambio de regla.

**Nivel 1. Aviso amable (antes de publicar, privado).** Si el texto tiene lenguaje ofensivo o descalificador, pero no llega al nivel 2, la persona ve: «Esta frase puede ofender y restarle apoyo a tu idea. ¿Quieres decirla de otra forma?». Debajo aparece una versión respetuosa que dice lo mismo. Hay dos botones: «Usar la sugerencia» y «Publicar como está». Nadie más ve el aviso. No se registra el texto ni se cuenta en contra de nadie.

**Nivel 2. No se publica así (antes de publicar).** Si el texto entra en una de estas causas, no se publica tal como está:
- **`odio`**: incita al odio o ataca a un grupo de personas por lo que son (origen, etnia, color, religión, sexo, orientación, discapacidad). Es una causa **nueva** en la lista cerrada (`MODERACION_CAUSAS`), no urgente, y también la puede usar la mesa;
- `insultos_amenazas` (solo amenazas y acoso; un insulto suelto queda en el nivel 1);
- `datos_personales`;
- `ilegal_violencia`.

La persona ve la causa y una explicación corta, y puede hacer dos cosas:
- **reformular**, con la ayuda de una versión sugerida;
- **pedir revisión a la mesa:** el texto queda guardado como pendiente, visible solo para su autor y para la mesa. Si dos miembros de la mesa lo aprueban (la misma regla de 2 firmas que para ocultar), se publica con su fecha original. Si lo rechazan, la persona recibe la causa.

**Nivel 3. Ya publicado.** Si algo ofensivo pasó (el asistente no estaba disponible, o el texto se editó), el asistente revisa lo publicado en segundo plano. Si encuentra una causa, abre una **solicitud de moderación** como lo haría un miembro, con «asistente» como solicitante y su causa. A partir de ahí sigue el flujo de 3A-3b: lo urgente se oculta provisionalmente 48 horas y lo demás espera las 2 firmas de la mesa.

**Fallo del servicio:** si el servicio de IA no responde en 5 segundos, el texto se publica sin revisión previa y queda en la cola del nivel 3. Que la IA falle nunca impide participar.

**Sin vigilancia de cuentas:** el asistente no busca cuentas nuevas ni apoyos coordinados. Lo garantizan el aval de dos personas y un voto por persona (decisión de Carlos).

## 7. Defensas del asistente

- **Contra la manipulación (inyección de instrucciones):**
  - las instrucciones del asistente son fijas y viven en el código;
  - el contenido de los miembros va separado y marcado como material;
  - las respuestas que alimentan la plataforma (clasificación de moderación, grupos, borradores) se piden en formato estructurado y se validan antes de usarse; si no cumplen, se descartan;
  - el asistente no tiene herramientas que cambien nada: solo puede leer lo que el sistema le pasa y devolver texto o una clasificación.
- **Contra el gasto:**
  - límite de 30 preguntas por persona y día en el panel (regla de colmena nueva, votable);
  - tope de gasto mensual del sistema, configurado en el servidor (no votable).

  Al llegar al tope, el asistente se pausa: el panel dice «El asistente descansa hasta el próximo mes», la moderación pasa al modo «Fallo del servicio» (§6) y todo lo demás sigue igual. Se avisa a la mesa.
- **Trazabilidad:** cada resumen, mapa o borrador dice en qué se basa («basado en 42 frases y 310 opiniones, al 9 de noviembre, 10:00») y enlaza al debate original.
- **Examen antes de encenderlo** (tipo HONEY): un conjunto de casos con sus respuestas esperadas, que se corre antes de cada cambio de instrucciones o de modelo. Incluye:
  - intentos de manipulación;
  - odio y amenazas en español nicaragüense, con modismos;
  - **crítica política legítima que NO debe frenarse**, contra cualquier lado;
  - preguntas sobre cómo votó alguien, que el asistente debe negarse a responder;
  - resúmenes que no deben tomar partido.

  Para encenderlo hay que aprobar todo el examen.
- **Interruptor:** una variable del servidor apaga el asistente por completo. La plataforma funciona igual que en 3A.

## 8. Encontrar acuerdos (puntos de conexión de 3A §9)

| Punto | Qué hace el asistente | Cuándo |
|---|---|---|
| Agrupar inquietudes | Sugiere grupos de inquietudes parecidas y un título para cada uno. Quien organiza las junta con un clic. | Cada noche, por comunidad con 5 o más inquietudes abiertas |
| Aviso de umbral | Junto al aviso que ya existe: resumen de lo que pide la gente y un borrador de respuesta para quien organiza | Al cruzar el umbral |
| Debate abierto por la comunidad | Presentación neutral escrita a partir de las inquietudes, en lugar del texto crudo | Al abrirse solo |
| Mapa de opiniones | Mapa de temas con citas (Talk to the City): grupos de opinión, lo que piensa cada uno y las frases puente, con citas textuales sin nombres | Cada noche en debates con 20 o más votos de frases, y al cerrar el debate |
| Borradores de soluciones | Dos o tres borradores a partir de las frases puente, como «sugerencia del asistente». Un miembro puede adoptarlo como suyo o editarlo. | Al pasar el debate a soluciones |
| Comisiones | Comentario sobre qué capacidades pide la tarea | Al abrirse la convocatoria |

**Las once preguntas iniciales:** cuando el nivel «Exilio y diáspora» se active, o en el primer arranque del asistente si ya lo está, el asistente crea las 11 inquietudes con `origen: 'asistente'` y sin autor persona. Siguen el camino normal: necesitan apoyos de miembros para avanzar. La lista vive en un archivo del repositorio, y la comunidad la puede ocultar o cambiar como cualquier otra.

## 9. Privacidad

- Al servicio de IA (Claude, de Anthropic) solo se envía texto: el contenido y los datos agregados. Nunca nombres, correos, identificadores de persona ni datos de verificación. Antes de enviar, el sistema quita del texto lo que parezca un correo o un número de teléfono.
- No se guarda el texto de las conversaciones del panel. En la base de datos solo queda lo que el asistente publica (con su marca) y los contadores de uso.
- Auditoría:
  - se registran, sin texto, las sugerencias publicadas, las solicitudes de moderación del asistente y las revisiones de la mesa;
  - los avisos del nivel 1 no se registran.
- La clave del servicio vive en el `.env` del servidor y nunca pasa por el chat ni por el repositorio.

## 10. Cómo se construye (decisiones técnicas)

- **Servicio:** un módulo `asistente` en la API (NestJS) con el SDK oficial `@anthropic-ai/sdk`. Todo pasa por una sola puerta (`AsistenteService`) que aplica la limpieza de §9, los límites de §7, el tope de gasto y el interruptor.
- **Modelos** (configurables por variable de entorno, decisión mía):
  - uno rápido y barato para la moderación y los avisos (Claude Haiku 5.5);
  - uno más capaz para mapas, resúmenes y borradores (Claude Sonnet 5.5).
- **Trabajo nocturno:** el programador horario que ya existe ejecuta las tareas nocturnas: agrupar, mapas y revisión del nivel 3.
- **Datos nuevos:**
  - `origen` en `Inquietud` y en los textos sugeridos que aún no lo tienen;
  - la última visita en el perfil;
  - el estado «pendiente de revisión» para los textos del nivel 2;
  - los contadores de uso y de gasto;
  - el mapa de opiniones guardado por debate, con fecha.

## 11. Fuera de este plan

- Notificaciones por correo o al teléfono. La plataforma no las tiene: todo se ve al entrar.
- Detectar cuentas falsas o apoyos coordinados (§6).
- Publicar un hash de cada votación para verificarla por fuera: queda para 3C o la fase 3.
- La seguridad general de la web (servidor, copias de seguridad, capacidad para crecer): plan 5.
- Voz, traducción a otros idiomas y uso fuera de la web.

## 12. División en planes

- **3B-1 Base y moderación:**
  - el módulo `asistente` y sus defensas (§7);
  - la guía de valores;
  - el examen;
  - los tres niveles de moderación;
  - la causa `odio`;
  - la revisión de la mesa.
- **3B-2 Acompañar:** el panel de preguntas (§3), ponerse al día (§4) y crecer la comunidad (§5).
- **3B-3 Acuerdos:** todo §8, incluidas las once preguntas iniciales.

Cada plan se construye y se revisa como los de 3A, y se entrega en su propio PR.

## 13. Pruebas

- **Pruebas automáticas** con el servicio de IA simulado:
  - límites;
  - tope y pausa;
  - interruptor;
  - fallo del servicio (se publica y va a la cola);
  - nivel 2 con revisión de la mesa (2 firmas);
  - nivel 3 abre solicitudes con la causa correcta;
  - acceso: el asistente nunca recibe contenido que la persona no puede leer;
  - privacidad: ningún envío lleva nombres ni identificadores;
  - las once preguntas se crean una sola vez.
- **El examen de §7** corre aparte, contra el servicio real, y su resultado se anota en el PR.

## 14. Precisiones tras la revisión del constructor

**Respondidas por lo que ya existe:**
- **Grupos de opinión y frases puente:** los sigue calculando el algoritmo de 3A-2 (`apps/api/src/frases/opinion-groups.ts`: PCA + k-means, determinista). Claude **no** agrupa ni recibe la matriz de votos. Solo recibe, por grupo, cifras agregadas (con las reglas de 3A: redondeo de 5 en 5 y mínimo de 5 respuestas) y el texto de las frases. Con eso pone nombre a cada grupo y escribe el mapa con citas.
- **Las once preguntas:** son las del artículo del blog (sección «Once preguntas para empezar»). Se copian tal cual a `apps/api/src/asistente/semillas.ts`.
- **La mesa** es la mesa única de la colmena (`BoardSeat`), no una por comunidad. Necesita al menos 2 cargos ocupados para funcionar, igual que en 3A-3b.

**Decisiones del constructor (mías, se pueden cambiar):**
- **Examen:** lo redacto yo (unos 60 casos) en `apps/api/src/asistente/examen/casos.json`, y Carlos lo revisa en el PR de 3B-1 antes de encender el asistente. Lleva casos en español nicaragüense y crítica política contra todos los lados.
- **Dónde entra la moderación previa:**
  - la web llama primero a `POST /api/asistente/revisar` y muestra el aviso del nivel 1 o del nivel 2;
  - cada endpoint de publicación **vuelve a revisar** en el servidor, para que nadie se salte la revisión llamando a la API directamente. Si la web ya revisó ese mismo texto, se reutiliza el resultado guardado unos minutos (un hash del texto, sin el texto);
  - las ediciones se revisan igual que lo nuevo.
- **Textos del nivel 2 en espera:** una tabla genérica `TextoEnRevision` (tipo de contenido, destino, texto, causa y estado), visible solo para su autor y la mesa. Al aprobarse, el sistema crea el contenido real.
  - Si en 7 días la mesa no decide, la persona recibe un aviso y puede reformularlo. El texto no se publica solo.
  - Si la mesa tiene menos de 2 cargos, la página de revisión lo dice, y la persona igual puede reformular.
- **Autor «asistente»:** el autor pasa a ser opcional (`authorProfileId` nulo) en `Inquietud`, y el solicitante pasa a ser opcional en la solicitud de moderación, con `origen: 'asistente'`. No se crea un usuario falso: rompería «un voto por persona».
- **Límite de preguntas:** es una regla de colmena **global** (`asistente.preguntas_por_dia`), con valor inicial de 30 y límites de 10 a 100. Se conecta al motor de reglas, así que se puede votar desde el primer día.
- **Tope de gasto:** **20 dólares al mes** para empezar (decisión de Carlos, 2026-11-06), en la variable `ASISTENTE_TOPE_MENSUAL_USD` del servidor:
  - se mide con tokens × precio de cada modelo (tabla en la configuración);
  - las tareas nocturnas se detienen al 80 % del tope, y la moderación y el panel siguen hasta el 100 %;
  - el aviso va a la mesa (página de la mesa) y por correo al administrador.
- **Las once preguntas:** las crea una comprobación idempotente en el programador horario («si el nivel general existe y aún no hay inquietudes del asistente sembradas, sembrarlas»), con una marca en la base de datos para que pase una sola vez.
- **Búsqueda del panel:** se hace por palabras y por la estructura (comunidad, estado, plazos), sin vectores. Se puede mejorar después.
