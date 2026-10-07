/* ============================================================
   ESTADO DE LA APLICACIÓN — se reconstruye reproduciendo la cadena
   ============================================================ */
const ESTADO = {
  afirmaciones: AFIRM_BASE.map((a,i) => ({ id:'a'+i, ...a, autor: MIEMBROS[(i*5)%MIEMBROS.length].seudo })),
  misVotos: {},                 // afirmacionId -> -1|0|1
  indiceConsenso: 0,
  consultas: [],
  misRespuestas: {},            // consultaId -> índice de opción
  propuestas: [],
  misApoyos: {},                // propuestaId -> true
  misArgumentos: {},            // propuestaId -> {lado, texto}
  duelos: {},                   // "i-j" -> índice ganador
  delegaciones: {},             // dominio -> idMiembro
  reglamento: [],
  blog: [],
  seudo: '@tú'
};

const ESCRUTINIO = {};          // consultaId -> {opcionIdx: pesoAcumulado} simulado

function iniciarDatos(){
  ESTADO.consultas = [
    { id:'c0', pregunta:'¿Cada cuánto debe renovarse el mandato de los administradores de tesorería?',
      opciones:['Cada 6 meses','Cada 12 meses','Cada 24 meses'], dominio:'Tesorería', cierra:'en 4 días', autor:'@jimena' },
    { id:'c1', pregunta:'¿Qué vía de verificación debe ser la predeterminada para nuevos miembros?',
      opciones:['Aval de cinco miembros','Documento de un solo uso','Verificación presencial'], dominio:'Identidad', cierra:'en 9 días', autor:'@sofia' }
  ];
  ESTADO.propuestas = [
    { id:'p0', titulo:'Publicar el registro de votos delegados decisión por decisión',
      cuerpo:'Quien recibe delegaciones ejerce poder prestado. Publicar cómo lo ejerce, decisión por decisión, permite al delegante revocar con criterio en lugar de a ciegas. El delegante permanece anónimo; el delegado no.',
      dominio:'Gobernanza', tipo:'ordinaria', estado:'votacion', autor:'@paolo', apoyos:31,
      favor:['Sin esto, revocar es un acto a ciegas.','Es la contrapartida natural de recibir poder ajeno.'],
      contra:['Expone al delegado a presión sobre votos impopulares.'] },
    { id:'p1', titulo:'Fijar el tope de delegaciones acumuladas en el quince por ciento',
      cuerpo:'Ningún miembro podrá recibir delegaciones que superen el quince por ciento del total del dominio. Alcanzado el tope, las nuevas delegaciones se rechazan automáticamente y el delegante recupera su voto directo.',
      dominio:'Gobernanza', tipo:'reforma', estado:'abierta', autor:'@ana', apoyos:9,
      favor:['Evita que la democracia líquida degenere en oligarquía.'],
      contra:['Castiga al delegado competente por serlo.','El tope es arbitrario: ¿por qué quince y no veinte?'] },
    { id:'p2', titulo:'Destinar el excedente trimestral a auditoría externa independiente',
      cuerpo:'El excedente de tesorería que no esté comprometido al cierre de cada trimestre se destinará a contratar auditoría externa por concurso público, pagada por multifirma y publicada íntegra.',
      dominio:'Tesorería', tipo:'ordinaria', estado:'aprobada', autor:'@ren', apoyos:47,
      favor:['Un sistema que solo se audita a sí mismo no está auditado.','Convierte el excedente en confianza.'],
      contra:[] }
  ];
  ESTADO.reglamento = [
    { n:1, t:'La asamblea se constituye como comunidad voluntaria sin territorio, fundada en reglas verificables y en el consentimiento explícito de quien entra.', r:'ratificado · 96%' },
    { n:2, t:'Cada persona suscribe una sola acción, intransferible, que confiere exactamente un voto, con independencia del capital que aporte.', r:'ratificado · 94%' },
    { n:3, t:'Toda delegación es revocable sin plazo ni causa, y es transitiva mientras ningún eslabón la revoque.', r:'ratificado · 91%' },
    { n:4, t:'Ninguna propuesta pasa a votación vinculante sin apoyo de al menos dos agrupamientos de opinión distintos.', r:'ratificado · 89%' },
    { n:5, t:'Ningún administrador puede firmar solo un desembolso; administra y propone, pero no controla la llave.', r:'ratificado · 95%' },
    { n:6, t:'Todo dato que sustente una decisión es público y recalculable por cualquiera, sin autorización previa.', r:'ratificado · 97%' },
    { n:7, t:'Cualquier artículo puede ser objetado por un miembro, y reformado si la impugnación reúne dos agrupamientos y el sesenta y seis por ciento.', r:'ratificado · 98%', reforma:true }
  ];
  ESTADO.blog = [
    { id:'b0', titulo:'La asamblea aprobó la auditoría externa trimestral', etq:'noticia', fecha:'hace 2 días', autor:'@ren',
      cuerpo:'Con el 71% de apoyo y respaldo de los dos agrupamientos, la propuesta de destinar el excedente trimestral a auditoría externa queda aprobada. El concurso se abre la semana próxima y el informe se publicará íntegro, incluidos los hallazgos desfavorables.' },
    { id:'b1', titulo:'Cómo funciona el mapa de opinión que ves en Consensos', etq:'recurso', fecha:'hace 6 días', autor:'@paolo',
      cuerpo:'El mapa no está dibujado a mano. Se toma la matriz de votos de todos los miembros, se centra, se extraen sus dos componentes principales por iteración de potencia y se proyecta cada persona sobre ese plano. Los grupos salen de aplicar k-medias a esa proyección. Si alguien quiere comprobarlo, los datos y el algoritmo son públicos.' },
    { id:'b2', titulo:'Convocatoria: elección de administradores de tesorería', etq:'convocatoria', fecha:'hace 11 días', autor:'@jimena',
      cuerpo:'Se abre la elección por el método Condorcet para los cuatro puestos de administración de tesorería. Cada miembro compara candidatos de dos en dos. Se publican méritos verificables; las promesas de campaña no se admiten en la ficha.' }
  ];
  ESTADO.recursos = [
    { t:'Reglamento constitutivo completo', d:'Los siete artículos vigentes con su historial de reformas' },
    { t:'Datos abiertos de la asamblea', d:'Padrón anonimizado, votos, matriz de opinión y actas' },
    { t:'Guía de la democracia líquida', d:'Cómo delegar, cómo revocar y qué significa que sea transitiva' },
    { t:'Cómo verificar una decisión', d:'Recalcular el consenso desde cero con tu propio código' }
  ];
  ESTADO.candidatos = [
    { n:'@jimena', rep:2140, m:['Redactó tres contratos públicos hoy auditables','Ningún mandato revocado en dos años'] },
    { n:'@paolo',  rep:1870, m:['Auditó el módulo de revocación vigente','Denunció un error propio antes de ser detectado'] },
    { n:'@sofia',  rep:1545, m:['Cero duplicados en su turno como verificadora','Rotó antes del límite de mandato'] },
    { n:'@marco',  rep:1390, m:['Mantiene dos de los siete nodos del registro','Publica métricas cada semana'] }
  ];
  ESTADO.pares = [];
  for (let i=0; i<ESTADO.candidatos.length; i++)
    for (let j=i+1; j<ESTADO.candidatos.length; j++) ESTADO.pares.push([i,j]);
}

/* ---------- MATRIZ DE OPINIÓN: miembros simulados + yo ---------- */
function matrizOpinion(){
  const A = ESTADO.afirmaciones;
  const filas = MIEMBROS.map((m,i) => A.map((a,k) => a.pa === undefined ? 0 : votoSimulado(m, a, i*100+k)));
  const mia = A.map(a => ESTADO.misVotos[a.id] ?? 0);
  return { filas: [...filas, mia], miIndice: filas.length };
}
let CACHE_CLUSTER = null;
function calcularAgrupamientos(){
  const { filas, miIndice } = matrizOpinion();
  const proy = pca2(filas);
  const etq = kmedias2(proy);
  const A = ESTADO.afirmaciones;
  // acuerdo por afirmación dentro de cada grupo
  const stats = A.map((a,k) => {
    const g = [[0,0],[0,0]];   // [votos no-paso, acuerdos]
    filas.forEach((f,i) => { if (f[k] !== 0){ g[etq[i]][0]++; if (f[k] === 1) g[etq[i]][1]++; } });
    const p0 = g[0][0] ? g[0][1]/g[0][0] : 0;
    const p1 = g[1][0] ? g[1][1]/g[1][0] : 0;
    return { af:a, p0, p1, puente: Math.min(p0,p1) };
  });
  const puentes = stats.filter(s => s.p0 >= .6 && s.p1 >= .6).sort((x,y) => y.puente - x.puente);
  CACHE_CLUSTER = { proy, etq, miIndice, stats, puentes,
    tam: [etq.filter(e => e===0).length, etq.filter(e => e===1).length] };
  return CACHE_CLUSTER;
}
function miGrupo(){ const c = CACHE_CLUSTER || calcularAgrupamientos(); return c.etq[c.miIndice]; }

/* ============================================================
   UTILIDADES DE INTERFAZ
   ============================================================ */
function toast(m){
  const t = document.getElementById('toast');
  t.textContent = m; t.classList.add('on');
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('on'), 3200);
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const REDUCIDO = matchMedia('(prefers-reduced-motion:reduce)').matches;

const SECCIONES = [
  ['panel','Panel','M3 12l9-9 9 9M5 10v10h14V10'],
  ['consenso','Consensos','M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z'],
  ['consulta','Consultas','M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11'],
  ['propuesta','Propuestas','M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M9 15h6'],
  ['eleccion','Elecciones','M12 8a4 4 0 100-8 4 4 0 000 8zM4 21v-1a8 8 0 0116 0v1'],
  ['delegacion','Delegación','M7 7h10M7 12h10M7 17h6M3 7h.01M3 12h.01M3 17h.01'],
  ['reglamento','Reglamento','M4 4h11l5 5v11H4zM15 4v5h5'],
  ['blog','Noticias','M4 4h16a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2zM8 10h8M8 14h5'],
  ['yo','Mi cuenta','M12 2l7 4v6c0 5-3 8-7 10-4-2-7-5-7-10V6z']
];
function pintarTabs(){
  const pendientes = {
    consenso: ESTADO.afirmaciones.length - Object.keys(ESTADO.misVotos).length,
    consulta: ESTADO.consultas.filter(c => ESTADO.misRespuestas[c.id] === undefined).length,
    eleccion: ESTADO.pares.length - Object.keys(ESTADO.duelos).length
  };
  document.getElementById('tabs').innerHTML = SECCIONES.map(([k,n,d],i) => {
    const p = pendientes[k];
    return `<button class="tab${i===0?' on':''}" data-v="${k}" aria-label="${n}" onclick="ir('${k}')">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="${d}"/></svg>
      <span>${n}</span>${p > 0 ? `<i class="pend">${p}</i>` : ''}</button>`;
  }).join('');
}
function ir(v, sinHash){
  if (!document.getElementById('v-'+v)) v = 'panel';
  document.querySelectorAll('.view').forEach(x => x.classList.remove('on'));
  document.getElementById('v-'+v).classList.add('on');
  document.querySelectorAll('.tab').forEach(x => {
    const on = x.dataset.v === v;
    x.classList.toggle('on', on);
    if (on) x.setAttribute('aria-current','page'); else x.removeAttribute('aria-current');
  });
  if (!sinHash && history.replaceState) history.replaceState(null, '', '#'+v);
  window.scrollTo({ top:0, behavior: REDUCIDO ? 'auto' : 'smooth' });
  pintarVista(v);
}
function pintarVista(v){
  ({ panel:pintarPanel, consenso:pintarConsenso, consulta:pintarConsultas, propuesta:pintarPropuestas,
     eleccion:pintarEleccion, delegacion:pintarDelegacion, reglamento:pintarReglamento,
     blog:pintarBlog, yo:pintarYo }[v] || (()=>{}))();
  pintarTabs();
  document.querySelectorAll('.tab').forEach(x => x.classList.toggle('on', x.dataset.v === v));
}

/* ============================================================
   VISTA: PANEL
   ============================================================ */
function pintarPanel(){
  const c = calcularAgrupamientos();
  const votadas = Object.keys(ESTADO.misVotos).length;
  document.getElementById('panelSub').textContent =
    `${MIEMBROS.length + 1} miembros con voto, ${ESTADO.propuestas.length} propuestas vivas y ${c.tam[0]} frente a ${c.tam[1]} miembros en cada agrupamiento de opinión.`;
  document.getElementById('panelStats').innerHTML = [
    [MIEMBROS.length + 1, 'miembros con una acción y un voto'],
    [`${c.tam[0]}·${c.tam[1]}`, 'tamaño de los dos agrupamientos'],
    [ESTADO.propuestas.filter(p => p.estado === 'votacion').length, 'propuestas en votación vinculante'],
    [c.puentes.length, 'afirmaciones puente detectadas']
  ].map(([n,l]) => `<div class="stat"><div class="n">${n}</div><div class="l">${l}</div></div>`).join('');

  const pend = [];
  const faltan = ESTADO.afirmaciones.length - votadas;
  if (faltan > 0) pend.push([`Votar ${faltan} afirmación${faltan===1?'':'es'} del mazo de consensos`, 'consenso', `${faltan} pendientes`]);
  ESTADO.consultas.filter(x => ESTADO.misRespuestas[x.id] === undefined)
    .forEach(x => pend.push([`Responder: ${x.pregunta.slice(0,52)}…`, 'consulta', x.cierra]));
  ESTADO.propuestas.filter(p => p.estado === 'votacion' && !ESTADO.misApoyos[p.id])
    .forEach(p => pend.push([`Votar la propuesta «${p.titulo.slice(0,42)}…»`, 'propuesta', 'vinculante']));
  const duelosFaltan = ESTADO.pares.length - Object.keys(ESTADO.duelos).length;
  if (duelosFaltan > 0) pend.push([`Completar ${duelosFaltan} comparación${duelosFaltan===1?'':'es'} de la elección`, 'eleccion', 'Condorcet']);
  document.getElementById('panelPend').innerHTML = pend.length
    ? pend.map(([t,v,e]) => `<div class="row"><span class="rl">${esc(t)}</span><button class="btn sm" onclick="ir('${v}')">${esc(e)}</button></div>`).join('')
    : '<div class="vacio">Nada pendiente. Todo lo que te tocaba está hecho.</div>';

  const maxDel = concentracionMaxima();
  document.getElementById('panelSalud').innerHTML = [
    ['Concentración máxima de delegaciones', `${maxDel.pct.toFixed(1)}% · ${esc(maxDel.quien)}`, maxDel.pct > DAO.umbrales.topeDelegacion ? 'c-mal' : 'c-ok'],
    ['Propuestas con un solo agrupamiento', `${ESTADO.propuestas.filter(p => p.estado==='abierta').length} bloqueadas`, 'c-sol'],
    ['Tu agrupamiento de opinión', miGrupo() === 0 ? 'Grupo A' : 'Grupo B', 'c-azul'],
    ['Actos firmados en tu cadena', String(LEDGER.length), '']
  ].map(([l,v,cl]) => `<div class="row"><span class="rl">${l}</span><span class="rv ${cl}">${esc(v)}</span></div>`).join('');

  document.getElementById('panelAct').innerHTML = LEDGER.length
    ? LEDGER.slice(-6).reverse().map(a =>
        `<div class="row"><span class="rl">${esc(ETIQ_ACTO[a.tipo] || a.tipo)}</span><span class="rv">0x${a.hash.slice(0,10)}…</span></div>`).join('')
    : '<div class="vacio">Todavía no has firmado ningún acto. Vota algo y aparecerá aquí.</div>';
}
const ETIQ_ACTO = { genesis:'Alta de membresía', opinion:'Voto en consensos', afirmacion:'Afirmación aportada',
  consulta_voto:'Respuesta a consulta', consulta_nueva:'Consulta propuesta', apoyo:'Apoyo a propuesta',
  argumento:'Argumento publicado', propuesta_nueva:'Propuesta redactada', voto_propuesta:'Voto vinculante',
  duelo:'Comparación de candidatos', delegar:'Delegación otorgada', revocar:'Delegación revocada', entrada:'Entrada publicada' };

/* ============================================================
   VISTA: CONSENSOS
   ============================================================ */
function siguienteAfirmacion(){
  return ESTADO.afirmaciones.find(a => ESTADO.misVotos[a.id] === undefined);
}
function pintarConsenso(){
  const c = calcularAgrupamientos();
  const a = siguienteAfirmacion();
  const total = ESTADO.afirmaciones.length, hechas = Object.keys(ESTADO.misVotos).length;
  document.getElementById('csCount').textContent = `${hechas} de ${total}`;
  document.getElementById('csBar').style.width = Math.round(hechas/total*100) + '%';
  ['csY','csN','csP'].forEach(id => document.getElementById(id).disabled = !a);
  if (a){
    document.getElementById('csTema').textContent = a.tema;
    document.getElementById('csTexto').textContent = a.t;
    document.getElementById('csAutor').textContent = `afirmación de ${a.autor}`;
  } else {
    document.getElementById('csTema').textContent = 'Mazo completado';
    document.getElementById('csTexto').textContent = 'Has votado todas las afirmaciones del mazo. Tus votos ya forman parte del mapa de opinión y del cálculo de afirmaciones puente.';
    document.getElementById('csAutor').textContent = 'puedes seguir aportando afirmaciones nuevas abajo';
  }
  dibujarMapa(c);
  document.getElementById('csPuentes').innerHTML = c.puentes.length
    ? c.puentes.slice(0,2).map(p => `<div class="puente">
        <div class="pt">Afirmación puente</div>
        <p>«${esc(p.af.t)}»</p>
        <div class="pc">${Math.round(p.p0*100)}% del grupo A · ${Math.round(p.p1*100)}% del grupo B — atraviesa la división</div>
      </div>`).join('')
    : `<div class="puente" style="border-left-color:var(--sol-bd);background:var(--sol-f)">
        <div class="pt" style="color:var(--sol)">Sin puentes todavía</div>
        <p>Ninguna afirmación reúne aún el 60% en ambos agrupamientos. Es la señal de que el debate sigue polarizado.</p></div>`;
}
function dibujarMapa(c){
  const NS = 'http://www.w3.org/2000/svg', mapa = document.getElementById('mapa');
  mapa.innerHTML = '';
  const xs = c.proy.map(p => p[0]), ys = c.proy.map(p => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const nx = v => 28 + ((v - minX) / ((maxX - minX) || 1)) * 264;
  const ny = v => 22 + ((v - minY) / ((maxY - minY) || 1)) * 146;
  const el = (n,at) => { const e = document.createElementNS(NS,n); for (const k in at) e.setAttribute(k, at[k]); return e; };
  c.proy.forEach((p,i) => {
    if (i === c.miIndice) return;
    mapa.appendChild(el('circle', { cx:nx(p[0]), cy:ny(p[1]), r:3.4,
      fill: c.etq[i] === 0 ? 'var(--racA)' : 'var(--racB)', opacity:.55 }));
  });
  const yo = c.proy[c.miIndice];
  mapa.appendChild(el('circle', { cx:nx(yo[0]), cy:ny(yo[1]), r:10, fill:'var(--yo)', opacity:.22 }));
  mapa.appendChild(el('circle', { cx:nx(yo[0]), cy:ny(yo[1]), r:5, fill:'var(--yo)', stroke:'var(--card)', 'stroke-width':2 }));
  document.getElementById('mapaLg').innerHTML = `
    <div class="lg"><i style="background:var(--racA)"></i>Grupo A <b>${c.tam[0]} miembros</b></div>
    <div class="lg"><i style="background:var(--racB)"></i>Grupo B <b>${c.tam[1]} miembros</b></div>
    <div class="lg"><i style="background:var(--yo)"></i>Tu posición <b>grupo ${miGrupo() === 0 ? 'A' : 'B'}</b></div>`;
}
function csVotar(v){
  const a = siguienteAfirmacion();
  if (!a) return;
  ESTADO.misVotos[a.id] = v;
  guardar();
  acto('opinion', { afirmacion:a.id, voto:v }).then(h => {
    if (h) document.getElementById('csSello').textContent = `Acto sellado y firmado: 0x${h.slice(0,12)}… ✓`;
  });
  CACHE_CLUSTER = null;
  pintarConsenso(); pintarTabs();
}
function csAportar(){
  const inp = document.getElementById('csNueva');
  const txt = inp.value.trim();
  if (!txt) { toast('Escribe una afirmación antes de enviarla'); return; }
  const id = 'u' + Date.now();
  ESTADO.afirmaciones.push({ id, t:txt, tema:'Aportada', autor:ESTADO.seudo, pa:0, pb:0 });
  inp.value = '';
  acto('afirmacion', { id, texto:txt });
  guardar(); CACHE_CLUSTER = null;
  toast('Tu afirmación entró al mazo: los demás la votarán igual que las otras');
  pintarConsenso(); pintarTabs();
}

/* ============================================================
   VISTA: CONSULTAS
   ============================================================ */
function escrutinioConsulta(c){
  if (!ESCRUTINIO[c.id]){
    const base = c.opciones.map((_,k) => {
      let s = 0;
      MIEMBROS.forEach((m,i) => {
        const pref = Math.floor((rnd(i*11 + k*3 + c.id.length*7) + m.ejeA*0.3 + 1) * c.opciones.length / 2.3) % c.opciones.length;
        if (pref === k) s += pesoVoto(m.id, c.dominio);
      });
      return s;
    });
    ESCRUTINIO[c.id] = base;
  }
  const tot = [...ESCRUTINIO[c.id]];
  const mia = ESTADO.misRespuestas[c.id];
  if (mia !== undefined) tot[mia] += pesoVoto('yo', c.dominio);
  return tot;
}
function pintarConsultas(){
  const cont = document.getElementById('consultasLista');
  document.getElementById('cnDominio').innerHTML = DAO.dominios.map(d => `<option>${d}</option>`).join('');
  cont.innerHTML = ESTADO.consultas.map(c => {
    const tot = escrutinioConsulta(c);
    const suma = tot.reduce((a,b) => a+b, 0) || 1;
    const mia = ESTADO.misRespuestas[c.id];
    const peso = pesoVoto('yo', c.dominio);
    const delegado = delegadoDe('yo', c.dominio);
    return `<div class="card" style="margin-bottom:14px">
      <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:10px">
        <span class="pill p-azul">${esc(c.dominio)}</span>
        <span class="mono" style="font-size:10.5px;color:var(--ink3)">de ${esc(c.autor)} · cierra ${esc(c.cierra)}</span>
      </div>
      <h4 class="ui" style="font-size:16px;margin:0 0 14px;line-height:1.35">${esc(c.pregunta)}</h4>
      ${c.opciones.map((o,k) => `
        <button class="opc ${mia===k?'elegida':''}" ${delegado?'disabled':''} onclick="responder('${c.id}',${k})">
          <span class="ot"><span>${esc(o)}</span><b>${tot[k].toFixed(0)} · ${Math.round(tot[k]/suma*100)}%</b></span>
          <span class="bar"><i style="width:${Math.round(tot[k]/suma*100)}%"></i></span>
        </button>`).join('')}
      <p class="mono" style="font-size:10.5px;color:var(--ink3);margin:10px 0 0;line-height:1.5">
        ${delegado
          ? `Delegaste este dominio en ${esc(nombreDe(delegado))}: tu voz la ejerce quien delegaste. Revócala en Delegación para votar tú.`
          : `Tu respuesta pesa ${peso} ${peso===1?'voto':'votos'}${peso>1?` (el tuyo más ${peso-1} delegado${peso-1===1?'':'s'})`:''}.`}
      </p>
    </div>`;
  }).join('') || '<div class="card"><div class="vacio">No hay consultas abiertas.</div></div>';
}
function responder(id, k){
  const c = ESTADO.consultas.find(x => x.id === id);
  if (delegadoDe('yo', c.dominio)) { toast('Has delegado este dominio: revoca la delegación para votar tú'); return; }
  ESTADO.misRespuestas[id] = k;
  acto('consulta_voto', { consulta:id, opcion:k, peso:pesoVoto('yo', c.dominio) });
  guardar();
  toast(`Respuesta registrada con peso ${pesoVoto('yo', c.dominio)}`);
  pintarConsultas(); pintarTabs();
}
function cnCrear(){
  const p = document.getElementById('cnPregunta').value.trim();
  const o = document.getElementById('cnOpciones').value.split(';').map(s => s.trim()).filter(Boolean);
  if (!p || o.length < 2) { toast('Hace falta una pregunta y al menos dos opciones'); return; }
  const id = 'c' + Date.now();
  ESTADO.consultas.unshift({ id, pregunta:p, opciones:o, dominio:document.getElementById('cnDominio').value, cierra:'en 7 días', autor:ESTADO.seudo });
  document.getElementById('cnPregunta').value = ''; document.getElementById('cnOpciones').value = '';
  acto('consulta_nueva', { id, pregunta:p, opciones:o });
  guardar(); toast('Consulta publicada'); pintarConsultas(); pintarTabs();
}
function nombreDe(id){
  if (id === 'yo') return ESTADO.seudo;
  const m = MIEMBROS.find(x => x.id === id);
  return m ? m.seudo : id;
}

/* ============================================================
   VISTA: PROPUESTAS
   ============================================================ */
const ETIQ_ESTADO = { abierta:['p-azul','Recogiendo apoyos'], votacion:['p-sol','En votación vinculante'],
  aprobada:['p-ok','Aprobada'], rechazada:['p-mal','Rechazada'] };
function pintarPropuestas(){
  document.getElementById('prDominio').innerHTML = DAO.dominios.map(d => `<option>${d}</option>`).join('');
  const c = calcularAgrupamientos();
  document.getElementById('propsLista').innerHTML = ESTADO.propuestas.map(p => {
    const [cls,txt] = ETIQ_ESTADO[p.estado];
    const umbral = p.tipo === 'reforma' ? DAO.umbrales.reforma : DAO.umbrales.ordinaria;
    const apoyado = !!ESTADO.misApoyos[p.id];
    const miArg = ESTADO.misArgumentos[p.id];
    const favor = [...p.favor, ...(miArg && miArg.lado === 'favor' ? [miArg.texto + ' — tú'] : [])];
    const contra = [...p.contra, ...(miArg && miArg.lado === 'contra' ? [miArg.texto + ' — tú'] : [])];
    const apoyos = p.apoyos + (apoyado ? 1 : 0);
    return `<div class="prop ${p.estado}">
      <div class="ph"><h4>${esc(p.titulo)}</h4><span class="pill ${cls}">${txt}</span></div>
      <div class="meta">${esc(p.autor)} · ${esc(p.dominio)} · ${p.tipo === 'reforma' ? 'reforma del reglamento' : 'política ordinaria'}</div>
      <p class="pbody">${esc(p.cuerpo)}</p>
      <div class="args">
        <div class="arg fav"><b>A favor (${favor.length})</b>${favor.length ? `<ul>${favor.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : 'Sin argumentos todavía.'}</div>
        <div class="arg con"><b>En contra (${contra.length})</b>${contra.length ? `<ul>${contra.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : 'Sin argumentos todavía.'}</div>
      </div>
      ${p.estado === 'abierta' || p.estado === 'votacion' ? `
      <div class="linea" style="margin-bottom:10px">
        <label class="sr" for="arg-${p.id}">Tu argumento</label>
        <input id="arg-${p.id}" maxlength="160" placeholder="${miArg ? 'Ya publicaste tu argumento en esta propuesta' : 'Un argumento, una sola vez, sin réplicas…'}" ${miArg?'disabled':''}>
        <button class="btn sm" ${miArg?'disabled':''} onclick="argumentar('${p.id}','favor')">A favor</button>
        <button class="btn sm" ${miArg?'disabled':''} onclick="argumentar('${p.id}','contra')">En contra</button>
      </div>` : ''}
      <div class="pacc">
        ${p.estado === 'abierta' ? `<button class="btn ${apoyado?'':'pri'} sm" ${apoyado?'disabled':''} onclick="apoyar('${p.id}')">${apoyado ? 'Ya la apoyaste' : 'Apoyar'}</button>
          <span class="mono" style="font-size:11px;color:var(--ink3)">${apoyos} de ${DAO.umbrales.apoyoPropuesta} apoyos</span>` : ''}
        ${p.estado === 'votacion' ? `<button class="btn pri sm" onclick="votarPropuesta('${p.id}',1)">Votar a favor</button>
          <button class="btn sm" onclick="votarPropuesta('${p.id}',-1)">Votar en contra</button>` : ''}
        ${p.estado === 'aprobada' ? `<span class="mono c-ok" style="font-size:11.5px">Ejecutada y sellada en el registro</span>` : ''}
        <span class="umbral">umbral: ${DAO.umbrales.racimos} agrupamientos + ${umbral}%</span>
      </div>
    </div>`;
  }).join('');
}
function apoyar(id){
  const p = ESTADO.propuestas.find(x => x.id === id);
  ESTADO.misApoyos[id] = true;
  acto('apoyo', { propuesta:id });
  if (p.apoyos + 1 >= DAO.umbrales.apoyoPropuesta){
    p.estado = 'votacion';
    toast('Alcanzó el umbral de apoyos con dos agrupamientos: pasa a votación vinculante');
  } else {
    toast(`Apoyo registrado: ${p.apoyos + 1} de ${DAO.umbrales.apoyoPropuesta}`);
  }
  guardar(); pintarPropuestas(); pintarTabs();
}
function argumentar(id, lado){
  const inp = document.getElementById('arg-' + id);
  const txt = inp.value.trim();
  if (!txt) { toast('Escribe tu argumento antes de publicarlo'); return; }
  ESTADO.misArgumentos[id] = { lado, texto:txt };
  acto('argumento', { propuesta:id, lado, texto:txt });
  guardar();
  toast('Argumento publicado. Una intervención por miembro: no hay réplicas.');
  pintarPropuestas();
}
function votarPropuesta(id, v){
  const p = ESTADO.propuestas.find(x => x.id === id);
  const peso = pesoVoto('yo', p.dominio);
  acto('voto_propuesta', { propuesta:id, sentido: v > 0 ? 'a favor' : 'en contra', peso });
  ESTADO.misApoyos[id] = true;
  guardar();
  toast(`Voto vinculante firmado ${v > 0 ? 'a favor' : 'en contra'} con peso ${peso}`);
  pintarPropuestas(); pintarTabs();
}
function prCrear(){
  const t = document.getElementById('prTitulo').value.trim();
  const b = document.getElementById('prCuerpo').value.trim();
  if (!t || !b) { toast('La propuesta necesita título y desarrollo'); return; }
  const id = 'p' + Date.now();
  ESTADO.propuestas.unshift({ id, titulo:t, cuerpo:b, dominio:document.getElementById('prDominio').value,
    tipo:document.getElementById('prTipo').value, estado:'abierta', autor:ESTADO.seudo, apoyos:0, favor:[], contra:[] });
  document.getElementById('prTitulo').value = ''; document.getElementById('prCuerpo').value = '';
  acto('propuesta_nueva', { id, titulo:t });
  guardar(); toast('Propuesta publicada: ahora necesita apoyos de dos agrupamientos');
  pintarPropuestas(); pintarTabs();
}

/* ============================================================
   VISTA: ELECCIONES
   ============================================================ */
function pintarEleccion(){
  const hechos = Object.keys(ESTADO.duelos).length, total = ESTADO.pares.length;
  document.getElementById('elCargo').textContent = 'Administración de tesorería · método Condorcet';
  document.getElementById('elProg').textContent = `${hechos} de ${total} comparaciones`;
  document.getElementById('elBar').style.width = Math.round(hechos/total*100) + '%';
  const par = ESTADO.pares.find(([i,j]) => ESTADO.duelos[`${i}-${j}`] === undefined);
  const cont = document.getElementById('elPar'), fin = document.getElementById('elFin');
  if (par){
    cont.style.display = ''; fin.style.display = 'none';
    cont.innerHTML = ficha(par[0]) + '<div class="vs">frente a</div>' + ficha(par[1]);
  } else {
    cont.style.display = 'none'; fin.style.display = '';
    const r = condorcet(ESTADO.candidatos, ESTADO.duelos);
    fin.innerHTML = `<div style="border:1px solid var(--ok-bd);background:var(--ok-f);border-radius:12px;padding:22px;text-align:center">
      <div class="ui" style="font-size:15px;font-weight:600;color:var(--ok);line-height:1.5">
        Boleta completa: evaluaste las ${total} comparaciones.<br>
        ${r.ganador !== null
          ? `Tu ganador de Condorcet es <b>${esc(ESTADO.candidatos[r.ganador].n)}</b>: vence a todos los demás en enfrentamiento directo.`
          : 'No hay ganador de Condorcet en tu boleta: tus preferencias forman un ciclo. Es un resultado legítimo y conocido del método.'}
      </div>
      <button class="btn sm" style="margin-top:14px" onclick="reiniciarBoleta()">Rehacer la boleta</button>
    </div>`;
  }
  const r = condorcet(ESTADO.candidatos, ESTADO.duelos);
  const orden = ESTADO.candidatos.map((c,i) => ({ c, i, v:r.victorias[i] })).sort((a,b) => b.v - a.v);
  document.getElementById('elRank').innerHTML = orden.map((o,k) =>
    `<div class="row"><span class="rl">${k+1} · ${esc(o.c.n)}${r.ganador === o.i ? ' <span class="pill p-ok" style="margin-left:6px">Condorcet</span>' : ''}</span><span class="rv">${o.v} ${o.v===1?'duelo':'duelos'}</span></div>`).join('');
  const n = ESTADO.candidatos.length;
  document.getElementById('elMatriz').innerHTML =
    `<tr><th></th>${ESTADO.candidatos.map(c => `<th>${esc(c.n.slice(1,5))}</th>`).join('')}</tr>` +
    ESTADO.candidatos.map((c,i) => `<tr><th style="text-align:left">${esc(c.n.slice(1,7))}</th>` +
      ESTADO.candidatos.map((_,j) => i === j ? '<td class="dash">—</td>' :
        r.M[i][j] === true ? '<td class="g">gana</td>' : r.M[i][j] === false ? '<td class="pp">pierde</td>' : '<td class="dash">·</td>').join('') + '</tr>').join('');
}
function ficha(i){
  const c = ESTADO.candidatos[i];
  return `<button class="cand" onclick="elegir(${i})" aria-label="Elegir a ${esc(c.n)}">
    <span class="ct"><span class="cav" aria-hidden="true"></span><span><span class="cn">${esc(c.n)}</span><span class="cr">reputación ${c.rep}</span></span></span>
    ${c.m.map(m => `<span class="ce"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg><span>${esc(m)}</span></span>`).join('')}
  </button>`;
}
function elegir(g){
  const par = ESTADO.pares.find(([i,j]) => ESTADO.duelos[`${i}-${j}`] === undefined);
  if (!par) return;
  ESTADO.duelos[`${par[0]}-${par[1]}`] = g;
  acto('duelo', { par:`${par[0]}-${par[1]}`, ganador:ESTADO.candidatos[g].n });
  guardar(); pintarEleccion(); pintarTabs();
}
function reiniciarBoleta(){ ESTADO.duelos = {}; guardar(); pintarEleccion(); pintarTabs(); toast('Boleta reiniciada'); }

/* ============================================================
   VISTA: DELEGACIÓN
   ============================================================ */
function concentracionMaxima(){
  let max = 0, quien = 'nadie';
  const totalPorDom = MIEMBROS.length + 1;
  DAO.dominios.forEach(dom => {
    [...MIEMBROS.map(m => m.id), 'yo'].forEach(id => {
      const p = pesoVoto(id, dom);
      const pct = (p - 1) / totalPorDom * 100;
      if (pct > max){ max = pct; quien = `${nombreDe(id)} en ${dom}`; }
    });
  });
  return { pct:max, quien };
}
function pintarDelegacion(){
  document.getElementById('delDominios').innerHTML = DAO.dominios.map(dom => {
    const d = delegadoDe('yo', dom);
    const peso = pesoVoto('yo', dom);
    const recibo = peso > 1 ? peso - 1 : 0;
    let cadena = '';
    if (d){
      const ruta = ['tú'];
      let act = d, guard = 0;
      while (act && guard++ < 8){ ruta.push(nombreDe(act)); act = delegadoDe(act, dom); }
      cadena = `<div class="cad">Cadena de delegación: ${ruta.map(esc).join(' → ')}<br>Tu voz termina en ${esc(ruta[ruta.length-1])}, que es quien ejerce el voto.</div>`;
    }
    return `<div class="dom">
      <div class="dh">
        <div><div class="dn">${esc(dom)}</div><div class="dd">${d ? `Delegado en <b>${esc(nombreDe(d))}</b>` : `Votas tú directamente${recibo ? ` y ejerces ${recibo} voto${recibo===1?'':'s'} delegado${recibo===1?'':'s'}` : ''}`}</div></div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <span class="dest">peso ${peso}</span>
          ${d ? `<button class="btn dan sm" onclick="revocar('${esc(dom)}')">Revocar</button>`
              : `<button class="btn sm" onclick="abrirDelegar('${esc(dom)}')">Delegar</button>`}
        </div>
      </div>
      ${cadena}
      <div id="sel-${dom}" style="display:none;margin-top:11px">
        <div class="linea">
          <label class="sr" for="who-${dom}">Delegar en</label>
          <select id="who-${dom}">${MIEMBROS.slice(0,12).map(m => `<option value="${m.id}">${esc(m.seudo)} · reputación ${m.rep}</option>`).join('')}</select>
          <button class="btn pri sm" onclick="confirmarDelegar('${esc(dom)}')">Confirmar</button>
        </div>
      </div>
    </div>`;
  }).join('');

  document.getElementById('delPeso').innerHTML = DAO.dominios.map(dom => {
    const p = pesoVoto('yo', dom);
    return `<div class="row"><span class="rl">${esc(dom)}</span><span class="rv ${p===0?'c-mal':p>1?'c-ok':''}">${p === 0 ? 'delegado · 0' : `${p} ${p===1?'voto':'votos'}`}</span></div>`;
  }).join('');

  const conc = DAO.dominios.map(dom => {
    const lista = [...MIEMBROS.map(m => m.id), 'yo']
      .map(id => ({ id, p:pesoVoto(id, dom) }))
      .sort((a,b) => b.p - a.p)[0];
    const pct = (lista.p - 1) / (MIEMBROS.length + 1) * 100;
    return `<div class="row"><span class="rl">${esc(dom)}<br><span class="mono" style="font-size:10.5px;color:var(--ink3)">${esc(nombreDe(lista.id))}</span></span><span class="rv ${pct > DAO.umbrales.topeDelegacion ? 'c-mal' : 'c-ok'}">${pct.toFixed(1)}%</span></div>`;
  }).join('');
  document.getElementById('delConc').innerHTML = conc +
    `<div class="row"><span class="rl" style="font-weight:600">Tope del reglamento</span><span class="rv c-sol">${DAO.umbrales.topeDelegacion}%</span></div>`;
}
function abrirDelegar(dom){
  const el = document.getElementById('sel-' + dom);
  el.style.display = el.style.display === 'none' ? '' : 'none';
}
function confirmarDelegar(dom){
  const id = document.getElementById('who-' + dom).value;
  ESTADO.delegaciones[dom] = id;
  acto('delegar', { dominio:dom, en:nombreDe(id) });
  guardar();
  toast(`Delegaste ${dom} en ${nombreDe(id)}. Puedes revocarlo al instante, sin dar explicaciones.`);
  pintarDelegacion();
}
function revocar(dom){
  const antes = ESTADO.delegaciones[dom];
  delete ESTADO.delegaciones[dom];
  acto('revocar', { dominio:dom, de:nombreDe(antes) });
  guardar();
  toast(`Delegación revocada: vuelves a votar ${dom} directamente`);
  pintarDelegacion();
}

/* ============================================================
   VISTA: REGLAMENTO
   ============================================================ */
function pintarReglamento(){
  document.getElementById('regUmbrales').innerHTML = [
    ['Aprobar una política ordinaria', `${DAO.umbrales.racimos} agrupamientos + ${DAO.umbrales.ordinaria}%`, 'c-azul'],
    ['Reformar un artículo del reglamento', `${DAO.umbrales.racimos} agrupamientos + ${DAO.umbrales.reforma}%`, 'c-sol'],
    ['Apoyos para que una propuesta pase a votación', `${DAO.umbrales.apoyoPropuesta} miembros de dos agrupamientos`, ''],
    ['Tope de delegaciones por miembro', `${DAO.umbrales.topeDelegacion}% del dominio`, ''],
    ['Artículos inmodificables', 'ninguno', 'c-ok']
  ].map(([l,v,c]) => `<div class="row"><span class="rl">${l}</span><span class="rv ${c}">${v}</span></div>`).join('');
  document.getElementById('regArts').innerHTML = ESTADO.reglamento.map(a => `
    <div class="art ${a.reforma ? 'reforma' : ''}">
      <div class="ah"><span class="an">Artículo ${a.n}</span><span class="pill ${a.reforma ? 'p-sol' : 'p-ok'}">${a.reforma ? 'Permite su propia reforma' : 'Vigente'}</span></div>
      <p class="at">${esc(a.t)}</p>
      <div class="af"><span class="am">${esc(a.r)}</span>
        <button class="btn sm" onclick="proponerReforma(${a.n})">Proponer reforma</button></div>
    </div>`).join('');
}
function proponerReforma(n){
  ir('propuesta');
  setTimeout(() => {
    document.getElementById('prTitulo').value = `Reforma del artículo ${n}`;
    document.getElementById('prCuerpo').value = `Texto propuesto para sustituir el artículo ${n}: `;
    document.getElementById('prTipo').value = 'reforma';
    document.getElementById('prCuerpo').focus();
    toast('Redacta el texto que sustituiría al artículo. Exige dos agrupamientos y el 66%.');
  }, 120);
}

/* ============================================================
   VISTA: BLOG
   ============================================================ */
function pintarBlog(){
  document.getElementById('blogLista').innerHTML = ESTADO.blog.map(p => `
    <div class="post">
      <h4>${esc(p.titulo)}</h4>
      <div class="pm"><span class="etq">${esc(p.etq)}</span><span>${esc(p.autor)}</span><span>${esc(p.fecha)}</span></div>
      <p class="pc">${esc(p.cuerpo)}</p>
    </div>`).join('');
  document.getElementById('blRecursos').innerHTML = ESTADO.recursos.map(r =>
    `<div class="rec"><span class="rt">${esc(r.t)}<small>${esc(r.d)}</small></span><button class="btn sm" onclick="toast('En el MVP los recursos son enlaces de ejemplo')">Abrir</button></div>`).join('');
}
function blPublicar(){
  const t = document.getElementById('blTitulo').value.trim();
  const c = document.getElementById('blCuerpo').value.trim();
  if (!t || !c) { toast('La entrada necesita título y contenido'); return; }
  const id = 'b' + Date.now();
  ESTADO.blog.unshift({ id, titulo:t, cuerpo:c, etq:document.getElementById('blEtiqueta').value, fecha:'ahora mismo', autor:ESTADO.seudo });
  document.getElementById('blTitulo').value = ''; document.getElementById('blCuerpo').value = '';
  acto('entrada', { id, titulo:t });
  guardar(); toast('Entrada publicada y sellada en tu cadena');
  pintarBlog();
}

/* ============================================================
   VISTA: MI CUENTA
   ============================================================ */
async function pintarYo(){
  const pesos = DAO.dominios.map(d => `${d}: ${pesoVoto('yo', d)}`).join(' · ');
  document.getElementById('yoIdent').innerHTML = `
    <div class="row"><span class="rl">Seudónimo</span><span class="rv">${esc(ESTADO.seudo)}</span></div>
    <div class="row"><span class="rl">Algoritmo</span><span class="rv">ECDSA · P-256 · SHA-256</span></div>
    <div class="row"><span class="rl">Clave privada</span><span class="rv c-ok">nunca sale de este dispositivo</span></div>
    <div class="row"><span class="rl">Acción social</span><span class="rv">1 · intransferible</span></div>
    <div class="row"><span class="rl">Peso por dominio</span><span class="rv">${esc(pesos)}</span></div>
    <span class="lbl" style="display:block;margin:12px 0 6px">Clave pública</span>
    <div class="cad" style="word-break:break-all">${PUBHEX || 'generando…'}</div>`;
  const m = await raizMerkle();
  document.getElementById('yoActos').innerHTML =
    `<div class="row"><span class="rl">Actos sellados</span><span class="rv num">${LEDGER.length}</span></div>
     <div class="row"><span class="rl">Raíz de Merkle</span><span class="rv">${m ? '0x'+m.slice(0,14)+'…' : '—'}</span></div>` +
    (LEDGER.length ? LEDGER.slice(-6).reverse().map(a =>
      `<div class="row"><span class="rl">#${a.i} · ${esc(ETIQ_ACTO[a.tipo] || a.tipo)}</span><span class="rv c-ok">firmado ✓</span></div>`).join('')
      : '<div class="vacio">Sin actos todavía.</div>');
}
async function verificarUI(){
  const o = document.getElementById('yoRes');
  o.textContent = 'Verificando…';
  const r = await verificarCadena();
  o.innerHTML = r.ok
    ? `<b class="c-ok">✓ Cadena íntegra.</b> ${r.n} actos: todos los hashes encadenan y todas las firmas verifican contra tu clave pública.`
    : `<b class="c-mal">✗ Ruptura en el acto #${r.i}</b> (${r.motivo}). El registro fue alterado después de firmarse.`;
}
async function exportarUI(){
  const data = { organizacion:DAO.nombre.replace(/<[^>]+>/g,''), formato:'cadena-de-actos/v1',
    exportado:new Date().toISOString(), clavePublica:PUBHEX, algoritmo:'ECDSA P-256 + SHA-256',
    raizMerkle: await raizMerkle(), actos:LEDGER };
  const texto = JSON.stringify(data, null, 2);
  let descargado = false;
  try {
    const b = new Blob([texto], {type:'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b); a.download = 'registro-firmado.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    descargado = true;
  } catch(e){ /* algunos visores bloquean la descarga */ }
  let copiado = false;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText){ await navigator.clipboard.writeText(texto); copiado = true; }
  } catch(e){ /* sin permiso de portapapeles */ }
  document.getElementById('yoRes').innerHTML =
    `<b class="c-ok">Registro firmado listo.</b> ${LEDGER.length} actos, raíz de Merkle 0x${(data.raizMerkle||'').slice(0,14)}…` +
    (copiado ? ' Copiado al portapapeles.' : '') +
    (descargado ? ' Descargado como <code>registro-firmado.json</code>.' : '') +
    `<br><span class="mono" style="font-size:11px;color:var(--ink3)">Cualquier auditor puede verificarlo sin esta aplicación: recomputa el hash de cada acto y valida la firma contra la clave pública.</span>`;
  toast(copiado || descargado ? 'Registro firmado exportado' : 'Registro listo: cópialo desde el panel de resultado');
}
let armado = false;
function borrarUI(btn){
  if (!armado){ armado = true; btn.textContent = '¿Seguro? Toca otra vez para borrar todo';
    setTimeout(() => { armado = false; btn.textContent = 'Borrar mis datos locales'; }, 4000); return; }
  ['mvpPriv','mvpPub','mvpLedger','mvpEstado'].forEach(k => store.del(k));
  location.reload();
}

/* ============================================================
   PERSISTENCIA Y ARRANQUE
   ============================================================ */
function guardar(){
  store.set('mvpEstado', JSON.stringify({
    misVotos:ESTADO.misVotos, misRespuestas:ESTADO.misRespuestas, misApoyos:ESTADO.misApoyos,
    misArgumentos:ESTADO.misArgumentos, duelos:ESTADO.duelos, delegaciones:ESTADO.delegaciones,
    afirmaciones:ESTADO.afirmaciones, consultas:ESTADO.consultas, propuestas:ESTADO.propuestas, blog:ESTADO.blog
  }));
}
function restaurar(){
  try {
    const s = JSON.parse(store.get('mvpEstado') || 'null');
    if (!s) return;
    Object.assign(ESTADO, s);
  } catch(e){ /* estado corrupto: se empieza limpio */ }
}

(async function arrancar(){
  iniciarDatos();
  restaurar();
  document.getElementById('daoNombre').innerHTML = DAO.nombre;
  document.getElementById('daoLema').textContent = DAO.lema;
  document.getElementById('chipSeudo').textContent = ESTADO.seudo;
  try { await idInit(); } catch(e){ /* sin WebCrypto la app funciona sin sellado */ }
  try { const l = store.get('mvpLedger'); if (l) LEDGER = JSON.parse(l); } catch(e){ LEDGER = []; }
  if (PRIV && !LEDGER.length) await _acto('genesis', { organizacion:DAO.nombre.replace(/<[^>]+>/g,''), accion:1, voto:1 });
  ESTADO.seudo = '@tú';
  document.getElementById('chipPeso').textContent = `${LEDGER.length} actos firmados`;
  calcularAgrupamientos();
  pintarTabs();
  const h = (location.hash || '#panel').slice(1);
  ir(h, true);
  addEventListener('hashchange', () => ir(location.hash.slice(1), true));
})();
