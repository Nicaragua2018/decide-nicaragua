# Plan 3A-4 — Grupos de trabajo: subgrupos, comisiones y bifurcaciones

**Fecha:** 2026-11-05
**Estado:** aprobado en el chat por Carlos Robleto. Este documento está pendiente de su revisión.
**Base:** spec 3A (`2026-11-04-plan-3a-ciclo-comunitario-design.md`, §6 y §7), ADR-020 (soluciones y papeleta) y ADR-021 (moderación con quórum y página «Decisiones»).

## 1. Propósito y estructura

Carlos lo dijo así el 2026-11-05: «solo son dos comunidades (territorio de origen y país o estado de acogida), dentro de las cuales se pueden crear mesas de trabajo o comisiones o sub grupos por temas de interés».

- Cada persona pertenece a **dos comunidades**: su territorio de origen y su país o estado de acogida. Además participa en el **nivel general «Exilio y diáspora»**, que no es una comunidad.
- Dentro de cada comunidad, y también en el nivel general, se forman **grupos de trabajo**.
- **Principio** (Carlos, 2026-11-05): toda la complejidad está automatizada, y proponer, debatir, votar y ver resultados es sencillo.

## 2. Grupo de trabajo (lo común)

Un solo concepto, con tres variantes: `subgrupo`, `comision` y `bifurcacion`. Las tres comparten:

- **Ámbito:** un grupo de comunidad (`territorial_origin` o `territorial_residence`) o el nivel general.
- **Datos:** nombre (5–80 caracteres), propósito (20–1000) y estado: `convocando`, `activo`, `pausado`, `cerrado` o `archivado`.
- **Foro propio** con las herramientas de siempre: temas, comentarios, señales, frases, soluciones y votaciones internas. Sus decisiones valen **solo para el grupo**.
- **Transparencia:** cualquier miembro del ámbito puede **leer** lo que pasa dentro; solo los miembros del grupo participan.
  - Comisiones y subgrupos muestran los nombres de sus miembros (perfil, no identidad) a los miembros del ámbito.
  - Las bifurcaciones solo muestran cuántos son (§5).
- **Moderación:** la misma, con las causas cerradas y las dos firmas para soluciones y propuestas formales (ADR-021).
- **Página del grupo:** propósito, miembros (o cuántos son), foro, estado y, si es comisión, sus informes.

**Implementación** (decisión técnica): cada grupo de trabajo es un `Group` hijo, con `parentGroupId` y `kind`, y con su propio foro por defecto. Así se reutilizan sin cambios la membresía, los foros, las decisiones, las frases y la moderación. La pertenencia a un grupo de trabajo no cambia la pertenencia a las comunidades.

## 3. Subgrupo por tema de interés

- **Nacimiento** (decisión de Carlos, opción A): cualquier miembro del ámbito propone uno con nombre y propósito, y queda `convocando`.
  - Nace solo, pasando a `activo`, al sumarse `subgrupo.minimo_personas` personas (regla local, **5** por defecto, entre 3 y 50) dentro de `subgrupo.plazo_dias` (regla local, **14** por defecto, entre 7 y 60).
  - Si no llega al mínimo, se archiva solo.
- **Entrada y salida libres** para cualquier miembro del ámbito. Cada persona puede estar en todos los subgrupos que quiera.
- **Llevar algo a la comunidad** (decisión de Carlos, opción A): cuando una votación interna del subgrupo aprueba una solución, cualquier miembro del subgrupo puede presentarla a su ámbito. Entra como **inquietud que ya pide respuesta** (`en_plazo`, sin juntar apoyos), con el texto de la solución y el aviso «Propuesta del grupo de trabajo {nombre}». Desde ahí sigue el ciclo normal: agenda, debate, votación y resultado.
- Si queda con menos de 3 miembros durante 30 días, se archiva solo.

## 4. Comisión (spec 3A §7, sin cambios de fondo)

- **Nace** de una solución aprobada, en la comunidad o en el nivel general, o de una bifurcación. Quien organiza define:
  - la tarea (hasta 2000 caracteres);
  - los puestos (entre `comision.puestos_min` y `comision.puestos_max`);
  - la forma de elegir (`comision.forma`: `sorteo` por defecto, o `preferencias`).
- **Convocatoria** de `comision.plazo_convocatoria_dias` (7). Cada voluntario escribe su experiencia relacionada (hasta 500 caracteres; el formulario pide no poner datos que lo identifiquen).
- **Elección automática** al cerrar la convocatoria:
  - `sorteo`: el sorteo verificable que ya existe (semilla pública, Fisher-Yates con SHA-256);
  - `preferencias`: una elección Schulze entre los voluntarios, que dura `votacion.plazo_dias`.
- **Si hay menos voluntarios que puestos:** quien organiza elige entre formarla con los que hay o ampliar la convocatoria 7 días, una sola vez.
- **Informes** cada `comision.informe_cada_dias` (30), con un aviso automático a la comisión 3 días antes.
  - Con dos informes atrasados, cualquier miembro del ámbito puede pedir la **renovación**.
  - Con el apoyo de un tercio de quienes participaron en el debate original, se abre una convocatoria nueva automáticamente.
- **Cierre:** el informe final (hasta 5000 caracteres) se publica junto al consenso, incluso para visitantes, sin nombres de integrantes.

## 5. Bifurcación (spec 3A §6, sin cambios de fondo)

- **Cuándo:** una solución puede bifurcarse si perdió en modo `excluyentes`, o si la votación terminó `sin_quorum`.
- **Quién se suma:** solo quien incluyó esa solución en su papeleta (o votó «Apruebo»), dentro de `bifurcacion.plazo_dias` (14). El sistema lo comprueba con la papeleta guardada y nunca lo revela.
- **Nace** al reunir `bifurcacion.minimo_personas` (7) y sale como «Iniciativa de un grupo», aparte de las decisiones de la comunidad. Fuera del grupo se ve cuántos se sumaron, **nunca quiénes**, ni siquiera dentro del ámbito.
- **Límites:**
  - no habla en nombre de la comunidad ni va contra lo decidido;
  - quien organiza puede **pausarla** con una causa de la lista (ADR-021) y un detalle; sus miembros apelan una vez y la mesa resuelve.
- **Volver a la colmena:** sus miembros pueden presentar la iniciativa como solución en un debate nuevo de su ámbito, por el mismo camino que un subgrupo (§3).
- Puede pedir su propia comisión (§4) entre sus miembros.

## 6. Página «Decisiones» y navegación

- **Lista nueva en «Decisiones»:** cada ámbito suma **«Grupos de trabajo»**, con los subgrupos activos y en convocatoria (con cuántos faltan), las comisiones con su último informe y las iniciativas de grupo (solo cuántos son).
- **«Grupos» en el menú:** proponer un subgrupo, unirse y ver los propios.

## 7. Reglas nuevas (locales, votables en 3A-5)

| Regla | Valor | Límites |
|---|---|---|
| `subgrupo.minimo_personas` | 5 | 3–50 |
| `subgrupo.plazo_dias` | 14 | 7–60 |

## 8. Privacidad y seguridad

- Nunca se muestra quién se sumó a una bifurcación, ni quién votó qué.
- La experiencia de los voluntarios es visible en el ámbito; el formulario advierte que no lleve datos que identifiquen a nadie.
- Las acciones nuevas se auditan sin texto ni nombres en `metadata`. Sumarse a una bifurcación **no** se audita, porque delataría el voto.
- Solo los miembros del ámbito leen un grupo de trabajo. Los visitantes solo ven informes finales y cifras.
- Una persona suspendida pierde sus membresías, también las de los grupos de trabajo.

## 9. División en planes

- **3A-4a:** grupos de trabajo (modelo común, foro, página y lectura) y subgrupos (nacimiento, entrada y salida, llevar a la comunidad), más la lista en «Decisiones» y el menú.
- **3A-4b:** comisiones (convocatoria, sorteo o preferencias, informes, renovación, cierre) y bifurcaciones (elegibilidad por papeleta, nacimiento, pausa, volver a la colmena).

## 10. Pruebas

- **Subgrupos:**
  - nace exactamente al llegar al mínimo, una sola vez aunque se sumen dos personas a la vez;
  - se archiva al vencer;
  - entrada y salida libres;
  - solo los miembros participan y los miembros del ámbito leen;
  - llevar a la comunidad crea una inquietud en plazo.
- **Comisiones:**
  - el sorteo es verificable;
  - la falta de voluntarios ofrece las dos salidas;
  - los avisos y los atrasos de informes;
  - la renovación con un tercio.
- **Bifurcaciones:**
  - solo se suma quien incluyó la solución;
  - nace con 7;
  - no revela nombres por ningún camino, ni en la auditoría;
  - la pausa con apelación.
- **Permisos:** quien no es miembro del ámbito no lee; la persona suspendida no participa; el contenido oculto no sale.
