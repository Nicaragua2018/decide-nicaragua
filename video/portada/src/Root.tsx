// Composición «Colmena»: 1080×1080, 30 fps, 35 s. Cinco escenas, Honey, los textos
// (tercio superior), el aviso de IA y la música con fundido de entrada y de salida.
import React from 'react';
import { AbsoluteFill, Audio, Composition, interpolate, Sequence, staticFile } from 'remotion';
import { ESCENAS } from '../../../apps/web/app/portada/textos-video';
import { Dispersos } from './escenas/Dispersos';
import { Multiplica } from './escenas/Multiplica';
import { Renace } from './escenas/Renace';
import { Republica } from './escenas/Republica';
import { Ruido } from './escenas/Ruido';
import { Honey } from './Honey';
import { ALTO, ANCHO, COLORES } from './Panal';
import { DURACION, ESCENA, FPS, FUNDIDO } from './tiempos';
import { INTER, Titular } from './Titular';

const texto = (id: (typeof ESCENAS)[number]['id']) => {
  const e = ESCENAS.find((x) => x.id === id);
  if (!e) throw new Error(`Falta el texto de la escena ${id}`);
  return e.texto;
};

/** Palabras que van en azul bandera en cada frase. */
const DESTACAR: Record<(typeof ESCENAS)[number]['id'], string[]> = {
  dispersos: ['miles'],
  ruido: ['confiar'],
  renace: ['renace'],
  multiplica: ['multiplica'],
  republica: ['república'],
};

const largo = (e: { desde: number; hasta: number }) => e.hasta - e.desde;

export const Colmena: React.FC = () => {
  const { dispersos, ruido, renace, multiplica, republica } = ESCENA;
  return (
    <AbsoluteFill style={{ background: COLORES.blanco }}>
      {/* franjas de la bandera, suaves, arriba y abajo */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 18, background: COLORES.azulPastel }} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 18, background: COLORES.azulPastel }} />

      <Sequence from={dispersos.desde} durationInFrames={largo(dispersos) + FUNDIDO} name="1 Dispersos">
        <Dispersos duracion={largo(dispersos) + FUNDIDO} />
      </Sequence>
      <Sequence from={ruido.desde} durationInFrames={largo(ruido) + FUNDIDO} name="2 Ruido">
        <Ruido duracion={largo(ruido) + FUNDIDO} />
      </Sequence>
      <Sequence from={renace.desde} durationInFrames={largo(renace)} name="3 Renace">
        <Renace desde={renace.desde} />
      </Sequence>
      <Sequence from={multiplica.desde} durationInFrames={largo(multiplica)} name="4 Multiplica">
        <Multiplica desde={multiplica.desde} />
      </Sequence>
      <Sequence from={republica.desde} durationInFrames={largo(republica)} name="5 República">
        <Republica />
      </Sequence>

      <Honey />

      {(['dispersos', 'ruido', 'renace', 'multiplica', 'republica'] as const).map((id) => (
        <Sequence key={id} from={ESCENA[id].desde} durationInFrames={largo(ESCENA[id])} name={`texto ${id}`}>
          <Titular texto={texto(id)} destacar={DESTACAR[id]} duracion={largo(ESCENA[id])} salir={id !== 'republica'} />
        </Sequence>
      ))}

      {/* Renacer se ve en todo el video: el aviso de IA queda siempre, en pequeño */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 30,
          textAlign: 'center',
          fontFamily: INTER,
          fontWeight: 400,
          fontSize: 22,
          letterSpacing: '0.01em',
          color: COLORES.textoSecundario,
        }}
      >
        Imagen ilustrativa creada con IA
      </div>

      <Audio
        src={staticFile('musica.mp3')}
        volume={(f) =>
          interpolate(f, [0, 45, DURACION - 75, DURACION - 1], [0, 0.8, 0.8, 0], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          })
        }
      />
    </AbsoluteFill>
  );
};

export const RemotionRoot: React.FC = () => (
  <Composition id="Colmena" component={Colmena} durationInFrames={DURACION} fps={FPS} width={ANCHO} height={ALTO} />
);
