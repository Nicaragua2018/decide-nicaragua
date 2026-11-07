---
name: contrato-accion-social
description: Invariantes no negociables del contrato de acción social de Renacer City y de su capa de delegación líquida. Úsala SIEMPRE que se escriba, modifique, revise o audite código relacionado con la acción social, la membresía, el peso de voto, la delegación, los aportes de capital o el contrato ERC-5192 de este proyecto — incluso si el cambio parece trivial, incluso si el usuario solo pide "añadir una función" o "arreglar un bug". Estas invariantes son la diferencia entre una cooperativa y una plutocracia, y se rompen con una sola línea descuidada.
---

# Contrato de acción social — invariantes

Este proyecto implementa una cooperativa digital cuya regla constitutiva es
**una acción por persona, un voto por acción**. Todo el diseño descansa sobre un
puñado de propiedades que, si se rompen, convierten el sistema en lo contrario
de lo que dice ser — y lo hacen en silencio, sin que ninguna prueba funcional
falle.

Esta habilidad existe porque ese fallo es sigiloso. Un contrato con `transfer`
sigue compilando, sigue pasando los tests, sigue emitiendo acciones. Solo deja
de ser una cooperativa.

## Antes de tocar nada

Ejecuta el verificador sobre el archivo que vas a modificar, y otra vez cuando
termines:

```bash
node .agents/skills/contrato-accion-social/scripts/verificar-invariantes.mjs <ruta-al-.sol>
```

Sale con código 1 si encuentra una violación. Si lo integras en CI, eso basta
para bloquear el merge.

## Las siete invariantes

### 1. La acción no se transfiere

No existe `transfer`, `transferFrom`, `approve`, `setApprovalForAll` ni
`safeTransferFrom`. Tampoco una función administrativa que mueva una acción
entre direcciones.

**Por qué:** una acción transferible se acumula. En cuanto exista mercado
secundario —y aparecerá solo, sin pedir permiso, si la acción vale algo y se
puede mover— quien compre más decide más. La formulación «un voto por acción»
sobrevive intacta en el texto mientras el sistema se vuelve plutocrático. La
intransferibilidad no es una restricción del diseño: es el diseño.

**Si alguien pide transferibilidad:** la salida legítima es devolver la acción a
la cooperativa, que la amortiza y reembolsa el patrimonio del socio según las
reglas de liquidez publicadas. Devolver no es vender. Implementa `devolver()`,
nunca `transfer()`.

### 2. `pesoDeVoto` devuelve una constante

```solidity
function pesoDeVoto(address p) public view returns (uint256) {
    return esSocio[p] ? 1 : 0;
}
```

Esa línea es la tesis entera del proyecto expresada en código. Debe ser lo
primero que verifique cualquier auditoría externa.

**Por qué:** el momento en que el peso pasa a depender de `patrimonioAportado`,
de la antigüedad o de la reputación es el momento en que el capital compra
poder. Si el producto necesita ponderación para algo, que viva fuera de esta
función y fuera del gobierno.

### 3. El bloqueo ERC-5192 es permanente

`locked(tokenId)` devuelve siempre `true`. No existe función que desbloquee, ni
siquiera para el administrador, ni siquiera tras una votación.

**Por qué:** el estándar ERC-5192 admite todos los grados entre transferible y
no transferible. Un bloqueo reversible es una promesa, no una garantía: basta
una votación capturada para abrirlo. Marshall Baal (Moloch v3) permite activar
la transferibilidad después; este contrato cierra esa puerta de forma
permanente, y esa diferencia es deliberada.

### 4. Una acción por identidad única

`suscribir()` rechaza una segunda acción para una prueba de unicidad ya
registrada, y rechaza a quien ya es socio.

**Por qué:** la regla «un voto por acción» equivale a «un voto por persona»
solo si nadie puede tener dos acciones. Con la suscripción a un dólar
desaparece además la barrera económica contra identidades falsas —a cien
dólares, fabricar mil socios cuesta cien mil; a un dólar, mil—, así que **toda**
la defensa recae en esta comprobación y en la capa de unicidad que la alimenta.
Es la dependencia crítica del sistema entero.

### 5. Los aportes no dan voto

`aportar()` incrementa `patrimonioAportado` y nada más. Los tramos de capital
voluntario y de financiación no reembolsable no tienen arista alguna hacia el
peso de voto.

**Por qué:** el capital puede entrar por muchas puertas siempre que ninguna de
ellas conduzca a la urna. Un socio que aporte diez mil dólares y otro que solo
haya firmado su dólar fundacional pesan exactamente lo mismo cuando se cuenta.

### 6. La delegación es transitiva, revocable y conserva la voz

Quien delega tiene peso 0; su voz viaja al delegado, y si ese delega a su vez,
sigue viajando. La recursión lleva guarda de ciclos mediante un conjunto de
visitados.

El invariante que lo prueba, y que conviene comprobar en los tests:

```
Σ pesoVoto(i, dominio) == número de personas con derecho a voto
```

Cada voz se cuenta **exactamente una vez**, donde termine su cadena. Si la suma
es menor, hay voces perdidas en un ciclo; si es mayor, hay voces duplicadas y el
recuento está inflado.

`revocar()` no admite plazo, causa ni aprobación de nadie.

### 7. Patrimonio heredable, voto no heredable

En caso de fallecimiento el patrimonio se transmite a los herederos. La
condición de socio y el voto no. Un heredero que quiera serlo suscribe su propia
acción y pasa por el proceso de admisión ordinario.

**Por qué:** sin esta separación se forman dinastías de voto, que es el modo
concreto en que las cooperativas históricas se han desnaturalizado con el
tiempo.

## Mecanismo recomendado que conviene incorporar

El **ragequit** de MolochDAO: quien discrepa de una decisión de gasto puede
salir con su parte proporcional **antes** de que se ejecute. Convierte el
derecho de salida en un veto económico real sobre decisiones abusivas, sin
litigio y sin confianza. Tómalo, pero sin la ponderación por capital que Moloch
sí usa: allí las participaciones son proporcionales al aporte, y eso es
justamente lo que este proyecto no hace.

## Cuando alguien pida romper una invariante

Ocurrirá, y casi siempre por una buena razón aparente: «solo para migrar
cuentas», «solo el administrador», «solo hasta que lancemos». Explica el costo
concreto en lugar de negarte en seco, propón la alternativa que preserva la
propiedad —`devolver()` en vez de `transfer()`, ponderación fuera del gobierno
en vez de dentro— y, si aun así se decide romperla, deja constancia en el código
y en el registro de decisiones del proyecto de qué invariante se rompió y por
qué. El reglamento de la cooperativa puede cambiarse; lo que no puede es
cambiarse sin que nadie se entere.

## Contexto del proyecto

- `docs/producto/PAPER-gobernanza-cooperativa.html` — el modelo formal y la
  demostración de que la regla equivale a igualdad política solo bajo unicidad
  e intransferibilidad.
- `docs/producto/PRECEDENTES-catalogo.html` — Optimism, Moloch, ERC-5192 y qué
  tomar de cada uno.
- `docs/mvp/motor.js` — la implementación de referencia de `pesoVoto` y
  `recibidas` con guarda de ciclos, ya verificada contra el invariante.
