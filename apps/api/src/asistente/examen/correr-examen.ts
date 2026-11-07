/**
 * Examen del asistente contra el servicio real de Claude.
 *
 * Uso (en el servidor, desde la raíz del repositorio):
 *   ASISTENTE_ACTIVO=true pnpm --filter @decide/api asistente:examen
 *
 * - Lee ANTHROPIC_API_KEY y DATABASE_URL de apps/api/.env (o .env.local). Nunca imprime la clave.
 * - ASISTENTE_ACTIVO=true se pasa solo para esta corrida: no hace falta cambiar el .env.
 *   El asistente sigue apagado en la plataforma hasta que el examen apruebe completo.
 * - Usa el ModeracionPreviaService real (y por tanto la puerta única, el tope de gasto y
 *   la limpieza del texto). El gasto de la corrida se suma al del mes.
 * - No usa la caché de Redis: cada corrida pregunta al modelo de nuevo.
 * - Corre dos partes: la moderación previa y el panel de preguntas (PanelService real, con material inventado).
 * - Termina con código 1 si falla cualquier caso de cualquiera de las dos.
 */
import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { EmailService } from '../../email/email.service';
import type { RedisService } from '../../redis/redis.service';
import { AsistenteService } from '../asistente.service';
import { ModeracionPreviaService } from '../moderacion-previa.service';
import { PanelService } from '../panel.service';
import { CATEGORIAS, CATEGORIAS_PANEL, cargarCasos, cargarCasosPanel, evaluarCaso, evaluarCasoPanel } from './evaluar';

/** Mismo orden que ConfigModule: .env.local primero; lo que ya está en el entorno gana. */
function cargarEntorno(): void {
  for (const archivo of ['.env.local', '.env']) {
    const ruta = join(process.cwd(), archivo);
    if (existsSync(ruta)) process.loadEnvFile(ruta);
  }
}

/** Sin caché: get nunca encuentra nada y set no guarda. */
const SIN_CACHE = {
  get: async (): Promise<string | null> => null,
  set: async (): Promise<'OK'> => 'OK',
} as unknown as RedisService;

function crearEmail(config: ConfigService): EmailService {
  try {
    return new EmailService(config);
  } catch {
    // Sin Resend configurado: el aviso del tope solo queda en la auditoría.
    return { sendAvisoTopeAsistente: async () => undefined } as unknown as EmailService;
  }
}

async function main(): Promise<number> {
  cargarEntorno();

  if (!process.env['ANTHROPIC_API_KEY']) {
    console.error('Examen pendiente: falta ANTHROPIC_API_KEY en el .env del servidor. No se corrió ningún caso.');
    return 1;
  }
  if (process.env['ASISTENTE_ACTIVO'] !== 'true') {
    console.error(
      'El examen necesita ASISTENTE_ACTIVO=true solo para esta corrida:\n' +
        '  ASISTENTE_ACTIVO=true pnpm --filter @decide/api asistente:examen\n' +
        'No cambies el .env: el asistente sigue apagado hasta aprobar el examen.',
    );
    return 1;
  }

  const casos = cargarCasos();
  const config = new ConfigService();
  const prisma = new PrismaService();
  await prisma.$connect();
  try {
    const cliente = new Anthropic({ apiKey: process.env['ANTHROPIC_API_KEY'] });
    const asistente = new AsistenteService(prisma, config, new AuditService(prisma, config), crearEmail(config), cliente);
    const moderacion = new ModeracionPreviaService(asistente, SIN_CACHE);

    const aprobados = new Map<string, number>();
    const totales = new Map<string, number>();
    const fallos: string[] = [];
    let sinRespuesta = 0;

    for (const caso of casos) {
      const revision = await moderacion.revisar(caso.texto, caso.tipo);
      const fallo = evaluarCaso(caso, revision);
      totales.set(caso.categoria, (totales.get(caso.categoria) ?? 0) + 1);
      if (fallo === null) {
        aprobados.set(caso.categoria, (aprobados.get(caso.categoria) ?? 0) + 1);
      } else {
        if (!revision.revisado) sinRespuesta++;
        fallos.push(`- ${caso.id} (${caso.categoria}): ${fallo}`);
      }
    }

    console.log('\nExamen del asistente (moderación): aprobados / total por categoría');
    for (const categoria of CATEGORIAS) {
      console.log(`  ${categoria}: ${aprobados.get(categoria) ?? 0} / ${totales.get(categoria) ?? 0}`);
    }
    const total = casos.length;
    console.log(`  TOTAL: ${total - fallos.length} / ${total}`);

    // Panel: solo se usa responderConMaterial; el resto de sus dependencias no se toca.
    const nunca = {} as never;
    const panel = new PanelService(asistente, nunca, nunca, nunca);
    const casosPanel = cargarCasosPanel();
    const aprobadosPanel = new Map<string, number>();
    const totalesPanel = new Map<string, number>();
    const fallosPanel: string[] = [];
    let sinRespuestaPanel = 0;

    for (const caso of casosPanel) {
      const refs = new Map(
        Object.entries(caso.refs ?? {}).map(([ref, ruta]) => [ref, { texto: 'Ver en la plataforma', ruta }]),
      );
      const { salida } = await panel.responderConMaterial(caso.contexto, refs, [...(caso.turnos ?? []), { rol: 'persona', texto: caso.pregunta }]);
      const fallo = evaluarCasoPanel(caso, salida);
      totalesPanel.set(caso.categoria, (totalesPanel.get(caso.categoria) ?? 0) + 1);
      if (fallo === null) {
        aprobadosPanel.set(caso.categoria, (aprobadosPanel.get(caso.categoria) ?? 0) + 1);
      } else {
        if (!salida) sinRespuestaPanel++;
        fallosPanel.push(`- ${caso.id} (${caso.categoria}): ${fallo}`);
      }
    }

    console.log('\nExamen del asistente (panel): aprobados / total por categoría');
    for (const categoria of CATEGORIAS_PANEL) {
      console.log(`  ${categoria}: ${aprobadosPanel.get(categoria) ?? 0} / ${totalesPanel.get(categoria) ?? 0}`);
    }
    const totalPanel = casosPanel.length;
    console.log(`  TOTAL: ${totalPanel - fallosPanel.length} / ${totalPanel}`);

    const todosLosFallos = [...fallos, ...fallosPanel];
    if (todosLosFallos.length > 0) {
      console.log('\nFallos:');
      for (const f of todosLosFallos) console.log(f);
      const sinRespuestaTotal = sinRespuesta + sinRespuestaPanel;
      if (sinRespuestaTotal > 0) {
        console.log(
          `\n${sinRespuestaTotal} caso(s) sin respuesta: revisá la conexión, la base de datos (gasto del mes) y el tope de gasto.`,
        );
      }
      console.log('\nEl examen NO aprobó: el asistente debe seguir apagado.');
      return 1;
    }
    console.log('\nEl examen aprobó completo.');
    return 0;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().then(
    (codigo) => process.exit(codigo),
    (err: unknown) => {
      console.error('El examen no pudo correr:', err instanceof Error ? err.message : 'error');
      process.exit(1);
    },
  );
}
