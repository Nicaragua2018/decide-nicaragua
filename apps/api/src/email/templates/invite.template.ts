export interface InviteTemplateParams {
  inviteUrl: string;
  expiresInHours: number;
}

export function inviteEmailHtml(params: InviteTemplateParams): string {
  const { inviteUrl, expiresInHours } = params;

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invitación — Decide Nicaragua</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 40px auto; padding: 0 20px; color: #1a1a1a; background: #fff;">

  <h1 style="font-size: 22px; font-weight: 700; color: #1a1a1a; margin-bottom: 4px;">
    Decide Nicaragua
  </h1>
  <p style="font-size: 14px; color: #666; margin-top: 0; margin-bottom: 32px;">
    Plataforma de participación democrática verificable
  </p>

  <p style="font-size: 16px; line-height: 1.6;">
    Has sido invitado/a a participar en <strong>Decide Nicaragua</strong>, una plataforma
    de participación democrática para ciudadanos nicaragüenses.
  </p>

  <p style="font-size: 16px; line-height: 1.6;">
    Haz clic en el siguiente botón para completar tu registro:
  </p>

  <div style="margin: 32px 0;">
    <a href="${inviteUrl}"
       style="background-color: #1d4ed8; color: #fff; padding: 14px 28px; text-decoration: none;
              border-radius: 6px; font-size: 15px; font-weight: 600; display: inline-block;">
      Aceptar invitación
    </a>
  </div>

  <p style="font-size: 14px; color: #555; line-height: 1.6;">
    Este enlace expira en <strong>${expiresInHours} horas</strong>.<br>
    Si no puedes hacer clic en el botón, copia y pega esta URL en tu navegador:
  </p>
  <p style="font-size: 12px; color: #666; word-break: break-all; background: #f4f4f5;
            padding: 10px 14px; border-radius: 4px; font-family: monospace;">
    ${inviteUrl}
  </p>

  <p style="font-size: 13px; color: #999; line-height: 1.6; margin-top: 32px;">
    Después de completar tu registro, tu cuenta quedará en estado de
    <strong>verificación pendiente</strong> hasta ser revisada por el equipo.
    Recibirás una notificación cuando tu cuenta sea activada.
  </p>

  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0;">

  <p style="font-size: 12px; color: #aaa;">
    Si no esperabas esta invitación, puedes ignorar este mensaje de forma segura.<br>
    Decide Nicaragua — Participación democrática verificable.
  </p>

</body>
</html>`.trim();
}

export function inviteEmailText(params: InviteTemplateParams): string {
  const { inviteUrl, expiresInHours } = params;
  return [
    'Decide Nicaragua — Invitación',
    '',
    'Has sido invitado/a a participar en Decide Nicaragua.',
    '',
    `Para completar tu registro, visita el siguiente enlace (expira en ${expiresInHours.toString()} horas):`,
    inviteUrl,
    '',
    'Si no esperabas esta invitación, puedes ignorar este mensaje.',
  ].join('\n');
}
