# Asistente Agéntico para Contratistas

Implementación del PRD *"Asistente Agéntico para Contratistas — caso Héctor Mejía
(H&N Corintian Construction)"*. Convierte una foto de la libreta enviada por
WhatsApp en un invoice formal en PDF, lleva el libro de subcontratistas, la
contabilidad básica por jobsite y responde consultas en lenguaje natural.

Es un servicio **independiente** de la plataforma Decide Nicaragua: vive en este
monorepo por conveniencia de desarrollo, pero tiene su propia base de datos y su
propio despliegue (VPS con Docker + n8n).

## Arquitectura

```
WhatsApp (Héctor)
   │ foto / texto
   ▼
n8n (webhook, ya corriendo en el VPS)          n8n/whatsapp-asistente.workflow.json
   │ POST /webhook/whatsapp  (header x-webhook-secret)
   ▼
Asistente (NestJS, este servicio, puerto 4100)
   ├─ AgentService ........... Claude (visión + intención, salida estructurada JSON)
   ├─ ConversationService .... estado del hilo (borrador + preguntas pendientes)
   ├─ InvoicesService ........ numeración consecutiva + registro en Postgres
   ├─ InvoiceFileService ..... plantilla xlsx (exceljs) → PDF (LibreOffice headless)
   ├─ LedgerService .......... pagos a subcontratistas por trabajo
   └─ QueriesService ......... consultas con datos reales de Postgres
   ▼
Respuesta JSON { reply, attachment? } → n8n → WhatsApp
```

### Flujo de un invoice (Fase 0)

1. Héctor manda la foto de la libreta.
2. Claude extrae cliente, jobsite, fecha, conceptos y subcontratistas; lo que no
   puede leer con confianza queda en `null` (nunca se inventa).
3. El servicio compara contra los campos obligatorios (`clientName`,
   `jobsiteAddress`, `workDate`, `lineItems`) y pregunta **una cosa a la vez**
   por WhatsApp, guardando el borrador en `conversation_state`.
4. Completo el borrador: se asigna el siguiente número consecutivo
   (`MAX(invoice_number)+1`, con unique constraint y reintento ante colisión),
   se genera el xlsx con la plantilla formal (BILL TO / FOR / TOTAL / PAY THIS
   AMOUNT), se exporta a PDF y se responde con el archivo adjunto.
5. Los subcontratistas mencionados quedan registrados como deuda del trabajo.

### Otras ramas

- **Pago**: "le pagué 300 a Juan" → aplica el pago a la deuda pendiente más
  reciente de ese subcontratista (o la crea sobre el último trabajo).
- **Consulta**: "¿cuánto llevo facturado este mes?" / "¿qué le debo a la
  gente?" → respuestas construidas solo con datos de Postgres.
- **Agenda**: pendiente (Fase 3, Google Calendar) — el asistente lo dice
  honestamente en vez de simularlo.

## Desarrollo

```bash
# Desde la raíz del monorepo
pnpm install

cd apps/asistente
cp .env.example .env       # llenar ANTHROPIC_API_KEY, DATABASE_URL, WEBHOOK_SECRET
pnpm db:migrate            # crea el schema en Postgres
pnpm dev                   # arranca en :4100

pnpm test                  # tests unitarios (lógica pura, sin red ni DB)
pnpm typecheck
```

Prueba manual del webhook:

```bash
curl -s http://localhost:4100/webhook/whatsapp \
  -H 'content-type: application/json' \
  -H "x-webhook-secret: $WEBHOOK_SECRET" \
  -d '{"threadId":"+13050000000","text":"le pagué 300 a Juan por lo de ayer"}'
```

## Despliegue (VPS con Docker + n8n)

1. `docker-compose.example.yml` → copiar al VPS como `docker-compose.yml`,
   definir `.env` (ver variables abajo) y `docker compose up -d --build`.
   La imagen incluye LibreOffice para la exportación a PDF y aplica las
   migraciones de Prisma al arrancar.
2. Importar `n8n/whatsapp-asistente.workflow.json` en el n8n existente,
   definir la variable de entorno `ASISTENTE_WEBHOOK_SECRET` en n8n y adaptar
   los nodos de entrada/salida al proveedor de WhatsApp Business elegido
   (Twilio / 360dialog / Meta directo — decisión abierta del PRD §16).
3. Conectar el contenedor `asistente` a la red de n8n para que resuelva
   `http://asistente:4100`.

### Variables de entorno

| Variable | Descripción |
| --- | --- |
| `DATABASE_URL` | Postgres propio del asistente |
| `ANTHROPIC_API_KEY` | API key de Claude |
| `WEBHOOK_SECRET` | Secreto compartido con n8n (`x-webhook-secret`) |
| `BUSINESS_NAME/ADDRESS/PHONE/EMAIL` | Encabezado del invoice |
| `ASISTENTE_PORT` | Puerto HTTP (default 4100) |
| `SOFFICE_BIN` | Ruta de LibreOffice (default `soffice`) |

## Estado vs. roadmap del PRD

| Fase | Alcance | Estado |
| --- | --- | --- |
| 0 — Fundacional | Modelo de datos, WhatsApp→extracción→preguntas→invoice PDF, numeración consecutiva | ✅ implementado |
| 1 — Subcontratistas | Registro de pagos ligado a trabajos, consulta de pendientes | ✅ implementado (básico) |
| 2 — Contabilidad | Ganancia por jobsite (`src/ledger/profit.ts`), reporte mensual | ◐ fórmula y consulta mensual listas; reporte PDF pendiente |
| 3 — Agenda | Google Calendar | ⏳ pendiente |
| 4 — Consultas naturales | Preguntas de estado | ✅ facturado del mes y deudas a subcontratistas |

## Notas de seguridad

- El webhook exige `WEBHOOK_SECRET` (comparación en tiempo constante); sin la
  variable configurada, rechaza todo.
- No se loguean cuerpos de mensajes ni fotos; los archivos temporales de la
  conversión a PDF se borran siempre (`finally`).
- La extracción usa **structured outputs** y una capa de normalización
  defensiva (`src/agent/normalize.ts`): la salida del modelo nunca toca la base
  de datos sin validar.
- Las llamadas a Claude llevan habilitado el *server-side fallback* (`fallbacks:
  "default"`): si los clasificadores de seguridad declinan una request benigna,
  la API reintenta con el modelo de respaldo recomendado en la misma llamada.
