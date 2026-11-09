'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { ESCENAS } from './textos-video';
import styles from './portada.module.css';

const POSTER = '/portada/colmena-final.webp';
const WEBM = '/portada/colmena.webm';
const MP4 = '/portada/colmena.mp4';
const ALT_FIJA =
  'Panal de fotos de Nicaragua: volcanes, la Catedral de Granada, un guardabarranco, ' +
  'un sacuanjoche, el Güegüense y la bandera, con la imagen de Renacer en el centro y ' +
  'Honey, la abeja, a un lado. Arriba dice: «Una República para todos: una colmena ' +
  'democrática y cooperativa».';

export function VideoColmena() {
  const idTextos = useId();
  const videoRef = useRef<HTMLVideoElement>(null);
  // null mientras no sabemos la preferencia (el CSS cubre ese momento).
  const [reducir, setReducir] = useState<boolean | null>(null);
  const [silenciado, setSilenciado] = useState(true);
  const [pausado, setPausado] = useState(false);
  // Si ningún archivo de video carga, queda la imagen fija y sobran los botones.
  const [sinVideo, setSinVideo] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducir(mq.matches);
    const alCambiar = (e: MediaQueryListEvent) => setReducir(e.matches);
    mq.addEventListener('change', alCambiar);
    return () => mq.removeEventListener('change', alCambiar);
  }, []);

  useEffect(() => {
    if (reducir !== false) return;
    const v = videoRef.current;
    if (!v) return;
    // Si ningún <source> carga (también antes de hidratar), se queda la imagen fija.
    const ultima = v.querySelector('source:last-of-type');
    const alFallar = () => setSinVideo(true);
    ultima?.addEventListener('error', alFallar);
    if (v.networkState === HTMLMediaElement.NETWORK_NO_SOURCE) setSinVideo(true);
    // Algunos equipos fallan al decodificar WebM (VP9 por hardware): se pasa al MP4.
    const alFallarDecodificacion = () => {
      if (v.currentSrc.endsWith('.webm')) {
        v.src = MP4;
        v.load();
        v.play().catch(() => setPausado(v.paused));
      } else {
        setSinVideo(true);
      }
    };
    v.addEventListener('error', alFallarDecodificacion);
    if (v.error) alFallarDecodificacion(); // falló antes de hidratar
    // Asegura que arranque sin sonido aunque el atributo no llegue del servidor.
    v.muted = true;
    setSilenciado(true);
    // Si el navegador bloquea el autoplay, el video queda en pausa y se ve la imagen fija.
    v.play().then(
      () => setPausado(false),
      () => setPausado(v.paused),
    );
    return () => {
      ultima?.removeEventListener('error', alFallar);
      v.removeEventListener('error', alFallarDecodificacion);
    };
  }, [reducir]);

  function alternarSonido() {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setSilenciado(v.muted);
  }

  function alternarPausa() {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play().catch(() => setPausado(true));
    } else {
      v.pause();
    }
  }

  const textos = (
    <ol id={idTextos} className="sr-only" aria-label="Textos que aparecen en el video">
      {ESCENAS.map((e) => (
        <li key={e.id}>{e.texto}</li>
      ))}
    </ol>
  );

  if (reducir) {
    return (
      <div className={styles.videoBloque}>
        <div className={styles.marco}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={styles.fijaSiempre} src={POSTER} alt={ALT_FIJA} width={1080} height={1080} />
        </div>
        {textos}
      </div>
    );
  }

  return (
    <div className={styles.videoBloque}>
      <div className={styles.marco}>
        <video
          ref={videoRef}
          className={styles.video}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          poster={POSTER}
          width={1080}
          height={1080}
          aria-label="Video sin voz de la colmena de Nicaragua Decide, en cinco escenas"
          aria-describedby={idTextos}
          onPlay={() => setPausado(false)}
          onPause={() => setPausado(true)}
          onVolumeChange={(e) => setSilenciado(e.currentTarget.muted)}
        >
          <source src={WEBM} type="video/webm" />
          <source src={MP4} type="video/mp4" />
        </video>
        {/* Antes de hidratar, si la persona prefiere menos movimiento, el CSS muestra esta imagen. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className={styles.fijaCss} src={POSTER} alt={ALT_FIJA} width={1080} height={1080} />
      </div>

      {/* Etiquetas fijas con aria-pressed: «Sonido, presionado» = suena; «Pausa, presionado» = en pausa. */}
      <div className={styles.controles} hidden={sinVideo}>
        <button
          type="button"
          className={styles.control}
          aria-pressed={!silenciado}
          onClick={alternarSonido}
        >
          {silenciado ? <IconoSinSonido /> : <IconoSonido />}
          <span>Sonido</span>
        </button>
        <button
          type="button"
          className={styles.control}
          aria-pressed={pausado}
          onClick={alternarPausa}
        >
          {pausado ? <IconoReproducir /> : <IconoPausa />}
          <span>Pausa</span>
        </button>
      </div>
      {textos}
    </div>
  );
}

const svg = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  focusable: false,
};

function IconoSonido() {
  return (
    <svg {...svg}>
      <path d="M4 9v6h4l5 4V5L8 9H4z" />
      <path d="M16.5 8.5a5 5 0 0 1 0 7" />
      <path d="M19 6a8.5 8.5 0 0 1 0 12" />
    </svg>
  );
}

function IconoSinSonido() {
  return (
    <svg {...svg}>
      <path d="M4 9v6h4l5 4V5L8 9H4z" />
      <path d="M22 9l-6 6M16 9l6 6" />
    </svg>
  );
}

function IconoPausa() {
  return (
    <svg {...svg}>
      <path d="M9 5v14M15 5v14" />
    </svg>
  );
}

function IconoReproducir() {
  return (
    <svg {...svg}>
      <path d="M7 5l12 7-12 7V5z" />
    </svg>
  );
}
