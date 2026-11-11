import Link from 'next/link';
import type { Metadata } from 'next';
import type { EleccionDetalle } from '@decide/shared';
import { serverFetch } from '@/lib/api';
import { LineaDeTiempo } from '@/components/elecciones/LineaDeTiempo';
import { FichaCandidatura } from '@/components/elecciones/FichaCandidatura';
import { PapeletaEleccion } from '@/components/elecciones/PapeletaEleccion';
import { ResultadoEleccion } from '@/components/elecciones/ResultadoEleccion';
import { cuentaAtras, fechaLarga, puestosTexto, tituloEleccion } from '@/components/elecciones/textos';
import { CandidaturaForm } from './CandidaturaForm';
import { MiCandidatura, OcultarFicha } from './Acciones';

export const metadata: Metadata = { title: 'Elección' };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EleccionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return <p className="empty-state">Elección no encontrada.</p>;

  const [res, mesaRes] = await Promise.all([serverFetch(`/api/elecciones/${id}`), serverFetch('/api/board/me')]);
  if (res.status === 403) {
    return (
      <div className="el-pagina">
        <p className="alert alert-info">Esta elección es de otra comunidad: solo votan y se presentan sus miembros.</p>
        <Link href="/elecciones">Volver a las elecciones</Link>
      </div>
    );
  }
  if (!res.ok) return <p className="empty-state">Elección no encontrada.</p>;
  const e = (await res.json()) as EleccionDetalle;
  const enMesa = mesaRes.ok ? ((await mesaRes.json()) as { role: string | null }).role !== null : false;

  const ahora = Date.now();
  const cuenta = cuentaAtras(e, ahora);
  const abierta = e.fase !== 'contada';
  // La ficha propia ya sale arriba («Tu ficha»): en la lista solo las de las demás personas.
  const otras = e.candidaturas.filter((c) => !c.esMia);

  return (
    <div className="el-pagina">
      <p className="mb-3">
        <Link href="/elecciones">← Elecciones</Link>
      </p>
      <header className="el-tarjeta">
        <p className="el-etiqueta">{puestosTexto(e.puestos)}</p>
        <h1 className="el-tarjeta-titulo">{tituloEleccion(e)}</h1>
        <LineaDeTiempo fase={e.fase} candidaturasEndsAt={e.candidaturasEndsAt} votacionEndsAt={e.votacionEndsAt} />
        {cuenta && <p className="el-cuenta">{cuenta}</p>}
        {e.fase === 'candidaturas' && (
          <p className="el-nota">La votación empieza al cerrar las candidaturas y dura hasta el {fechaLarga(e.votacionEndsAt)}.</p>
        )}
        {e.fase === 'votacion' && e.participacionAprox !== null && (
          <p className="el-nota">
            {e.participacionAprox === 0 ? 'Todavía nadie ha votado.' : `Ya votaron unas ${e.participacionAprox} personas.`}
          </p>
        )}
      </header>

      {e.miCandidatura && (
        <MiCandidatura
          eleccionId={e.id}
          ficha={e.miCandidatura.ficha}
          oculta={e.miCandidatura.oculta}
          aviso={e.miCandidatura.aviso}
          enCandidaturas={e.fase === 'candidaturas'}
        />
      )}

      {e.fase === 'candidaturas' && e.puedoPresentarme && !e.miCandidatura && (
        <section className="el-bloque" aria-labelledby="presentarme">
          <h2 id="presentarme" className="el-h2">Presentarme</h2>
          <p className="el-nota mb-3">
            Escribe tu ficha. Todas las fichas son iguales: presentación, hasta 3 compromisos y tus comunidades.
          </p>
          <CandidaturaForm eleccionId={e.id} />
        </section>
      )}

      {e.fase === 'candidaturas' && !e.puedoPresentarme && !e.miCandidatura && (
        <p className="el-nota mt-2">
          No puedes presentarte a esta elección: por ejemplo, porque ya ocupas otro cargo o te presentaste a otra elección abierta.
        </p>
      )}

      {e.fase === 'candidaturas' && (
        <section className="el-bloque" aria-labelledby="candidaturas-titulo">
          <h2 id="candidaturas-titulo" className="el-h2">Candidaturas</h2>
          {otras.length === 0 ? (
            <p className="el-nota">{e.miCandidatura ? 'Nadie más se ha presentado todavía.' : 'Todavía nadie se ha presentado.'}</p>
          ) : (
            <>
              <p className="el-nota mb-3">Las fichas salen en un orden al azar distinto para cada persona.</p>
              <ul className="el-fichas">
                {otras.map((c) => (
                  <li key={c.id}>
                    <FichaCandidatura ficha={c}>{enMesa && <OcultarFicha eleccionId={e.id} ficha={c} />}</FichaCandidatura>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {e.fase === 'votacion' && (
        <PapeletaEleccion key={JSON.stringify(e.miPapeleta)} eleccionId={e.id} fichas={e.candidaturas} miPapeleta={e.miPapeleta} />
      )}

      {e.fase === 'votacion' && enMesa && otras.length > 0 && (
        <details className="el-bloque el-verificar">
          <summary>Para la mesa: ocultar una ficha</summary>
          <ul className="el-fichas mt-2">
            {otras.map((c) => (
              <li key={c.id}>
                <p className="font-medium">{c.nombre}</p>
                <OcultarFicha eleccionId={e.id} ficha={c} />
              </li>
            ))}
          </ul>
        </details>
      )}

      {e.fase === 'contada' && e.resultado && <ResultadoEleccion resultado={e.resultado} eleccionId={e.id} />}
      {e.fase === 'contada' && !e.resultado && <p className="el-nota">El resultado todavía no está listo.</p>}

      {!abierta && (
        <p className="mt-4">
          <Link href="/representantes">Quiénes nos representan</Link>
        </p>
      )}
    </div>
  );
}
