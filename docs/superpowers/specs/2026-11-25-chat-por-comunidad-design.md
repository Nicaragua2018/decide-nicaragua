# Nicaragua Decide — Chat por comunidad: diseño

Fecha: 2026-11-25 · Autor del pedido: Carlos Robleto · Estado: pendiente de aprobación

## 1. Para qué

Los primeros miembros necesitan un lugar para hablar entre ellos dentro de la plataforma: avisar, preguntar y compartir información de interés común, como hoy hacen en los grupos de WhatsApp de RENACER (uno por territorio de origen y por lugar de acogida). WhatsApp obliga a mostrar el teléfono a todo el grupo y queda fuera de la plataforma.

Decisiones de Carlos (2026-11-25):

- El chat va **dentro de Nicaragua Decide**, no en WhatsApp.
- **Todos los miembros de la comunidad pueden escribir.** Sirve para informar, preguntar y compartir.
- **Guardián asiste en las salas**: orienta sobre lo que ya se puede hacer dentro de la plataforma y sugiere opciones externas para lo que se sale de las capacidades o del propósito de Nicaragua Decide.
- **Guardián responde solo cuando lo llaman**; no escucha la sala (por costo).
- Las herramientas de trabajo colaborativo (carpetas, archivos, documentos compartidos) son **otro proyecto**, posterior.

## 2. Qué es y qué no es

**Es:** una sala de conversación por comunidad, solo texto, para el día a día.

**No es (fuera de esta versión):**

- Mensajes privados entre dos personas.
- Fotos, notas de voz, documentos o cualquier archivo.
- Avisos por correo o notificaciones al teléfono.
- Reacciones, respuestas en hilo, menciones a personas, edición de mensajes.
- Cifrado de extremo a extremo.
- Salas en los grupos de trabajo (subgrupos, comisiones, bifurcaciones): ya tienen su foro.

**Sería un fracaso aunque funcione si:**

- una persona que no es miembro verificado de la comunidad puede leer la sala;
- los observadores, la auditoría o los visitantes pueden leer lo que se conversa;
- el chat se usa para decidir por fuera de inquietudes, debates y votaciones;
- Guardián recibe mensajes de personas que no lo llamaron;
- usarlo es más difícil que WhatsApp.

## 3. Salas

- Una sala por cada comunidad de tipo `territorial_origin`, `territorial_residence` y `custom` (el nivel general «Exilio y diáspora»). Los grupos de tipo `trabajo` no tienen sala.
- La sala existe **desde el primer miembro**; no espera a que la comunidad se active con 7. Sirve justo para reunir a esos primeros 7.
- No se crea una tabla de salas: la sala es la comunidad (`groupId`).
- Dónde se ve: pestaña **«Chat»** en la página de la comunidad (`/groups/[id]?tab=chat`), junto a las pestañas actuales. En «Mis comunidades» (`/dashboard`), cada comunidad muestra un aviso «mensajes nuevos» si los hay.

## 4. Quién puede qué

| Acción | Quién |
|---|---|
| Leer la sala | Miembro verificado con membresía en esa comunidad (misma comprobación que `requireParticipant`) |
| Escribir | Igual que leer |
| Borrar un mensaje propio | Su autor |
| Ocultar un mensaje ajeno, con motivo | Coordinación de esa comunidad o la mesa (misma regla `canModerate` de los foros) |
| Llamar a Guardián | Igual que escribir |
| Leer la sala sin ser miembro | Nadie: ni observadores, ni la mesa por su cargo, ni visitantes |

Una cuenta suspendida, pendiente o rechazada no lee ni escribe.

## 5. Mensajes

- Texto plano de hasta **1000 caracteres**. Los enlaces `http(s)://` se muestran como enlaces que abren en otra pestaña (`rel="noopener noreferrer nofollow"`); nada más se interpreta (sin HTML ni Markdown).
- Cada mensaje muestra el nombre público de quien escribe (`displayName`), sus iniciales y la hora. Nunca el correo.
- La sala carga los **50 mensajes más recientes**; un botón «Ver anteriores» trae los 50 previos (paginación por cursor).
- **Actualización:** mientras la pestaña del chat está abierta y visible, la web pregunta cada **10 segundos** si hay mensajes nuevos (solo los posteriores al último que tiene). Al enviar, el mensaje propio aparece de inmediato. No hay WebSocket: la plataforma no tiene ninguno hoy y con 200 personas no hace falta.
- **Límite de envío:** 10 mensajes por persona y minuto (throttle del API).
- **Borrar lo propio:** el mensaje queda como «Mensaje eliminado por su autor» y su texto se borra de la base de datos.
- **Mensajes nuevos:** se guarda por persona y comunidad la fecha de la última lectura; hay mensajes nuevos si existe alguno posterior. Se actualiza al abrir la sala.

## 6. Conservación

Los mensajes de una sala **se borran solos a los 90 días** (texto y fila). Es una regla general votable nueva: `chat.conservacion_dias`, valor 90, entre 30 y 365. Un chat es conversación del día; lo que deba quedar pasa a un foro o a una decisión. Para personas perseguidas, guardar menos es más seguro.

*Decisión de diseño, no de Carlos: revisar.*

## 7. Moderación

- **Sin revisión previa por IA.** En los foros cada texto pasa por el asistente antes de publicarse; en un chat eso costaría una llamada a la IA por mensaje y lo haría lento. El chat publica al instante.
- **Después de publicado:** la coordinación de la comunidad o la mesa pueden ocultar un mensaje con motivo, con el mismo mecanismo de los foros (`ModerationAction`, nuevo destino «mensaje de chat»), apelable ante la mesa igual que allí. El mensaje oculto se ve como «Mensaje oculto por moderación».
- Cualquier miembro puede **avisar** de un mensaje («Avisar a la coordinación»): queda marcado para quien modera. No lo oculta.

*Decisión de diseño, no de Carlos: revisar.*

## 8. Guardián en la sala

- **Cómo se le llama:** botón «Preguntar a Guardián» junto a la caja de texto, o empezar el mensaje con `@Guardián` (también `@guardian`, sin tilde, sin distinguir mayúsculas). El mensaje se publica en la sala como cualquier otro, marcado como pregunta a Guardián.
- **Qué recibe la IA:** solo el texto de ese mensaje, pasado por el filtro de datos personales existente (`limpiarTexto`: correos y teléfonos) y por `neutralizarEtiquetas`, más el contexto que el asistente ya usa (estado de la persona y de la plataforma, guía de rutas). **No recibe los demás mensajes de la sala.**
- **Qué responde:** un mensaje en la sala, visible para todos, firmado «Guardián · asistente de IA». Hasta 1000 caracteres. Con el mismo sistema de referencias a páginas internas del panel (enlaces a Inquietudes, Foros, Reglas, etc.).
- **Dos tareas** (instrucciones nuevas para este uso):
  1. *Hacia adentro:* si lo que se pregunta se puede hacer en Nicaragua Decide, decir dónde y cómo (plantear una inquietud, abrir un debate, proponer un cambio de regla, formar un grupo de trabajo, invitar, confirmar).
  2. *Hacia afuera:* si se sale de las capacidades o del propósito de la plataforma (editar un documento entre varios, compartir carpetas, videollamadas, diseño), decirlo con claridad y sugerir tipos de herramienta y opciones conocidas, prefiriendo las libres y las que cuidan la privacidad, sin enlaces de afiliado ni recomendaciones de pago como única opción. Aclara que son herramientas ajenas a Nicaragua Decide.
- **Límites:** no modera, no decide, no resume la sala, no opina sobre personas ni sobre política partidaria (igual que hoy). Usa el modelo rápido (`ASISTENTE_MODELO_RAPIDO`).
- **Costo:** cada llamada cuenta en el límite diario existente de la persona (`asistente.preguntas_por_dia`, 30) y en el tope mensual (`ASISTENTE_TOPE_MENSUAL_USD`). Si el asistente está apagado, sin presupuesto, o la persona agotó su límite, la pregunta se publica igual y aparece debajo un aviso corto del sistema («Guardián no está disponible ahora» / «Llegaste a tu límite de preguntas de hoy»), sin llamar a la IA.
- **Si la IA falla o tarda más de 20 s:** aviso del sistema «Guardián no pudo responder. Inténtalo más tarde». No se reintenta solo.
- La respuesta de Guardián **se guarda como mensaje** de la sala (a diferencia del panel, donde no se guarda) y se borra con la misma regla de conservación.

## 9. Auditoría y privacidad

- La auditoría registra que se publicó, se borró o se ocultó un mensaje (`chat.message_added`, `chat.message_deleted`, y la acción de moderación), con el recurso `group:<id>` y el rastro habitual. **Nunca el contenido.**
- Los observadores no tienen ninguna lectura del chat.
- El texto se guarda sin cifrar en la base de datos, como los foros. Quien administra el servidor podría leerlo técnicamente; se dice así en la página de Reglas/privacidad, sin prometer más.
- El asistente no guarda las preguntas fuera del propio mensaje de la sala; del uso solo queda el costo mensual, como hoy.

## 10. Datos nuevos

- `ChatMessage`: `id`, `groupId`, `authorProfileId` (nulo si es de Guardián o del sistema), `kind` (`miembro` | `pregunta_guardian` | `guardian` | `sistema`), `body` (hasta 1000; nulo si fue eliminado), `hidden`, `deletedAt`, `replyToId` (solo para enlazar la respuesta de Guardián o el aviso del sistema con la pregunta), `createdAt`. Índice por (`groupId`, `createdAt`).
- `ChatLectura`: `groupId`, `profileId`, `lastReadAt`; única por (`groupId`, `profileId`).
- `ModerationTarget`: valor nuevo para mensaje de chat.
- Regla nueva `chat.conservacion_dias` y una tarea programada diaria que borra lo vencido (mismo estilo que los `*.scheduler.ts` existentes).

## 10b. Precisiones (decisiones de diseño tras la revisión)

- **Ocultar** funciona exactamente como ocultar una respuesta de foro: quien modera elige una de las causas cerradas existentes (`ModeracionCausa`) y el mensaje se oculta al instante; estados, segunda firma y apelación son los que ya rigen para los foros, sin variantes propias del chat.
- **Comunidades sin coordinación** (incluido el nivel general): modera la mesa, que `canModerate` ya admite.
- **Avisar a la coordinación:** tabla `ChatAviso` (`messageId`, `profileId`, `createdAt`; única por mensaje y persona). Quien puede moderar ve en el mensaje «N avisos». No hay pantalla aparte.
- **Texto de un mensaje oculto:** se conserva (hace falta para la apelación). La limpieza por plazo borra también los ocultos, salvo los que tengan una apelación sin resolver, que esperan a que se resuelva.
- **Mensajes nuevos:** una sola consulta para todas las comunidades de la persona en `/dashboard`. `lastReadAt` se actualiza al abrir la sala y en cada consulta periódica mientras la pestaña está visible.
- **Guardián es asíncrono:** al enviar la pregunta el API responde de inmediato; la respuesta (o el aviso) llega a todos por la consulta periódica. Mientras tanto, quien preguntó ve «Guardián está escribiendo…».
- **Cupos:** la pregunta cuenta una vez en el límite diario; los avisos del sistema y la respuesta de Guardián no cuentan en ningún límite; una pregunta rechazada por falta de cupo no consume cupo.
- **Quien sale de la comunidad o queda suspendido:** sus mensajes anteriores siguen visibles hasta que venzan. Si se elimina el perfil, `authorProfileId` pasa a nulo y el mensaje se muestra como «Miembro que ya no está».
- **`chat.conservacion_dias`:** entrada nueva de nivel `colmena` en `RULE_DEFINITIONS`, conectada, con el mismo procedimiento de cambio que las demás reglas generales.

## 11. Qué queda a quien construye

- Nombres exactos de rutas del API y de componentes, siguiendo los módulos `forums` y `asistente`.
- El texto exacto de las instrucciones de Guardián para la sala, dentro de lo fijado en §8.
- La apariencia de la pestaña, dentro del diseño vigente (tarjetas, pastillas y colores actuales), pensada primero para teléfono.
- La ayuda en la página Reglas y en la guía de Guardián (una ruta nueva `gN` «Chat de tu comunidad»).

## 12. Pruebas

Cada pieza con pruebas automáticas, al estilo de las existentes. Como mínimo:

- quien no es miembro verificado de la comunidad recibe 403 al leer y al escribir; la mesa y los observadores tampoco leen por su cargo;
- un grupo de tipo `trabajo` no tiene sala (404);
- texto vacío o de más de 1000 caracteres, rechazado;
- borrar lo propio borra el texto; no se puede borrar lo ajeno;
- ocultar: solo coordinación de esa comunidad o mesa, con motivo;
- llamada a Guardián: la IA recibe solo ese mensaje y ya filtrado (un correo y un teléfono en el texto no salen); cuenta en el límite diario; con asistente apagado, sin presupuesto o sin cupo no se llama a la IA y se publica el aviso;
- un mensaje sin `@Guardián` nunca llama a la IA;
- la auditoría no contiene texto de mensajes;
- la limpieza borra lo anterior al plazo y respeta el valor de la regla;
- paginación: 50 recientes, anteriores por cursor, y «solo posteriores a».

## 13. Después (anotado, sin fecha)

- Fotos, notas de voz y archivos.
- Avisos (correo o teléfono) de mensajes nuevos.
- Proyecto aparte: herramientas de trabajo colaborativo (carpetas, documentos, proyectos creativos compartidos), comparando opciones ya existentes antes de construir. Los grupos de WhatsApp de RENACER sirven de referencia y de prueba.
