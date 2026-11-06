import { describe, expect, it } from 'vitest';
import { CAUSAS_NIVEL_2, MODERACION_CAUSAS } from '@decide/shared';

describe('tipos compartidos del asistente', () => {
  it('CAUSAS_NIVEL_2 contiene exactamente las 4 causas del nivel 2', () => {
    expect([...CAUSAS_NIVEL_2].sort()).toEqual(
      ['odio', 'insultos_amenazas', 'datos_personales', 'ilegal_violencia'].sort(),
    );
  });

  it('MODERACION_CAUSAS incluye odio, no urgente, con la etiqueta exacta', () => {
    const odio = MODERACION_CAUSAS.find((c) => c.value === 'odio');
    expect(odio).toEqual({
      value: 'odio',
      label: 'Incita al odio o ataca a un grupo por lo que es (origen, etnia, color, religión, sexo, orientación, discapacidad)',
      urgente: false,
    });
  });
});
