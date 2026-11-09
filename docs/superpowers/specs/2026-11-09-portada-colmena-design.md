# Portada «colmena» de nicaraguadecide.org — diseño

Fecha: 2026-11-09 · Rama: `primeros-200/portada` (desde `main` fe47b4c)
Autor: Claude con Carlos Robleto (fundador, no programador)

## 1. Intención y por qué

Carlos vio la portada actual (`apps/web/app/page.tsx`) y dijo: «qué feo el frontend». Ve un fondo difuminado, un texto seco y un diseño cerrado. Además, el contenido habla de una plataforma anterior: «Vota con Condorcet», «sortición», «auditoría append-only». No cuenta lo que se construyó en los planes 3A–3C: inquietudes, debate, votación de soluciones, comisiones, elecciones, la página Decisiones y el asistente.

La nueva portada tiene que:

- **Contar el problema y la solución con las palabras de Carlos.** El problema y la solución, tal como él los escribió: «Reconstruir la confianza, la comunicación y la coordinación entre afines, libres de la manipulación política y el ruido de las redes sociales. Se RENACE desde la asociación de dos cromosomas y la multiplicación ordenada y descentralizada por un objetivo común. Una República para todos en forma de una colmena democrática y cooperativa.»
- **Sentirse cálida, real y nicaragüense.** Lleva fotos reales de Nicaragua, la foto de Renacer y a Honey, la abejita de la marca.
- **Ser sencilla para la diáspora, que no es técnica.** El principio de Carlos: «toda complejidad automatizada; que sea sencillo proponer, debatir y votar, y ver los consensos, los rechazos y los resultados».

## 2. Metas, no‑metas y anti‑metas

**Metas**
- Primera pantalla nueva, con el estilo «Bandera suave» y un video en lugar del panal (§4).
- Un video de unos 35 s hecho con Remotion: el problema y la solución, sin voz (§5).
- Contenido nuevo en 6 partes, aprobado en el chat (§6).
- Enlace «Entrar» visible para quien ya tiene cuenta.

**No‑metas** (para después)
- Rediseñar las páginas internas (`(app)/*`), `/login`, `/explore` y `/newsletter`. Carlos sospecha que el estilo seco se repite en ellas, y así es, pero esta vez «solo la portada».
- Cambiar el logo o la marca.

**Anti‑metas** (si pasa esto, fracasamos aunque «funcione»)
- Volver a usar jerga técnica: Condorcet, Schulze, sortición, semilla, append-only, auditable como muletilla.
- Que la ilustración o el video se monten sobre las letras del título.
- Una portada lenta en el celular: el video no puede frenar la primera pantalla.
- Romper `/explore`, que hoy comparte las clases `ln-*`.
- Fotos sin crédito, o la foto de Renacer sin aviso de IA.
- Mostrar datos que delaten a una persona: nombres de votantes o conteos que identifiquen a alguien.

## 3. Restricciones

- **Tecnología:** Next.js 15.1.7 y React 19 (`apps/web`), monorepo pnpm/Turborepo. La portada es un componente de servidor y solo lleva componentes de cliente donde haga falta (el reproductor del video y el boletín).
- **El repositorio es público.** Nada de secretos en el código.
- **Producción en un VPS con Traefik compartido.** No se toca nada del servidor. El despliegue lo hace Carlos con `deploy.sh`, después de unir el PR.
- **Accesibilidad:** contraste AA y foco visible. Con `prefers-reduced-motion`, sin animaciones de texto y con el video sustituido por su imagen fija. El texto del video también está en la página para lectores de pantalla.
- **Licencias:**
  - fotos de Wikimedia Commons (CC0, CC BY o CC BY‑SA), con el crédito de cada autor en la página;
  - música libre de derechos, con su crédito si la licencia lo pide;
  - Remotion es gratis para personas, empresas de hasta 3 empleados y organizaciones sin fines de lucro. OpenCivic encaja, pero el constructor lo confirma en remotion.dev/license antes de usarlo.
- **Imagen con IA:** `renacer.jpg` está generada con IA. Cada vez que aparezca, en el video y en «Quiénes somos», lleva el aviso «imagen ilustrativa creada con IA».

## 4. Primera pantalla (decidida por Carlos)

La maqueta aprobada está en `.superpowers/brainstorm/12536-1794173114/content/estilo-portada-v2.html`. No se sube al repositorio; los valores están copiados aquí.

- **Fondo:** blanco `#FFFFFF`, con dos franjas azul pastel `#CFE3F7` de unos 18 px, arriba y abajo, como la bandera.
- **Paleta:**

  | Uso | Color |
  |---|---|
  | Azul pastel | `#CFE3F7` |
  | Amarillo pastel | `#FCE9A8` |
  | Gris platinado | `#E5E4E2` |
  | Texto | `#1B2A4A` |
  | Texto secundario | `#3D4A63` |
  | Azul bandera para destacar y para el botón | `#0067C6` |

- **Tipografía:** Fraunces 600 para los títulos e Inter 400/600 para el cuerpo, las dos con `next/font/google`.
- **Título:** solo «Nicaragua» y, debajo, «decide.» en `#0067C6`. Cada palabra sube y aparece (unos 0,6 s, con 0,3 s de retraso entre ellas). Va sin frase encima.
- **Descripción** (la de la opción A, al pie de la letra): «Confianza, comunicación y coordinación entre afines. Sin manipulación y sin el ruido de las redes.»
- **Botón:** «Únete a la colmena →», fondo `#0067C6`, texto blanco y bordes redondeados de 12 px. Lleva a `/login` (decisión de Carlos, §8).
- **Computadora:** dos columnas (1.1fr y 1fr). A la izquierda van el título, la descripción y el botón; a la derecha, **el video**, donde estaba el panal. El título mide unos 64 px.
- **Celular:** una columna con el título (unos 46 px), la descripción, **el video** y, al final, el botón.
- **Barra de arriba:** logo y nombre, «Contacto», compartir y **«Entrar»** (a `/login`).

## 5. El video

- **Formato:** cuadrado de 1080×1080, 30 fps y unos 35 s. Encaja en la columna derecha y en el celular.
- **Sin voz.** Lleva textos cortos animados y música suave.
- **Reproducción:**
  - empieza sola, **sin sonido**, y se repite;
  - tiene un botón de sonido (encender y apagar) y otro de pausa, accesibles;
  - mientras carga, o si la persona prefiere menos movimiento, se ve la imagen fija, que es el último cuadro.
- **Archivos en `apps/web/public/portada/`:**
  - `colmena.mp4` (H.264) y `colmena.webm`, cada uno de **4 MB como máximo**;
  - `colmena-final.webp` como imagen fija;
  - todos con `preload="metadata"`.
- **Dónde vive Remotion:** en su propio paquete del monorepo, `apps/video` (nombre: decisión del constructor), fuera de la web. El video se renderiza a mano y se suben los archivos ya hechos, así que la web no depende de Remotion para compilar ni para correr.
- **Hilo conductor:** la foto de Renacer empieza rota y gris y termina completa, a color, en el centro de un panal de fotos reales. **Honey vuela y junta ella misma las piezas.** Solo hay una pose de Honey (`honey-avatar-original.jpg`, fondo blanco); el constructor le quita el fondo (PNG transparente) y simula el vuelo con trayectoria, balanceo y una leve rotación. No se inventan poses nuevas.

| # | Escena | Texto en pantalla (borrador, Carlos lo revisa) |
|---|---|---|
| 1 | **Dispersos.** La foto aparece rota en pedazos grises que se alejan. | «Somos miles, repartidos por el mundo.» |
| 2 | **El ruido.** Bocadillos de redes («¡Traición!», «#fake», 🔥) tapan la foto borrosa. | «Entre el ruido y la manipulación, ya no sabemos en quién confiar.» |
| 3 | **Renace.** Dos piezas, ya a color, se unen y forman la primera celda. | «Todo renace cuando dos se asocian.» |
| 4 | **Se multiplica.** Honey trae pieza tras pieza y el panal crece celda a celda con fotos reales de Nicaragua. | «Y se multiplica en orden, sin jefes, por un objetivo común.» |
| 5 | **La República‑colmena.** El panal completo, con Renacer en el centro y la celda de la bandera. Es el cuadro final y la imagen fija. | «Una República para todos: una colmena democrática y cooperativa.» |

- **Fotos del panal.** Están en la carpeta de maquetas y hay que copiarlas al paquete del video con su crédito:
  - Volcán Concepción, Ometepe (CC0);
  - Momotombo y Momotombito (CC BY‑SA 4.0);
  - guardabarranco (CC0);
  - Catedral de Granada (CC BY 2.0);
  - Güegüense (CC BY‑SA 4.0);
  - **sacuanjoche**: la foto actual (una plumeria rosada) no sirve. Hay que buscar en Commons una *Plumeria alba* blanca con centro amarillo y licencia libre;
  - una celda con la bandera dibujada.
- **Música:** una pista instrumental suave, libre de derechos, con su crédito si la licencia lo pide.

## 6. El contenido de la portada (aprobado por Carlos)

Carlos aprobó el orden y lo que dice cada parte. Los textos de abajo son **borradores** que él revisará en el PR. Todo va en lenguaje llano y con el mismo estilo de §4: fondo blanco o platinado, celdas hexagonales como adorno y títulos en Fraunces.

1. **Primera pantalla y video.** Ver §4 y §5.
2. **Cómo funciona la colmena.** Cinco pasos, cada uno con un hexágono dibujado:
   - **Planteas una inquietud.** Algo que tu comunidad necesita o quiere cambiar.
   - **Se debate.** Todos opinan y se ve en qué estamos de acuerdo.
   - **Se vota.** Apruebas, rechazas u ordenas las soluciones.
   - **Una comisión lo lleva a cabo.** Personas de la comunidad hacen lo decidido y rinden cuentas.
   - **Todos ven el resultado.** Lo aprobado, lo rechazado y las cifras quedan a la vista.
3. **Tu lugar en la colmena.**
   - Dos comunidades por persona: la de tu territorio de origen y la del país donde vives.
   - Además, el espacio general «Exilio y diáspora».
   - Los cargos (mesa, coordinadores y observadores) se eligen por voto y se pueden revocar.
   - Nadie manda desde el centro. Si un grupo pierde una votación, puede llevar a cabo su idea como iniciativa propia, sin hablar por todos.
4. **Lo que ya decidimos.**
   - Muestra los últimos acuerdos aprobados y rechazados y los resultados de elecciones: título, comunidad, estado y fecha.
   - Incluye un enlace a `/explore` («Mirar sin registrarse»).
   - **Hoy no existe un dato público para esto:** `/decisiones` exige sesión y el `DecisionesController` lleva `JwtAuthGuard`. Hace falta un endpoint público de solo lectura, con un tope de unas 6 decisiones ya cerradas, sin votantes, sin papeletas y sin conteos menores de 5.
   - Mientras no haya decisiones, se muestra un mensaje amable: «Aquí verás los primeros acuerdos de la colmena».
   - **Solo decisiones del espacio general «Exilio y diáspora»** (decisión de Carlos, §8). Lo que deciden los territorios y las comunidades de acogida queda para sus miembros.
5. **Por qué confiar.** Cuatro puntos:
   - entras con el aval de alguien que te conoce;
   - tu voto es secreto;
   - el código es abierto y cualquiera puede revisarlo;
   - el asistente de IA ayuda a resumir y ordenar, pero nunca decide.
6. **Quiénes somos, boletín y contacto**, juntos al final:
   - reconocimiento a Renacer, con su foto y el aviso de IA;
   - el formulario del boletín (`NewsletterForm compact`, sin cambios de lógica);
   - el contacto: «Escribirnos» a `decidenicaragua@gmail.com`;
   - el pie de página con los créditos de fotos y música.

Se eliminan: las secciones «Herramientas» y «CTA central», la nota «Acceso por invitación», los botones «Registrarme» repetidos y toda la jerga de §2.

## 7. Lo que se deja al constructor

- Nombres de componentes, archivos y prefijo de clases. Los estilos nuevos van **aparte** (un prefijo nuevo o CSS Modules) para no tocar las clases `ln-*` que usa `/explore`.
- Los dibujos de los pasos (SVG hexagonales con la paleta) y las animaciones de la portada, que deben ser suaves.
- La forma y el nombre exactos del endpoint público y sus pruebas, siguiendo el patrón de NestJS del proyecto.
- Cómo se quita el fondo a Honey y cómo se anima su vuelo.
- La pista de música, dentro de las restricciones de §3.
- Que el SEO quede bien: `metadata` con título y descripción nuevos, imagen para redes (`opengraph`) a partir de la imagen fija, y textos alternativos.

## 7b. Decisiones tomadas por Claude tras la revisión del constructor

Carlos puede corregir cualquiera de estas decisiones al leer este documento.

- **Archivos de origen.** Todos se suben al paquete del video (`apps/video/assets/`) con un `CREDITOS.md` que indica autor, licencia y enlace de cada uno:
  - Honey: `C:\Users\administrador\Desktop\OpenCivic Solutions\Marca\HONEY\honey-avatar-original.jpg`. Es la misma imagen que `honey.jpg` de las maquetas;
  - Renacer: `apps/web/public/renacer.jpg`;
  - las fotos de Commons: se vuelven a descargar desde Commons, con su ficha de licencia.

  En `apps/web/public/portada/` solo van los archivos ya renderizados y la imagen fija.
- **Una sola fuente para los textos del video.** Un archivo de constantes que leen el video y la página. La página los muestra como texto oculto para lectores de pantalla.
- **Solo en español.**
- **Música y foto del sacuanjoche.** Las elige y descarga el constructor, y comprueba la licencia en la ficha. El video se renderiza en la PC de desarrollo y se suben los archivos ya hechos.
- **Peso del video.** Si 1080×1080 no cabe en 4 MB por archivo, se puede bajar a 720×720.
- **«Lo que ya decidimos»:**
  - muestra solo el estado («aprobada» o «rechazada»), nunca cifras, para que no pueda delatar a nadie;
  - la portada se regenera como mucho cada 5 minutos;
  - si la API no responde, la sección muestra el mensaje amable de §6 y la página no se rompe.
- **«Entrar» y el botón de compartir.** Se reutilizan sin cambios: `/login` y el `ShareButton` actual.

## 8. Preguntas abiertas para Carlos

Respondidas el 2026-11-09:

1. **«Únete a la colmena» lleva a la página de entrada, `/login`.** No se crea una sección nueva de «Cómo unirte». Ojo: hoy, quien no tiene invitación no encuentra en `/login` cómo conseguirla. Queda anotado para cuando se rediseñen las páginas internas.
2. **«Lo que ya decidimos» muestra solo el espacio general «Exilio y diáspora».**
