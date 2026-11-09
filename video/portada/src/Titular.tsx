// Texto de cada escena: ocupa el tercio superior y entra palabra por palabra.
import React from 'react';
import { Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { loadFont as cargarFraunces } from '@remotion/google-fonts/Fraunces';
import { loadFont as cargarInter } from '@remotion/google-fonts/Inter';
import { COLORES } from './Panal';

export const { fontFamily: FRAUNCES } = cargarFraunces('normal', { weights: ['600'], subsets: ['latin'] });
export const { fontFamily: INTER } = cargarInter('normal', { weights: ['400', '600'], subsets: ['latin'] });

/**
 * @param texto      frase de ESCENAS
 * @param destacar   palabras que van en azul bandera
 * @param duracion   cuadros de la escena (para salir al final)
 * @param salir      si es false el texto queda fijo hasta el último cuadro
 */
export const Titular: React.FC<{ texto: string; destacar?: string[]; duracion: number; salir?: boolean }> = ({
  texto,
  destacar = [],
  duracion,
  salir = true,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const palabras = texto.split(' ');
  const limpia = (p: string) => p.replace(/[.,:;!¡¿?]/g, '').toLowerCase();
  const azules = new Set(destacar.map((d) => d.toLowerCase()));

  const salida = salir
    ? interpolate(frame, [duracion - 16, duracion - 2], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
        easing: Easing.in(Easing.cubic),
      })
    : 0;

  return (
    <div
      style={{
        position: 'absolute',
        left: 80,
        right: 80,
        top: 70,
        height: 290,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: 1 - salida,
        transform: `translateY(${-18 * salida}px)`,
      }}
    >
      <p
        style={{
          margin: 0,
          fontFamily: FRAUNCES,
          fontWeight: 600,
          fontSize: 64,
          lineHeight: 1.14,
          letterSpacing: '-0.01em',
          color: COLORES.texto,
          textAlign: 'center',
          textWrap: 'balance',
        }}
      >
        {palabras.map((p, i) => {
          const s = spring({ frame: frame - 6 - i * 3, fps, config: { damping: 200, mass: 0.7 } });
          return (
            <span
              key={i}
              style={{
                display: 'inline-block',
                marginRight: i < palabras.length - 1 ? '0.26em' : 0,
                opacity: s,
                transform: `translateY(${(1 - s) * 34}px)`,
              }}
            >
              {azules.has(limpia(p)) ? (
                <>
                  <span style={{ color: COLORES.azulBandera }}>{p.replace(/[.,:;!?]+$/, '')}</span>
                  {p.match(/[.,:;!?]+$/)?.[0]}
                </>
              ) : (
                p
              )}
            </span>
          );
        })}
      </p>
    </div>
  );
};
