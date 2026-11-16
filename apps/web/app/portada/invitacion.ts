// Texto que copia el botón «Compartir» de la portada: la invitación a registrarse,
// lista para pegar en WhatsApp o en redes junto con el video de invitación. Lo escribió Carlos Robleto (2026-11-15).
// Los enlaces llevan «https://» para que cualquier aplicación los vuelva pulsables.
export const ENLACE_INVITACION = 'https://nicaraguadecide.org';

// Video de invitación (la presentación narrada con el agradecimiento a RENACER).
export const VIDEO_INVITACION = '/portada/invitacion.mp4';

const CUERPO = `🐝 ¿Qué nos enseña una colmena sobre la democracia?

Cada primavera, cuando una colmena crece, miles de abejas tienen que decidir algo de vida o muerte: dónde construir su nuevo hogar. Y lo más sorprendente es que no lo decide la reina. Nadie da órdenes.

El biólogo Thomas Seeley pasó décadas estudiándolo y descubrió algo extraordinario:

🔍 Cientos de exploradoras salen a buscar opciones por su cuenta.
🗣️ Al volver, cada una comunica lo que encontró con su danza, y defiende con más fuerza los mejores lugares.
👀 Otras abejas no se lo creen sin más: van a verificar el lugar con sus propios ojos.
⚖️ Las propuestas débiles pierden apoyo solas; las buenas lo ganan.
✅ Cuando suficientes abejas coinciden en un mismo sitio, el enjambre entero se mueve unido.

El resultado: casi siempre eligen el mejor lugar. No por obediencia, sino por un proceso abierto, verificable y compartido.

Las abejas no son democráticas por ideología. Lo son porque su supervivencia depende de ello. Comparten lo esencial: la vida de la colmena, la libertad de explorar, la organización sin un jefe que lo controle todo y la cooperación para sostener el bien común. La democracia, para ellas, es infraestructura.

🇳🇮 Los nicaragüenses también compartimos lo esencial: la vida, la libertad, la dignidad y el deseo de un país donde podamos volver a organizarnos sin miedo. Pero hoy estamos dispersos por el mundo, y entre el ruido y la manipulación muchas veces ya no sabemos en quién confiar.

Por eso construimos Nicaragua Decide: una colmena democrática y cooperativa para la nación nicaragüense, dentro y fuera del país.

Funciona como el enjambre:
🐝 Inquietudes: cualquiera plantea lo que preocupa a su comunidad, como una exploradora que trae una opción.
🐝 Apoyo: cuando una inquietud reúne suficiente respaldo, se abre el debate.
🐝 Foros: por territorio de origen, por lugar donde vives y para toda la diáspora.
🐝 Decisiones a la vista de todos los miembros, incluso las rechazadas.
🐝 Auditoría abierta a los miembros: cada acción queda registrada y se puede verificar.
🐝 Privacidad: lo que se publica dentro solo lo ven los miembros, para proteger a quien participa.
🐝 Guardián, un asistente de IA que te orienta, pero nunca decide. Como en la colmena, la decisión es de todos.

🔐 ¿Cómo se entra?
En una colmena, la confianza se construye abeja por abeja. Aquí también. Estamos empezando, así que en esta fase inicial el equipo fundador verifica personalmente a los primeros miembros, uno a uno. Cuando la comunidad crezca, cada miembro verificado podrá invitar y avalar a quienes conoce, sin depender de nadie en el centro.

Los primeros que entren son como las primeras exploradoras: abren el camino para que el resto del enjambre llegue.`;

const DESPEDIDA = `🤝 Gracias a RENACER, un grupo de nicaragüenses en el exilio que apoya este proyecto.

La legitimidad no se declara. Se construye juntos, como una colmena.

Impulsado por OpenCivic Solutions · https://opencivicsolutions.org

#NicaraguaDecide #Nicaragua #Diáspora #Democracia #LaColmena #TecnologíaCívica`;

/** Invitación pública: manda a registrarse en el sitio. */
export const TEXTO_INVITACION = `${CUERPO}

👉 Mira el video y regístrate en ${ENLACE_INVITACION} con el botón «Únete a la comunidad». Te contactaremos para completar tu verificación.

${DESPEDIDA}`;

/** Invitación personal: el mismo texto, con el enlace de activación de una persona. */
export function mensajeInvitacionPersonal(enlace: string, horas: number): string {
  const dias = Math.floor(horas / 24);
  const plazo = dias >= 2 && horas % 24 === 0 ? `${dias} días` : `${horas} horas`;
  return `${CUERPO}

👉 Esta es tu invitación personal. Mira el video y crea tu cuenta con este enlace:
${enlace}

El enlace es solo para ti: no lo reenvíes. Vence en ${plazo}.

${DESPEDIDA}`;
}
