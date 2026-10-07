# MVP de gobernanza para una DAO

Aplicación base que permite a una organización encontrar consensos, consultar
opciones, debatir propuestas, elegir cargos por Condorcet, delegar el voto de
forma líquida, publicar su reglamento constitutivo y mantener un blog de
noticias y recursos.

**[`mvp-dao.html`](mvp-dao.html)** es la aplicación completa en un solo archivo:
se abre con doble clic en cualquier navegador, sin instalar ni servir nada.

## Qué hace de verdad (no es una maqueta)

| Módulo | Qué calcula realmente |
|---|---|
| **Consensos** | Agrupamiento de opinión por **PCA mediante iteración de potencia + k-medias** sobre la matriz real de votos. Las afirmaciones puente se derivan del acuerdo medido en cada grupo, no están marcadas a mano. |
| **Consultas** | Escrutinio ponderado por el **peso de voto delegado** de cada participante. |
| **Propuestas** | Máquina de estados con umbrales: recoge apoyos → votación vinculante → aprobada. Un argumento por miembro, sin hilos ni réplicas. |
| **Elecciones** | **Condorcet real**: matriz de enfrentamientos, detección del ganador que vence a todos y del ciclo cuando no existe. |
| **Delegación** | **Líquida y transitiva** con guarda de ciclos. Invariante verificado: la suma de pesos efectivos iguala el número de personas — cada voz se cuenta exactamente una vez, donde termine su cadena. |
| **Mi cuenta** | Identidad **ECDSA P-256** generada en el dispositivo, cadena de actos encadenada con SHA-256, raíz de Merkle, verificación de firmas y exportación del registro. |

## Verificaciones ejecutadas

- El agrupamiento **recupera la estructura latente** de los miembros simulados
  (separación de 0,634 entre los ejes de postura de cada grupo).
- El invariante de delegación se cumple: 41 personas → 41 votos efectivos,
  con cadenas de hasta 3 saltos y ningún delegante conservando peso residual.
- Manipular el registro almacenado **rompe la verificación** e indica el acto exacto.
- El estado se reconstruye al recargar; sin errores de consola; sin scroll
  horizontal en móvil; tema claro y oscuro.

## Cómo adaptarlo a otra organización

Todo lo configurable está en el objeto `DAO` al principio de `motor.js`:

```js
const DAO = {
  nombre: 'Tu organización',
  lema: 'tu lema',
  dominios: ['Gobernanza', 'Tesorería', 'Identidad', 'Comunicación'],
  umbrales: { ordinaria: 60, reforma: 66, racimos: 2, apoyoPropuesta: 12, topeDelegacion: 15 }
};
```

Los datos semilla (afirmaciones, propuestas, reglamento, entradas del blog)
están en `iniciarDatos()` dentro de `vistas.js`.

## Archivos fuente

El archivo único se ensambla a partir de estas piezas:

- `estilo.css` — sistema de diseño y temas
- `cuerpo.html` — las nueve vistas
- `motor.js` — configuración, criptografía, PCA, k-medias, Condorcet, delegación
- `vistas.js` — estado, pintado de vistas y enrutador

## Límites conocidos

Los demás miembros están **simulados** con posturas latentes deterministas: el
algoritmo de agrupamiento es real, pero los votantes todavía no. El estado vive
en el navegador; para una asamblea real hace falta el servidor descrito en el
blueprint. La prueba de unicidad de personas **no está implementada**: es la
dependencia crítica que el catálogo de precedentes analiza.
