import Link from 'next/link';
import type { Metadata } from 'next';
import { serverFetch } from '@/lib/api';
import { MODERACION_CAUSAS } from '@decide/shared';
import type { BifurcacionView, ComisionView, GrupoTrabajoDetail } from '@decide/shared';
import { ModerarForm } from '@/components/ModerarForm';
import { estadoGrupo, lineaGrupo } from '../GrupoCard';
import { EntrarSalir } from './EntrarSalir';
import { ApelarForm, PausarForm, PedirComisionButton, VolverALaColmena } from './BifurcacionForms';
import {
  AjustarForm,
  InformeForm,
  OfrecerseForm,
  PapeletaForm,
  RenovacionButton,
  SorteoVerificable,
} from './ComisionForms';

export const metadata: Metadata = { title: 'Grupo de trabajo — Decide Nicaragua' };

const DIA_MS = 86_400_000;

function fecha(iso: string): string {
  return new Date(iso).toLocaleDateString('es-NI');
}

function Comision({ g, c }: { g: GrupoTrabajoDetail; c: ComisionView }) {
  const convocando = g.estado === 'convocando';
  const eligiendo = g.estado === 'eligiendo';
  const activa = g.estado === 'activo';
  const proximo = c.proximoInformeAt ? new Date(c.proximoInformeAt).getTime() : null;
  const tocaPronto = activa && !c.atrasada && proximo !== null && proximo - Date.now() <= 3 * DIA_MS;

  return (
    <>
      <div className="card mb-4">
        <p className="card-title">Esta comisión llevará a cabo: {c.tarea}</p>
        <p className="card-meta">
          Puestos: {c.puestos} · Forma: {c.forma === 'sorteo' ? 'sorteo' : 'votación por preferencias'}
        </p>
        {c.origen && (
          <p className="card-meta">
            Nace de la solución «{c.origen.solucionTitulo}» (<Link href={`/proposals/${c.origen.proposalId}`}>ver el tema</Link>)
          </p>
        )}
        {c.puedoAjustar && <AjustarForm grupoId={g.id} tarea={c.tarea} puestos={c.puestos} />}
      </div>

      {(convocando || eligiendo) && (
        <div className="card mb-4">
          <p className="card-title">Voluntarios ({c.voluntarios.length})</p>
          {c.voluntarios.length === 0 ? (
            <p className="card-meta">Todavía nadie se ha ofrecido.</p>
          ) : (
            <ul className="mt-2">
              {c.voluntarios.map((v, i) => (
                <li key={v.id ?? i} className="mt-1">
                  <strong>{v.nombre}</strong>
                  {v.experiencia && <span className="card-meta"> · {v.experiencia}</span>}
                </li>
              ))}
            </ul>
          )}
          {convocando && <OfrecerseForm grupoId={g.id} yoVoluntario={c.yoVoluntario} />}
        </div>
      )}

      {eligiendo && c.forma === 'preferencias' && (
        <div className="card mb-4">
          {c.eleccionEndsAt && <p className="card-meta">Puedes cambiar tu papeleta hasta el {fecha(c.eleccionEndsAt)}</p>}
          <PapeletaForm key={JSON.stringify(c.miPapeleta)} grupoId={g.id} voluntarios={c.voluntarios} miPapeleta={c.miPapeleta} />
        </div>
      )}

      {(activa || g.estado === 'cerrado') && (
        <div className="card mb-4">
          <p className="card-title">Miembros ({g.miembros})</p>
          {g.miembrosNombres.length > 0 && <ul className="mt-2">{g.miembrosNombres.map((n, i) => <li key={i}>{n}</li>)}</ul>}

          {activa && c.proximoInformeAt && (
            <p className="card-meta mt-2">Próximo informe antes del {fecha(c.proximoInformeAt)}</p>
          )}
          {tocaPronto && <p className="alert alert-warning mt-2">Toca informar pronto</p>}
          {c.atrasada && (
            <>
              <p className="alert alert-warning mt-2">Esta comisión no ha informado a tiempo</p>
              {(c.puedoApoyarRenovar || c.yoApoyoRenovar) && <RenovacionButton grupoId={g.id} yoApoyo={c.yoApoyoRenovar} />}
            </>
          )}
          {c.puedoInformar && <InformeForm grupoId={g.id} />}
        </div>
      )}

      {c.informes.length > 0 && (
        <div className="card mb-4">
          <p className="card-title">Informes</p>
          {c.informes.map((i) => (
            <div key={i.id} className="comment-thread">
              <p className="card-meta">
                {fecha(i.createdAt)}
                {i.final && <> · <strong>Informe final</strong></>}
              </p>
              {i.oculto ? (
                <p className="text-sm text-muted">Informe ocultado por moderación</p>
              ) : (
                <>
                  <p className="comment-body" style={{ whiteSpace: 'pre-wrap' }}>{i.texto}</p>
                  <ModerarForm target="informe" targetId={i.id} grupoId={g.id} colapsable className="comment-reply-form" />
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {c.seleccion && <SorteoVerificable grupoId={g.id} semilla={c.seleccion.semilla} pool={c.seleccion.pool} />}
    </>
  );
}

function Bifurcacion({ g, b }: { g: GrupoTrabajoDetail; b: BifurcacionView }) {
  return (
    <>
      <div className="card mb-4">
        <p className="card-title">Iniciativa de un grupo: {b.solucionTitulo}</p>
        <p className="card-meta">{g.miembros} {g.miembros === 1 ? 'persona' : 'personas'}</p>
        {b.proposalId && (
          <p className="card-meta"><Link href={`/proposals/${b.proposalId}`}>Ver el tema de origen</Link></p>
        )}
      </div>

      {b.pausa && (
        <div className="card mb-4">
          <p className="alert alert-warning">
            Pausada: {MODERACION_CAUSAS.find((c) => c.value === b.pausa?.causa)?.label ?? b.pausa.causa}
          </p>
          {b.pausa.detalle && <p className="mt-2">{b.pausa.detalle}</p>}
          {b.pausa.apelada && <p className="card-meta mt-2">Ya se apeló; la mesa lo revisará.</p>}
          {b.puedoApelar && <ApelarForm grupoId={g.id} />}
        </div>
      )}

      {g.soyMiembro && g.estado === 'activo' && (
        <div className="card mb-4">
          {g.forumId && <Link href={`/foros/${g.forumId}`} className="btn btn-primary btn-sm">Ir al foro del grupo</Link>}
          {b.yaLlevada ? (
            <p className="text-xs text-muted mt-2">Ya se llevó a la comunidad</p>
          ) : (
            <VolverALaColmena grupoId={g.id} solucionId={b.solucionId} />
          )}
          {b.comisionId && (
            <p className="mt-2"><Link href={`/grupos/${b.comisionId}`}>Ver la comisión de esta iniciativa</Link></p>
          )}
          {b.puedoPedirComision && <PedirComisionButton grupoId={g.id} />}
        </div>
      )}

      {b.puedoPausar && <PausarForm grupoId={g.id} />}
    </>
  );
}

export default async function GrupoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await serverFetch(`/api/grupos/${id}`);
  if (!res.ok) return <p className="empty-state">Grupo no encontrado.</p>;
  const g = (await res.json()) as GrupoTrabajoDetail;
  const esSubgrupo = g.comision === null && g.bifurcacion === null;

  return (
    <>
      <div className="page-header">
        <Link href="/grupos" className="text-sm text-muted">← Grupos de trabajo</Link>
        <div className="flex justify-between items-center mt-2">
          <h1 className="page-title">{g.name}</h1>
          <span className="badge badge-open">{estadoGrupo(g)}</span>
        </div>
        <p className="card-meta">{g.ambito.name} · {lineaGrupo(g)}</p>
      </div>

      {!g.soyMiembro && esSubgrupo && (
        <p className="alert alert-warning mb-4">Puedes leer todo; para participar, únete al grupo</p>
      )}

      {esSubgrupo && (
        <>
          <div className="card mb-4">
            <p className="card-title">Propósito</p>
            <p className="mt-2" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.75 }}>{g.proposito}</p>
          </div>

          <div className="card mb-4">
            <p className="card-title">Miembros ({g.miembros})</p>
            {g.miembrosNombres.length > 0 && (
              <ul className="mt-2">
                {g.miembrosNombres.map((n, i) => <li key={i}>{n}</li>)}
              </ul>
            )}
          </div>
        </>
      )}

      {g.comision && <Comision g={g} c={g.comision} />}
      {g.bifurcacion && <Bifurcacion g={g} b={g.bifurcacion} />}

      <div className="flex gap-2 flex-wrap items-center">
        {g.puedoEntrar && <EntrarSalir grupoId={g.id} accion="entrar" small={false} />}
        {g.puedoSalir && <EntrarSalir grupoId={g.id} accion="salir" small={false} />}
        {g.bifurcacion === null && g.estado === 'activo' && g.forumId && (
          <Link href={`/foros/${g.forumId}`} className="btn btn-primary">Ir al foro del grupo</Link>
        )}
      </div>
    </>
  );
}
