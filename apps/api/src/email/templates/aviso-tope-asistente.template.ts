/** Aviso al administrador: el asistente alcanzó el tope de gasto del mes. Sin contenido de miembros. */
const PARRAFOS = [
  'El asistente de Nicaragua Decide alcanzó el tope de gasto de este mes.',
  'Desde ahora no hará más revisiones hasta el próximo mes. Los textos se publican como si el asistente no existiera y la mesa sigue moderando como siempre.',
  'Si quieres que siga funcionando este mes, sube el valor de ASISTENTE_TOPE_MENSUAL_USD en el servidor.',
];

export function avisoTopeAsistenteHtml(): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Tope del asistente — Decide Nicaragua</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 40px auto; padding: 0 20px; color: #1a1a1a; background: #fff;">
  <h1 style="font-size: 22px; font-weight: 700; margin-bottom: 24px;">Decide Nicaragua</h1>
${PARRAFOS.map((p) => `  <p style="font-size: 16px; line-height: 1.6;">${p}</p>`).join('\n')}
</body>
</html>`.trim();
}

export function avisoTopeAsistenteText(): string {
  return ['Decide Nicaragua — Tope del asistente', '', ...PARRAFOS].join('\n\n');
}
