// Textos en pantalla del video de la portada, en el orden de las escenas.
// Los usa el proyecto Remotion (video/portada) y la descripción accesible del video.

export const ESCENAS: readonly {
  id: 'dispersos' | 'ruido' | 'renace' | 'multiplica' | 'republica';
  texto: string;
}[] = [
  { id: 'dispersos', texto: 'Somos miles, repartidos por el mundo.' },
  {
    id: 'ruido',
    texto: 'Entre el ruido y la manipulación, ya no sabemos en quién confiar.',
  },
  { id: 'renace', texto: 'Todo renace cuando dos se asocian.' },
  {
    id: 'multiplica',
    texto: 'Y se multiplica en orden, sin jefes, por un objetivo común.',
  },
  {
    id: 'republica',
    texto: 'Una República para todos: una colmena democrática y cooperativa.',
  },
] as const;
