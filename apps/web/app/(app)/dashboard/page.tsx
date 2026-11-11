import type { Metadata } from 'next';
import { Suspense } from 'react';
import { serverFetch } from '@/lib/api';
import { comunidadPrincipal, contarEleccionesEnCurso, pasoQueToca, type Cifras as CifrasDatos } from '@/lib/inicio';
import Bienvenida from '@/components/inicio/Bienvenida';
import Cifras from '@/components/inicio/Cifras';
import PasosMesa from '@/components/inicio/PasosMesa';
import TarjetaGuardian from '@/components/inicio/TarjetaGuardian';
import MapaComunidad from '@/components/inicio/MapaComunidad';
import type {
  AuthResponse,
  EleccionResumen,
  GroupDetail,
  GroupListResponse,
  InquietudSummary,
  VerificationStatus,
} from '@decide/shared';

export const metadata: Metadata = { title: 'Inicio' };

/** Una llamada que falla (red o estado no 2xx) devuelve null: la cifra se omite, no se inventa. */
async function leer<T>(ruta: string): Promise<T | null> {
  try {
    const res = await serverFetch(ruta);
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

export default async function DashboardPage() {
  // Quien aún no está verificado ve su estado de verificación en lugar de la mesa de la comunidad.
  const vRes = await serverFetch('/api/verifications/me');
  const verif = vRes.ok ? ((await vRes.json()) as VerificationStatus) : null;
  if (verif && verif.status === 'pending_verification') {
    return (
      <div className="inicio inicio-verificacion">
        <h1 className="inicio-h1 fade-up d1">Tu verificación</h1>
        <p className="inicio-lead fade-up d2">
          Para participar necesitas dos confirmaciones: la de quien te invitó y la del administrador u otro
          miembro de tu territorio o de tu comunidad de acogida.
        </p>

        <div className="inicio-seccion-cab fade-up d3">
          <h2 className="inicio-h2">Confirmaciones</h2>
          <span className="inicio-seccion-sub">{verif.references.length} de 2</span>
        </div>

        <div className="card fade-up d4">
          <p className="card-title">{verif.references.length} de 2 confirmaciones</p>
          {verif.references.map((r) => (
            <div key={r.kind} className="alert alert-success">
              ✓ {r.kind === 'invitador' ? 'Quien te invitó' : 'Segunda referencia'}: {r.displayName}
            </div>
          ))}
          {verif.missing.map((k) => (
            <div key={k} className="alert alert-warning">
              … Falta: {k === 'invitador' ? 'quien te invitó' : 'una segunda referencia'}
            </div>
          ))}
        </div>
      </div>
    );
  }

  const [groupsData, me] = await Promise.all([
    leer<GroupListResponse>('/api/groups'),
    leer<AuthResponse>('/api/auth/me'),
  ]);
  const groups = groupsData?.groups ?? [];
  const principal = comunidadPrincipal(groups);

  // Las cifras de la comunidad principal, en paralelo; cada fallo deja null.
  const [detalle, inquietudes, elecciones] = principal
    ? await Promise.all([
        leer<GroupDetail>(`/api/groups/${principal.id}`),
        leer<InquietudSummary[]>(`/api/inquietudes?groupId=${principal.id}`),
        leer<EleccionResumen[]>('/api/elecciones'),
      ])
    : [null, null, null];

  const cifras: CifrasDatos = principal
    ? {
        miembros: detalle?.memberCount ?? null,
        activada: detalle?.activated ?? null,
        preguntas: inquietudes ? inquietudes.filter((i) => !i.hidden).length : null,
        elecciones: elecciones ? contarEleccionesEnCurso(elecciones, principal.id) : null,
      }
    : { miembros: null, preguntas: null, elecciones: null, activada: null };

  // Sin comunidad principal el primer paso es sumar gente; si no, lo decide la regla de pasoQueToca.
  const paso = principal ? pasoQueToca(cifras) : 1;
  const nombre = me?.user.displayName?.split(' ')[0] ?? null;
  const puedeInvitar = me?.user.status === 'verified_citizen';

  return (
    <div className="inicio">
      <Bienvenida nombre={nombre} comunidad={principal?.name ?? null} preguntas={cifras.preguntas}>
        <Cifras cifras={cifras} />
      </Bienvenida>

      <PasosMesa paso={paso} puedeInvitar={puedeInvitar} />

      <div className="inicio-rejilla">
        <div className="inicio-guardian fade-up d6">
          <Suspense fallback={null}>
            <TarjetaGuardian groupId={principal?.id} />
          </Suspense>
        </div>
        <div className="inicio-mapa fade-up d7">
          <MapaComunidad groups={groupsData ? groups : null} />
        </div>
      </div>
    </div>
  );
}
