/**
 * Cálculo de grupos de opinión al estilo Pol.is (módulo puro).
 *
 * Matriz persona × frase (+1 de acuerdo, −1 en desacuerdo, 0 paso o sin voto)
 * → PCA a 2 dimensiones → k-means (k elegido por silueta) → recuento por grupo
 * de cada frase, para detectar frases puente y frases que dividen.
 *
 * Es determinista: perfiles y frases se recorren en orden de id y todo el azar
 * sale de un PRNG mulberry32 sembrado con `seedHex`. No usa Math.random ni Date.
 *
 * Los miembros de cada grupo (`members`) solo existen dentro del servicio;
 * el servicio nunca los devuelve.
 */

import { createHash } from 'crypto';

export interface VoteRow {
  profileId: string;
  fraseId: string;
  value: -1 | 0 | 1;
}

export interface OpinionResult {
  participants: number;
  grupos: { id: number; size: number; members: string[] }[];
  frases: {
    fraseId: string;
    porGrupo: { grupo: number; votantes: number; deAcuerdo: number; total: number }[];
  }[];
}

type FraseResult = OpinionResult['frases'][number];
type Point = [number, number];

const POWER_ITERATIONS = 100;
const KMEANS_ITERATIONS = 50;
/** Reinicios de k-means por cada k; se queda el de menor inercia. */
const KMEANS_RESTARTS = 5;
const EPS = 1e-12;

/** Los primeros 8 caracteres hex de sha256(id). */
export function seedFromId(id: string): string {
  return createHash('sha256').update(id).digest('hex').slice(0, 8);
}

/** PRNG mulberry32: devuelve números en [0, 1). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sortedUnique(values: Iterable<string>): string[] {
  return [...new Set(values)].sort();
}

// ─── PCA ──────────────────────────────────────────────────────────────────────

/**
 * Proyecta las filas de `matrix` sobre sus 2 componentes principales.
 * Iteración de potencias con deflación; si la varianza es 0, todo queda en 0.
 */
function pca2(matrix: number[][], rand: () => number): Point[] {
  const n = matrix.length;
  const d = matrix[0]?.length ?? 0;
  const means = new Array<number>(d).fill(0);
  for (const row of matrix) for (let j = 0; j < d; j++) means[j]! += row[j]! / n;
  const X = matrix.map((row) => row.map((v, j) => v - means[j]!));

  // Covarianza d × d.
  const C: number[][] = Array.from({ length: d }, () => new Array<number>(d).fill(0));
  for (const row of X) {
    for (let i = 0; i < d; i++) {
      const ri = row[i]!;
      if (ri === 0) continue;
      const Ci = C[i]!;
      for (let j = 0; j < d; j++) Ci[j]! += (ri * row[j]!) / n;
    }
  }

  const components: number[][] = [];
  for (let c = 0; c < 2; c++) {
    let v = Array.from({ length: d }, () => rand() - 0.5);
    let lambda = 0;
    for (let it = 0; it < POWER_ITERATIONS; it++) {
      const w = C.map((Ci) => Ci.reduce((s, cij, j) => s + cij * v[j]!, 0));
      const norm = Math.sqrt(w.reduce((s, x) => s + x * x, 0));
      if (norm < EPS) {
        lambda = 0;
        break;
      }
      v = w.map((x) => x / norm);
      lambda = norm;
    }
    if (lambda < EPS) {
      components.push(new Array<number>(d).fill(0));
      continue;
    }
    // Signo canónico: la coordenada de mayor valor absoluto queda positiva.
    let maxIdx = 0;
    for (let j = 1; j < d; j++) if (Math.abs(v[j]!) > Math.abs(v[maxIdx]!)) maxIdx = j;
    if (v[maxIdx]! < 0) v = v.map((x) => -x);
    components.push(v);
    // Deflación: C ← C − λ v vᵀ.
    for (let i = 0; i < d; i++) for (let j = 0; j < d; j++) C[i]![j]! -= lambda * v[i]! * v[j]!;
  }

  return X.map((row) => {
    const p = components.map((comp) => row.reduce((s, x, j) => s + x * comp[j]!, 0));
    return [p[0] ?? 0, p[1] ?? 0];
  });
}

// ─── k-means y silueta ────────────────────────────────────────────────────────

function dist2(a: Point, b: Point): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return dx * dx + dy * dy;
}

function nearest(p: Point, centers: Point[]): number {
  let best = 0;
  let bestD = Infinity;
  centers.forEach((c, i) => {
    const dd = dist2(p, c);
    if (dd < bestD) {
      bestD = dd;
      best = i;
    }
  });
  return best;
}

/**
 * k-means con inicialización k-means++. Devuelve la asignación de cada punto,
 * o null si algún grupo queda vacío (ese k se descarta).
 */
function kmeans(points: Point[], k: number, rand: () => number): number[] | null {
  const n = points.length;
  const first = points[Math.min(n - 1, Math.floor(rand() * n))]!;
  const centers: Point[] = [[first[0], first[1]]];
  while (centers.length < k) {
    const d2 = points.map((p) => dist2(p, centers[nearest(p, centers)]!));
    const total = d2.reduce((s, x) => s + x, 0);
    if (total < EPS) return null;
    let r = rand() * total;
    let idx = n - 1;
    for (let i = 0; i < n; i++) {
      r -= d2[i]!;
      if (r < 0) {
        idx = i;
        break;
      }
    }
    const p = points[idx]!;
    centers.push([p[0], p[1]]);
  }

  let assign = points.map((p) => nearest(p, centers));
  for (let it = 0; it < KMEANS_ITERATIONS; it++) {
    const sums: Point[] = centers.map(() => [0, 0]);
    const counts = new Array<number>(k).fill(0);
    points.forEach((p, i) => {
      const g = assign[i]!;
      sums[g]![0] += p[0];
      sums[g]![1] += p[1];
      counts[g]!++;
    });
    if (counts.some((c) => c === 0)) return null;
    for (let g = 0; g < k; g++) centers[g] = [sums[g]![0] / counts[g]!, sums[g]![1] / counts[g]!];
    const next = points.map((p) => nearest(p, centers));
    const changed = next.some((g, i) => g !== assign[i]);
    assign = next;
    if (!changed) break;
  }
  const counts = new Array<number>(k).fill(0);
  for (const g of assign) counts[g]!++;
  if (counts.some((c) => c === 0)) return null;
  return assign;
}

function inertia(points: Point[], assign: number[], k: number): number {
  const sums: Point[] = Array.from({ length: k }, () => [0, 0]);
  const counts = new Array<number>(k).fill(0);
  points.forEach((p, i) => {
    const g = assign[i]!;
    sums[g]![0] += p[0];
    sums[g]![1] += p[1];
    counts[g]!++;
  });
  const centers = sums.map((s, g): Point => [s[0] / counts[g]!, s[1] / counts[g]!]);
  return points.reduce((acc, p, i) => acc + dist2(p, centers[assign[i]!]!), 0);
}

/** Varios reinicios de k-means; gana el de menor inercia (el primero si empatan). */
function bestKmeans(points: Point[], k: number, rand: () => number): number[] | null {
  let best: number[] | null = null;
  let bestInertia = Infinity;
  for (let r = 0; r < KMEANS_RESTARTS; r++) {
    const a = kmeans(points, k, rand);
    if (!a) continue;
    const w = inertia(points, a, k);
    if (w < bestInertia - EPS) {
      bestInertia = w;
      best = a;
    }
  }
  return best;
}

/** Media de la silueta de cada punto (un punto solo en su grupo cuenta 0). */
function meanSilhouette(points: Point[], assign: number[], k: number): number {
  const n = points.length;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const own = assign[i]!;
    const sums = new Array<number>(k).fill(0);
    const counts = new Array<number>(k).fill(0);
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      const g = assign[j]!;
      sums[g]! += Math.sqrt(dist2(points[i]!, points[j]!));
      counts[g]!++;
    }
    if (counts[own] === 0) continue;
    const a = sums[own]! / counts[own]!;
    let b = Infinity;
    for (let g = 0; g < k; g++) {
      if (g !== own && counts[g]! > 0) b = Math.min(b, sums[g]! / counts[g]!);
    }
    const m = Math.max(a, b);
    if (Number.isFinite(b) && m > 0) sum += (b - a) / m;
  }
  return sum / n;
}

// ─── Análisis ─────────────────────────────────────────────────────────────────

export function analyzeOpinions(
  rows: VoteRow[],
  seedHex: string,
  opts: { minVotos?: number; maxK?: number } = {},
): OpinionResult {
  const minVotos = opts.minVotos ?? 3;
  const maxK = opts.maxK ?? 4;

  // Votos por persona (una fila por persona y frase; si se repite, gana la última).
  const votes = new Map<string, Map<string, -1 | 0 | 1>>();
  for (const r of rows) {
    let m = votes.get(r.profileId);
    if (!m) votes.set(r.profileId, (m = new Map()));
    m.set(r.fraseId, r.value);
  }

  const people = sortedUnique(votes.keys()).filter((p) => votes.get(p)!.size >= minVotos);
  const fraseIds = sortedUnique(people.flatMap((p) => [...votes.get(p)!.keys()]));
  const n = people.length;

  let assign: number[] = new Array<number>(n).fill(0);
  let k = 1;
  let points: Point[] = people.map(() => [0, 0]);

  // Con menos de 6 personas o menos de 2 frases no hay mapa: un solo grupo.
  if (n >= 6 && fraseIds.length >= 2) {
    const matrix = people.map((p) => {
      const m = votes.get(p)!;
      return fraseIds.map((f) => m.get(f) ?? 0);
    });
    const rand = mulberry32(parseInt(seedHex, 16));
    points = pca2(matrix, rand);
    const distinct = new Set(points.map((p) => `${p[0].toFixed(9)},${p[1].toFixed(9)}`)).size;
    const kMax = Math.min(maxK, Math.floor(n / 3), distinct);
    let bestScore = 0;
    for (let kk = 2; kk <= kMax; kk++) {
      const a = bestKmeans(points, kk, rand);
      if (!a) continue;
      const s = meanSilhouette(points, a, kk);
      if (s > bestScore) {
        bestScore = s;
        assign = a;
        k = kk;
      }
    }
  }

  // Numeración: tamaño descendente; si empatan, centroide en el primer eje ascendente.
  const raw = Array.from({ length: k }, (_, g) => {
    const idx = assign.flatMap((a, i) => (a === g ? [i] : []));
    const cx = idx.reduce((s, i) => s + points[i]![0], 0) / Math.max(1, idx.length);
    return { members: idx.map((i) => people[i]!), cx };
  }).filter((g) => g.members.length > 0);
  raw.sort(
    (a, b) =>
      b.members.length - a.members.length ||
      a.cx - b.cx ||
      (a.members[0]! < b.members[0]! ? -1 : 1),
  );
  const grupos = raw.map((g, id) => ({ id, size: g.members.length, members: [...g.members].sort() }));

  const frases: FraseResult[] = fraseIds.map((fraseId) => ({
    fraseId,
    porGrupo: grupos.map((g) => {
      let votantes = 0;
      let deAcuerdo = 0;
      for (const m of g.members) {
        const v = votes.get(m)!.get(fraseId);
        if (v === undefined) continue;
        votantes++;
        if (v === 1) deAcuerdo++;
      }
      return { grupo: g.id, votantes, deAcuerdo, total: votantes };
    }),
  }));

  return { participants: n, grupos, frases };
}

// ─── Frases puente y frases que dividen ───────────────────────────────────────

function acuerdo(g: FraseResult['porGrupo'][number]): number {
  return g.total > 0 ? g.deAcuerdo / g.total : 0;
}

/**
 * Frase puente: en cada grupo, al menos `minVotantes` personas la votaron y el
 * acuerdo es ≥ `umbral`. Con un solo grupo equivale a un consenso general.
 */
export function isPuente(frase: FraseResult, minVotantes = 3, umbral = 0.6): boolean {
  if (frase.porGrupo.length === 0) return false;
  return frase.porGrupo.every((g) => g.votantes >= minVotantes && acuerdo(g) >= umbral);
}

/**
 * Frase que divide: requiere al menos 2 grupos; algún grupo tiene acuerdo
 * ≥ `alto` y otro ≤ `bajo`, ambos con al menos `minVotantes` votantes.
 */
export function isDivisiva(frase: FraseResult, minVotantes = 3, alto = 0.6, bajo = 0.4): boolean {
  const validos = frase.porGrupo.filter((g) => g.votantes >= minVotantes);
  if (frase.porGrupo.length < 2 || validos.length < 2) return false;
  return validos.some((g) => acuerdo(g) >= alto) && validos.some((g) => acuerdo(g) <= bajo);
}
