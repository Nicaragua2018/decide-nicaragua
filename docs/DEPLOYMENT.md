# Despliegue en producción

Esta guía describe los pasos para desplegar `nicaraguadecide.org` en un VPS con Docker Compose y Traefik.

## 1. Configurar DNS en Hostinger

En el panel de Hostinger, busca la sección **DNS Zone** o **Gestor de DNS** y añade estos registros:

- `A` para `nicaraguadecide.org` → IP pública del VPS
- `A` para `api.nicaraguadecide.org` → IP pública del VPS
- `A` para `traefik.nicaraguadecide.org` → IP pública del VPS

> Si el VPS tiene IPv6, añade también registros `AAAA` para esos mismos nombres.

### Consejos

- Usa la IP fija de tu VPS.
- No actives el proxy de Cloudflare o servicios similares en estos registros. Traefik necesita ver directamente la IP para emitir certificados Let's Encrypt.
- Espera algunos minutos y comprueba con `dig` o `nslookup`.

## 2. Preparar el archivo de entorno en el VPS

En el directorio del proyecto en el VPS, crea o revisa `env.production`.

Debe contener al menos estos valores:

```env
NODE_ENV=production
APP_DOMAIN=nicaraguadecide.org
APP_URL=https://nicaraguadecide.org
API_URL=https://api.nicaraguadecide.org
COOKIE_DOMAIN=.nicaraguadecide.org

POSTGRES_USER=decide
POSTGRES_PASSWORD=<tu-password-segura>
POSTGRES_DB=decide
DATABASE_URL=postgresql://decide:<tu-password-segura>@postgres:5432/decide

REDIS_URL=redis://redis:6379

JWT_SECRET=<al-menos-32-caracteres-aleatorios>
JWT_EXPIRY=15m
REFRESH_TOKEN_EXPIRY=30d

INTERNAL_API_KEY=<secreto-aleatorio>
API_PORT=4000

RESEND_API_KEY=<tu-resend-api-key>
EMAIL_FROM=noreply@nicaraguadecide.org
EMAIL_FROM_NAME=Nicaragua Decide

IP_HASH_SALT=<sal-aleatorio-32-bytes>

TRAEFIK_ACME_EMAIL=<tu-email-lets-encrypt>
TRAEFIK_DASHBOARD_PASSWORD=admin:$$apr1$$<tu-hash-htpasswd>
```

### Cómo copiar un archivo de entorno

Si ya existe `.env.example`, puedes copiarlo y editarlo:

```bash
cp .env.example env.production
nano env.production
```

> Si `env.production` ya existe, puedes usar `nano env.production` para revisar y actualizar los valores.

## 3. Desplegar la app

Desde el directorio del repositorio en el VPS, ejecuta:

```bash
bash deploy.sh --env-file env.production
```

Si quieres solo reiniciar sin reconstruir imágenes:

```bash
bash deploy.sh --env-file env.production --no-build
```

Si necesitas crear el administrador inicial después de desplegar:

```bash
bash deploy.sh --env-file env.production --no-build --seed-admin
```

## 4. Verificar que el dominio funcione

Abre estas URLs en el navegador:

- https://nicaraguadecide.org
- https://api.nicaraguadecide.org/api/health
- https://traefik.nicaraguadecide.org

Si el dashboard de Traefik no debe estar público, usa el router protegido con `TRAEFIK_DASHBOARD_PASSWORD`.

## 5. Comprobación rápida desde la terminal

```bash
dig +short nicaraguadecide.org
dig +short api.nicaraguadecide.org
dig +short traefik.nicaraguadecide.org
```

Y luego, tras el despliegue:

```bash
docker compose --env-file env.production logs -f traefik api web
```

## 6. Asistente de IA: clave y examen

El asistente está apagado por defecto (ADR-025). Para encenderlo:

1. Añadir la clave a `env.production` sin que se vea en pantalla ni quede en el historial:

   ```bash
   read -rs -p "Pega la clave de Anthropic y pulsa Enter: " CLAVE; echo
   printf 'ANTHROPIC_API_KEY=%s\nASISTENTE_ACTIVO=false\n' "$CLAVE" >> env.production
   unset CLAVE
   chmod 600 env.production
   ```

   Si `env.production` ya tenía esas líneas, hay que borrar las viejas con `nano env.production`.

2. Correr el examen. Usa una imagen de prueba con el código fuente y no toca la API en marcha:

   ```bash
   docker build -f apps/api/Dockerfile --target builder -t decide-api-examen .
   docker run --rm --network decide_network --env-file env.production \
     -e ASISTENTE_ACTIVO=true decide-api-examen \
     pnpm --filter @decide/api asistente:examen
   ```

   Tiene que terminar sin fallos. Un caso que falla se repite dos veces más y aprueba si acierta 2 de 3 (regla decidida el 2026-11-10); la lista «Casos repetidos» lo muestra. El gasto de la corrida cuenta para el tope del mes.

3. Solo si el examen aprueba completo: cambiar `ASISTENTE_ACTIVO=false` por `ASISTENTE_ACTIVO=true` en `env.production` y reiniciar:

   ```bash
   bash deploy.sh --env-file env.production --no-build
   ```

   Para apagarlo, volver a `false` y reiniciar igual.

## 7. VPS compartido con OpenCivic Solutions (Traefik compartido)

En el VPS `srv2047035` (`179.236.66.237`) ya corre el Traefik de OpenCivic Solutions (`/docker/traefik`, red del host, puertas 80 y 443). Nicaragua Decide **no levanta su propio Traefik** ahí: usa ese.

- En `.env` de `/docker/decide-nicaragua` añade `TRAEFIK_MODO=compartido`. Así `deploy.sh` no pide `TRAEFIK_ACME_EMAIL` ni `TRAEFIK_DASHBOARD_PASSWORD` y no arranca el servicio `traefik` (queda en el perfil `traefik-propio`).
- Los routers, servicios y el middleware de cabeceras llevan el prefijo `decide-` y se definen por etiquetas de Docker, para no chocar con `opencivicsolutions.org`.
- Base de datos, Redis y la red `decide_network` son propios de Nicaragua Decide.
- DNS: los registros `A` de `@` y `api` de `nicaraguadecide.org` deben apuntar a `179.236.66.237` (el `www` es un CNAME). El certificado lo emite el Traefik compartido con su resolvedor `letsencrypt`.
- Si quedó un Traefik propio de un intento anterior: `docker rm -f traefik`.

## Notas finales

- El archivo `env.production` contiene secretos y no debe compartirse públicamente.
- Si tu DNS todavía no se ha propagado, espera 5-10 minutos tras guardar los registros.
- Si tienes dudas en Hostinger, busca la opción de **Editar registros DNS** y agrega los A records exactamente como aparecen arriba.
