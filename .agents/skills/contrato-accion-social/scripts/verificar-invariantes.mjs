#!/usr/bin/env node
/**
 * Verificador de invariantes del contrato de acción social.
 *
 * Comprueba estáticamente las propiedades que convierten la cooperativa en
 * cooperativa. No sustituye una auditoría: detecta las roturas sigilosas, las
 * que no hacen fallar ningún test funcional.
 *
 *   node verificar-invariantes.mjs <archivo.sol> [...]
 *
 * Sale con código 1 si encuentra alguna violación.
 */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

const archivos = process.argv.slice(2);
if (!archivos.length) {
  console.error('Uso: node verificar-invariantes.mjs <archivo.sol> [...]');
  process.exit(2);
}

/** Quita comentarios y cadenas para no dar falsos positivos al mencionarlos en prosa. */
function limpiar(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')   // bloque
    .replace(/\/\/[^\n]*/g, ' ')          // línea
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')  // cadenas
    .replace(/'(?:[^'\\]|\\.)*'/g, "''");
}

/** Nombres de función declarados en el código. */
function funciones(src) {
  return [...src.matchAll(/\bfunction\s+([A-Za-z_]\w*)/g)].map(m => m[1]);
}

const PROHIBIDAS = [
  ['transfer',           'mover una acción entre direcciones la vuelve acumulable'],
  ['transferFrom',       'mover una acción entre direcciones la vuelve acumulable'],
  ['safeTransferFrom',   'mover una acción entre direcciones la vuelve acumulable'],
  ['approve',            'aprobar a un tercero prepara la transferencia'],
  ['setApprovalForAll',  'aprobar a un tercero prepara la transferencia'],
  ['desbloquear',        'el bloqueo ERC-5192 debe ser permanente'],
  ['unlock',             'el bloqueo ERC-5192 debe ser permanente'],
  ['setLocked',          'el bloqueo ERC-5192 no admite cambio de estado'],
];

const reglas = [
  {
    id: 1,
    nombre: 'La acción no se transfiere',
    revisar(src) {
      const decl = funciones(src);
      const malas = PROHIBIDAS.filter(([f]) => decl.includes(f));
      return malas.map(([f, p]) => `declara function ${f}() — ${p}`);
    }
  },
  {
    id: 2,
    nombre: 'pesoDeVoto devuelve una constante',
    revisar(src) {
      const m = src.match(/function\s+pesoDeVoto\s*\([^)]*\)[^{]*\{([\s\S]*?)\n\s*\}/);
      if (!m) return ['no se encuentra function pesoDeVoto()'];
      const cuerpo = m[1];
      const fallos = [];
      for (const señal of ['patrimonio', 'aporta', 'balance', 'reputacion', 'reputación', 'antiguedad', 'antigüedad', 'stake', 'shares']) {
        if (new RegExp(señal, 'i').test(cuerpo)) {
          fallos.push(`su cuerpo menciona «${señal}»: el peso no puede depender del capital ni del mérito`);
        }
      }
      // debe devolver 1 (y 0 para quien no es socio), no una expresión calculada
      if (!/\breturn\b[^;]*\b1\b/.test(cuerpo)) {
        fallos.push('no devuelve literalmente 1 para un socio');
      }
      return fallos;
    }
  },
  {
    id: 3,
    nombre: 'El bloqueo ERC-5192 es permanente',
    revisar(src) {
      if (!/function\s+locked\s*\(/.test(src)) return [];   // contrato sin ERC-5192: no aplica
      const m = src.match(/function\s+locked\s*\([^)]*\)[^{]*\{([\s\S]*?)\n\s*\}/);
      if (m && !/\breturn\s+true\s*;/.test(m[1])) {
        return ['locked() no devuelve true incondicionalmente'];
      }
      return [];
    }
  },
  {
    id: 4,
    nombre: 'Una acción por identidad única',
    revisar(src) {
      const m = src.match(/function\s+suscribir\s*\([^)]*\)[^{]*\{([\s\S]*?)\n\s*\}/);
      if (!m) return ['no se encuentra function suscribir()'];
      const cuerpo = m[1];
      const fallos = [];
      if (!/require\s*\(\s*!\s*\w*[Ii]dentidad/.test(cuerpo))
        fallos.push('no comprueba que la prueba de unicidad no estuviera ya registrada');
      if (!/require\s*\(\s*!\s*\w*[Ee]sSocio/.test(cuerpo))
        fallos.push('no comprueba que la dirección no fuera ya socia');
      return fallos;
    }
  },
  {
    id: 5,
    nombre: 'Los aportes no dan voto',
    revisar(src) {
      const m = src.match(/function\s+aportar\s*\([^)]*\)[^{]*\{([\s\S]*?)\n\s*\}/);
      if (!m) return [];   // sin tramo de aporte voluntario: no aplica
      const cuerpo = m[1];
      return /peso|voto|votos/i.test(cuerpo)
        ? ['aportar() toca el peso de voto: el capital no debe comprar poder']
        : [];
    }
  },
  {
    id: 6,
    nombre: 'La delegación lleva guarda de ciclos',
    revisar(src) {
      if (!/function\s+(pesoVoto|recibidas|delegar)\s*\(/.test(src)) return [];  // sin delegación: no aplica
      const fallos = [];
      if (!/visto|visitad|seen|guard/i.test(src))
        fallos.push('la recursión de delegación no parece llevar conjunto de visitados');
      if (!/function\s+revocar\s*\(/.test(src))
        fallos.push('no existe function revocar(): la delegación debe ser revocable sin plazo ni causa');
      return fallos;
    }
  },
];

let violaciones = 0;
for (const ruta of archivos) {
  let bruto;
  try { bruto = readFileSync(ruta, 'utf8'); }
  catch { console.error(`✗ no se puede leer ${ruta}`); violaciones++; continue; }
  const src = limpiar(bruto);

  console.log(`\n── ${basename(ruta)} ──`);
  for (const r of reglas) {
    const fallos = r.revisar(src);
    if (fallos.length) {
      violaciones += fallos.length;
      console.log(`  ✗ [${r.id}] ${r.nombre}`);
      fallos.forEach(f => console.log(`      ${f}`));
    } else {
      console.log(`  ✓ [${r.id}] ${r.nombre}`);
    }
  }
}

console.log();
if (violaciones) {
  console.log(`${violaciones} violación(es) de invariante. Lee SKILL.md antes de continuar:`);
  console.log('cada una de estas propiedades es la diferencia entre una cooperativa y una plutocracia.');
  process.exit(1);
}
console.log('Todas las invariantes se sostienen.');
