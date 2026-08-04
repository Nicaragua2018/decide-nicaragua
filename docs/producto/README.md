# Renacer City — paquete de desarrollo

Cuatro documentos que, juntos, permiten que cualquier desarrollador (humano o IA)
construya la aplicación web completa. Todos son archivos HTML autónomos: se abren
con doble clic en cualquier navegador, sin instalar ni servir nada.

| Documento | Qué contiene | Empieza aquí si… |
|---|---|---|
| [`FILOSOFIA-republica-inteligente.html`](FILOSOFIA-republica-inteligente.html) | Texto fundacional en quince artículos, con anexo que mapea cada principio al mecanismo que lo ejerce y declara las tensiones sin resolver | …necesitas entender **por qué** existe el proyecto |
| [`PRD-renacer-city.html`](PRD-renacer-city.html) | Problema, personas, historias de usuario con criterios de aceptación, alcance por versión, métricas y contra-métricas, registro de decisiones (ADR), riesgos e hitos | …vas a **planificar** el producto o priorizar el trabajo |
| [`BLUEPRINT-renacer-city.html`](BLUEPRINT-renacer-city.html) | Prompt maestro copiable, arquitectura por fases, modelo de datos SQL, protocolo de la cadena de actos, API, criterios de aceptación técnicos y sistema de diseño | …vas a **codificar** |
| [`../prototypes/renacer-city.html`](../prototypes/renacer-city.html) | La aplicación funcionando: doce módulos, criptografía ECDSA real, cadena de actos firmados y cooperativa de ahorro | …quieres **ver y probar** cómo debe verse y comportarse |

**Jerarquía:** la Filosofía establece el porqué, el PRD el qué, el Blueprint el
cómo y el prototipo demuestra que no es una promesa. Cuando alguno contradiga a
los demás, gana la Filosofía y el resto se corrige.

## Cómo usarlos

**Con un constructor de IA en el navegador** (Hostinger Horizons, v0, Lovable, Bolt):
abre el Blueprint, copia el prompt maestro de la sección 02 con el botón «Copiar
prompt» y pégalo como primera instrucción. Después sube el prototipo como
referencia visual y pide los módulos en el orden de la hoja de ruta (sección 10).

**Con un desarrollador humano:** entrega los tres. El PRD define qué construir y
con qué criterios se da por terminado; el Blueprint aporta el esquema de datos, el
protocolo criptográfico y la API; el prototipo es la especificación ejecutable de
la interfaz.

**Para presentar el proyecto:** abre solo el prototipo. No necesita conexión ni
instalación, funciona igual en teléfono y en computadora.

## Regla de oro

Ninguna pantalla promete una garantía que el código no cumpla. Si un módulo dice
«auditable», tiene que existir el botón que lo audita. El prototipo ya obedece
esta regla; la aplicación de producción no puede rebajarla.

## Advertencias que no se pueden quitar

- El módulo de cooperativa es un **prototipo educativo**: no capta dinero ni es
  asesoría financiera. Operar con fondos reales exige constituir legalmente la
  cooperativa, custodia multifirma con hardware y compras en mercados regulados.
- El proyecto se dirige a personas perseguidas. Cualquier cambio que aumente la
  trazabilidad de un individuo debe justificarse contra el riesgo físico que crea.
- WebCrypto requiere HTTPS: la firma de actos no funciona sobre `http://`
  (salvo en `localhost`).
