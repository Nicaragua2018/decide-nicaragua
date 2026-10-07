/* ============================================================
   MVP de gobernanza para una DAO — motor
   Todo el estado se deriva de una cadena de actos firmados.
   ============================================================ */

/* ---------- CONFIGURACIÓN: cámbiala para otra organización ---------- */
const DAO = {
  nombre: 'Renacer <em>City</em>',
  lema: 'derecho · democracia · libertad',
  dominios: ['Gobernanza', 'Tesorería', 'Identidad', 'Comunicación'],
  umbrales: { ordinaria: 60, reforma: 66, racimos: 2, apoyoPropuesta: 12, topeDelegacion: 15 }
};

/* ---------- ALMACÉN TOLERANTE A FALLOS ---------- */
const store = {
  _m: {},
  get(k){ try { return localStorage.getItem(k); } catch(e){ return this._m[k] ?? null; } },
  set(k,v){ try { localStorage.setItem(k,v); } catch(e){ this._m[k]=v; } },
  del(k){ try { localStorage.removeItem(k); } catch(e){ delete this._m[k]; } }
};

/* ---------- ALEATORIEDAD DETERMINISTA (datos semilla reproducibles) ---------- */
function rnd(s){ const x = Math.sin(s*12.9898)*43758.5453; return x - Math.floor(x); }

/* ---------- MIEMBROS SIMULADOS ----------
   Cada miembro tiene una postura latente en dos ejes; sus votos se derivan
   de ella con ruido. El agrupamiento posterior debe RECUPERAR esa estructura:
   si lo hace, el algoritmo funciona.                                        */
const NOMBRES = ['jimena','paolo','ren','sofia','marco','ana','luis','carmen','diego','elena',
 'raul','pilar','ivan','nuria','hugo','teresa','oscar','julia','mateo','rosa',
 'felipe','lucia','andres','marta','javier','irene','tomas','clara','pablo','silvia',
 'gabriel','laura','ruben','adriana','emilio','berta','nestor','olga','cesar','vera'];

const MIEMBROS = NOMBRES.map((n,i) => ({
  id: 'm'+i,
  seudo: '@'+n,
  // postura latente: dos ejes continuos
  ejeA: rnd(i*7+1)*2-1,
  ejeB: rnd(i*13+5)*2-1,
  rep: Math.round(400 + rnd(i*3+2)*1800)
}));

/* ---------- AFIRMACIONES SEMILLA ---------- */
const AFIRM_BASE = [
  { t:'El cuórum debe calcularse sobre los miembros activos en los últimos noventa días, no sobre el padrón histórico.', tema:'Gobernanza', pa: 0.9, pb: 0.1 },
  { t:'Toda delegación debe ser revocable al instante, sin plazo ni causa.', tema:'Gobernanza', pa: 0.2, pb: 0.2 },
  { t:'Ningún miembro debería acumular más del quince por ciento de las delegaciones del territorio.', tema:'Gobernanza', pa:-0.7, pb: 0.4 },
  { t:'El voto ejercido por delegación debe ser público decisión por decisión.', tema:'Gobernanza', pa: 0.3, pb:-0.8 },
  { t:'Una propuesta necesita apoyo de dos agrupamientos distintos antes de pasar a votación.', tema:'Gobernanza', pa: 0.1, pb: 0.3 },
  { t:'Las cuentas de la asamblea deben publicarse íntegras aunque dejen mal a quien las administra.', tema:'Tesorería', pa: 0.5, pb: 0.6 },
  { t:'Ningún administrador puede firmar solo un desembolso: hacen falta tres de cinco firmas.', tema:'Tesorería', pa: 0.2, pb: 0.5 },
  { t:'La cuota de entrada debe ser simbólica para que nadie quede fuera por pobreza.', tema:'Identidad', pa:-0.4, pb: 0.9 },
  { t:'La identidad real de los miembros no debe almacenarse nunca en el sistema.', tema:'Identidad', pa:-0.6, pb: 0.3 },
  { t:'Las cuentas nuevas deben pasar una cuarentena antes de poder votar de forma vinculante.', tema:'Identidad', pa: 0.8, pb:-0.3 },
  { t:'Quien avala a un nuevo miembro arriesga su propia reputación si resulta ser un duplicado.', tema:'Identidad', pa: 0.7, pb:-0.5 },
  { t:'Las actas de cada decisión deben poder recalcularse desde datos abiertos sin pedir permiso.', tema:'Comunicación', pa: 0.4, pb: 0.7 }
];

/* Votos simulados: proyección de la postura del miembro sobre la afirmación */
function votoSimulado(m, a, k){
  const s = m.ejeA*a.pa + m.ejeB*a.pb + (rnd(k*31+7)-0.5)*0.55;
  if (s >  0.18) return  1;
  if (s < -0.18) return -1;
  return 0;
}

/* ============================================================
   CRIPTOGRAFÍA: identidad y cadena de actos
   ============================================================ */
const enc = new TextEncoder();
const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2,'0')).join('');
const desHex = s => new Uint8Array(s.match(/../g).map(x => parseInt(x,16)));
async function sha(s){ return hex(await crypto.subtle.digest('SHA-256', enc.encode(s))); }

let PRIV=null, PUB=null, PUBHEX='', LEDGER=[], colaCadena=Promise.resolve(null);

async function idInit(){
  const pj = store.get('mvpPriv'), bj = store.get('mvpPub');
  if (pj && bj){
    PRIV = await crypto.subtle.importKey('jwk', JSON.parse(pj), {name:'ECDSA',namedCurve:'P-256'}, true, ['sign']);
    PUB  = await crypto.subtle.importKey('jwk', JSON.parse(bj), {name:'ECDSA',namedCurve:'P-256'}, true, ['verify']);
  } else {
    const kp = await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'}, true, ['sign','verify']);
    PRIV = kp.privateKey; PUB = kp.publicKey;
    store.set('mvpPriv', JSON.stringify(await crypto.subtle.exportKey('jwk', PRIV)));
    store.set('mvpPub',  JSON.stringify(await crypto.subtle.exportKey('jwk', PUB)));
  }
  PUBHEX = hex(await crypto.subtle.exportKey('raw', PUB));
}
function acto(tipo, datos){
  if (!PRIV) return Promise.resolve(null);
  colaCadena = colaCadena.then(() => _acto(tipo, datos)).catch(() => null);
  return colaCadena;
}
async function _acto(tipo, datos){
  const prev = LEDGER.length ? LEDGER[LEDGER.length-1].hash : 'génesis';
  const i = LEDGER.length, ts = new Date().toISOString();
  const hash  = await sha(JSON.stringify({i, ts, tipo, datos, prev}));
  const firma = hex(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'}, PRIV, enc.encode(hash)));
  LEDGER.push({i, ts, tipo, datos, prev, hash, firma});
  store.set('mvpLedger', JSON.stringify(LEDGER));
  return hash;
}
async function verificarCadena(){
  let prev = 'génesis';
  for (const a of LEDGER){
    const h = await sha(JSON.stringify({i:a.i, ts:a.ts, tipo:a.tipo, datos:a.datos, prev:a.prev}));
    if (a.prev !== prev || h !== a.hash) return {ok:false, i:a.i, motivo:'el hash no encadena'};
    const f = await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'}, PUB, desHex(a.firma), enc.encode(a.hash));
    if (!f) return {ok:false, i:a.i, motivo:'la firma no verifica'};
    prev = a.hash;
  }
  return {ok:true, n:LEDGER.length};
}
async function raizMerkle(){
  if (!LEDGER.length) return null;
  let nivel = LEDGER.map(a => a.hash);
  while (nivel.length > 1){
    const sig = [];
    for (let i=0; i<nivel.length; i+=2) sig.push(await sha(nivel[i] + (nivel[i+1] || nivel[i])));
    nivel = sig;
  }
  return nivel[0];
}

/* ============================================================
   MOTOR DE AGRUPAMIENTO: PCA por iteración de potencia + k-medias
   Esto no es decorativo: opera sobre la matriz real de votos.
   ============================================================ */
function pca2(M){
  const n = M.length, d = M[0].length;
  const media = Array(d).fill(0);
  M.forEach(r => r.forEach((v,j) => media[j] += v/n));
  const C = M.map(r => r.map((v,j) => v - media[j]));
  function componente(excluir){
    let v = Array.from({length:d}, (_,i) => rnd(i*17+3) - 0.5);
    for (let it=0; it<80; it++){
      const Cv = C.map(r => r.reduce((s,x,j) => s + x*v[j], 0));
      let w = Array(d).fill(0);
      C.forEach((r,i) => r.forEach((x,j) => { w[j] += x*Cv[i]; }));
      if (excluir){
        const dp = w.reduce((s,x,j) => s + x*excluir[j], 0);
        w = w.map((x,j) => x - dp*excluir[j]);
      }
      const norma = Math.hypot(...w) || 1;
      v = w.map(x => x/norma);
    }
    return v;
  }
  const v1 = componente(null), v2 = componente(v1);
  return C.map(r => [
    r.reduce((s,x,j) => s + x*v1[j], 0),
    r.reduce((s,x,j) => s + x*v2[j], 0)
  ]);
}
function kmedias2(pts){
  let mejor = -1, bi = 0, bj = 1;
  for (let i=0; i<pts.length; i++) for (let j=i+1; j<pts.length; j++){
    const dd = Math.hypot(pts[i][0]-pts[j][0], pts[i][1]-pts[j][1]);
    if (dd > mejor){ mejor = dd; bi = i; bj = j; }
  }
  let a = pts[bi].slice(), b = pts[bj].slice(), etq = [];
  for (let it=0; it<40; it++){
    etq = pts.map(p => Math.hypot(p[0]-a[0],p[1]-a[1]) <= Math.hypot(p[0]-b[0],p[1]-b[1]) ? 0 : 1);
    const ca=[0,0], cb=[0,0]; let na=0, nb=0;
    pts.forEach((p,i) => { if (etq[i]===0){ ca[0]+=p[0]; ca[1]+=p[1]; na++; } else { cb[0]+=p[0]; cb[1]+=p[1]; nb++; } });
    if (na) a = [ca[0]/na, ca[1]/na];
    if (nb) b = [cb[0]/nb, cb[1]/nb];
  }
  return etq;
}

/* ============================================================
   CONDORCET
   ============================================================ */
function condorcet(cands, duelos){
  const n = cands.length;
  const M = Array.from({length:n}, () => Array(n).fill(null));
  const victorias = Array(n).fill(0);
  for (const clave in duelos){
    const [i,j] = clave.split('-').map(Number);
    const g = duelos[clave], p = (g === i ? j : i);
    M[g][p] = true; M[p][g] = false;
    victorias[g]++;
  }
  const idx = [...Array(n).keys()];
  const ganador = idx.find(i => idx.every(j => i === j || M[i][j] === true));
  return { M, victorias, ganador: ganador === undefined ? null : ganador };
}

/* ============================================================
   DELEGACIÓN LÍQUIDA TRANSITIVA (con guarda de ciclos)
   Quien delega no vota; su peso viaja al delegado, y si este delega
   a su vez, sigue viajando.
   ============================================================ */
function delegadoDe(id, dominio){
  if (id === 'yo') return (ESTADO.delegaciones[dominio] || null);
  return (DELEG_SIM[id] && DELEG_SIM[id][dominio]) || null;
}
function pesoVoto(id, dominio){
  if (delegadoDe(id, dominio)) return 0;
  return 1 + recibidas(id, dominio, new Set([id]));
}
function recibidas(id, dominio, vistos){
  let suma = 0;
  const todos = [...MIEMBROS.map(m => m.id), 'yo'];
  for (const otro of todos){
    if (vistos.has(otro)) continue;
    if (delegadoDe(otro, dominio) === id){
      vistos.add(otro);
      suma += 1 + recibidas(otro, dominio, vistos);
    }
  }
  return suma;
}
/* Delegaciones simuladas: algunos miembros delegan en los de más reputación */
const DELEG_SIM = {};
MIEMBROS.forEach((m,i) => {
  DAO.dominios.forEach((dom,k) => {
    if (rnd(i*23 + k*5 + 11) < 0.3){
      const cands = MIEMBROS.filter(x => x.id !== m.id && x.rep > m.rep);
      if (cands.length){
        const elegido = cands[Math.floor(rnd(i*37 + k*3 + 2) * cands.length)];
        DELEG_SIM[m.id] = DELEG_SIM[m.id] || {};
        DELEG_SIM[m.id][dom] = elegido.id;
      }
    }
  });
});
