# Montaje en producción

Cómo queda armado:

```
GitHub (push a main)  ──►  CI: lint + test + typecheck + build
GitHub (botón Deploy) ──►  arma las imágenes Docker, las guarda en ghcr.io
                           y las levanta en el servidor por SSH

Servidor (Linux con Docker), en /opt/oplex:
  caddy     :80/:443  HTTPS de oplex.com.ar (Let's Encrypt, automático)
  ├─ /api/*, /uploads/*  ──► api  (NestJS)
  └─ todo lo demás        ──► web  (Next.js)
  postgres  sin puertos hacia afuera
  migrate   corre `prisma migrate deploy` antes de que arranque la API
```

Archivos: `docker-compose.prod.yml`, `docker/Dockerfile.api`, `docker/Dockerfile.web`,
`docker/Caddyfile`, `docker/postgres-init-prod/`, `.env.production.example`,
`.github/workflows/deploy.yml`.

Sirve para cualquier servidor con Linux (un VPS, una máquina virtual de Google
Cloud, etc.). Lo único que cambia entre proveedores es el paso 1.

## 1. El servidor

- Ubuntu 24.04, **4 GB de RAM** mínimo, 2 CPU, 40 GB de disco.
- Puertos abiertos: 22 (SSH), 80 y 443. Nada más.

Instalar Docker y crear el usuario que usa el deploy:

```bash
curl -fsSL https://get.docker.com | sh
adduser --disabled-password --gecos "" deploy
usermod -aG docker deploy
mkdir -p /opt/oplex && chown deploy:deploy /opt/oplex
```

## 2. La llave SSH del deploy

En tu PC (no en el servidor):

```bash
ssh-keygen -t ed25519 -f oplex_deploy -N "" -C "github-deploy"
```

- `oplex_deploy.pub` → en el servidor, dentro de `/home/deploy/.ssh/authorized_keys`.
- `oplex_deploy` (la privada) → va a GitHub en el paso 4. No se comparte.

## 3. El `.env` del servidor

```bash
# como usuario deploy
cd /opt/oplex
nano .env      # pegar .env.production.example y completar
```

Las claves se generan con `openssl rand -hex 32` (una distinta para cada una:
`POSTGRES_PASSWORD`, `APP_DB_PASSWORD`, `JWT_SECRET`, `ENCRYPTION_MASTER_KEY`).

**`ENCRYPTION_MASTER_KEY`**: si se van a pasar datos desde otra base (por
ejemplo el tenant Demo de desarrollo), tiene que ser la misma que la de esa
máquina, si no los certificados de ARCA guardados no se pueden leer. Guardar
una copia fuera del servidor.

## 4. GitHub

En el repo: **Settings → Environments → New environment → `production`**.

Secrets:

| Nombre | Valor |
|---|---|
| `SSH_HOST` | IP del servidor |
| `SSH_USER` | `deploy` |
| `SSH_PRIVATE_KEY` | el contenido de `oplex_deploy` (la privada) |
| `SSH_KNOWN_HOSTS` | la salida de `ssh-keyscan <IP del servidor>` |

Variables:

| Nombre | Valor |
|---|---|
| `DOMAIN` | `oplex.com.ar` |
| `NEXT_PUBLIC_WHATSAPP_NUMBER` | el número comercial de la landing (formato wa.me, sin +) |
| `APP_DIR` | opcional, por defecto `/opt/oplex` |

Conviene activar en el environment **Required reviewers** con tu usuario: así
el deploy pide tu aprobación antes de publicar.

## 5. DNS en Cloudflare

En Cloudflare, zona `oplex.com.ar` → DNS:

- `A  oplex.com.ar      → IP del servidor`
- `A  www               → IP del servidor`

Arrancar con la nube en **gris (DNS only)** para que Caddy saque el
certificado. Una vez que `https://oplex.com.ar` anda, se puede pasar a
naranja (proxy de Cloudflare) poniendo **SSL/TLS → Full (strict)**.

## 6. Primer deploy

GitHub → **Actions → Deploy → Run workflow** (rama `main`).

Al terminar, el último paso confirma que `https://oplex.com.ar/api/plans`
responde. La primera vez Postgres arranca vacío y `migrate` crea todas las
tablas.

## Día a día

- **Publicar:** Actions → Deploy → Run workflow.
- **Volver atrás:** mismo botón, con `image_tag` = el sha corto de la versión
  anterior (está en el título de cada corrida del Deploy y en
  `IMAGE_TAG` del `.env` del servidor).
- **Ver logs:** `cd /opt/oplex && docker compose -f docker-compose.prod.yml logs -f api`
- **Migraciones:** se aplican solas en cada deploy, antes de que arranque la API.
  Si una falla, la API vieja sigue corriendo y el deploy termina en rojo.

## Después del primer deploy

- Registrar las URLs nuevas en cada proveedor (están en `.env.production.example`):
  Google, Microsoft, Mercado Pago (redirect OAuth y webhooks) y WhatsApp (webhook).
- Verificar `oplex.com.ar` en Resend para que salgan los emails.
- Backups fuera del servidor: ver la sección siguiente.

## Backups

- **En el servidor:** la API hace un `pg_dump` de toda la base y lo guarda en
  el volumen `backups`. Frecuencia, hora (de Argentina) y cuántas copias
  guardar se eligen en `/admin/backups` → Programación (por defecto: todos los
  días a las 23 h, 5 copias).
- **Fuera del servidor:** `docker/offsite-backup.sh` (servicio `offsite-backup`
  del compose, que no queda corriendo) sube a Cloudflare R2, **cifrado**, los
  `.dump` y un espejo del volumen `uploads` (fotos, PDFs, avatares). Lo lanza
  el cron del servidor **cada hora**, pero sólo sube algo cuando hay una copia
  nueva (o pasó un día). Los días a guardar en R2 también se eligen en el panel.
- **Panel:** `/admin/backups` muestra las dos copias, el espacio en R2 y el
  disco; `/admin/server`, procesador, memoria y disco. El script deja su
  resultado en el volumen `offsite`, que lee la API.
- **Avisos por email** a `PLATFORM_ADMIN_EMAILS`: copia de la base o subida a
  R2 fallida o atrasada, disco por encima del 80 %, R2 por encima de 8 GB y
  procesador o memoria altos media hora seguida.

### Armarlo (una sola vez)

1. **Cloudflare → R2 Object Storage**: activarlo y crear el bucket
   `oplex-backups`. Después, **Manage API tokens → Create API token** con
   permiso *Object Read & Write* sólo sobre ese bucket. Anotar *Access Key ID*,
   *Secret Access Key* y el endpoint (`https://<id de cuenta>.r2.cloudflarestorage.com`).
2. En el servidor (después de un deploy que incluya este script):

   ```bash
   cd /opt/oplex && mkdir -p rclone
   docker compose -f docker-compose.prod.yml run --rm --entrypoint rclone offsite-backup \
     config create r2 s3 provider=Cloudflare acl=private no_check_bucket=true \
     access_key_id=<ACCESS_KEY_ID> secret_access_key=<SECRET> \
     endpoint=https://<ID_DE_CUENTA>.r2.cloudflarestorage.com
   docker compose -f docker-compose.prod.yml run --rm --entrypoint rclone offsite-backup \
     config create oplex-cifrado crypt remote=r2:oplex-backups \
     password=$(openssl rand -hex 32) password2=$(openssl rand -hex 32)
   ```

3. Probarlo a mano: `docker compose -f docker-compose.prod.yml run --rm offsite-backup`
   (tiene que terminar en `OK`).
4. **Guardar `/opt/oplex/rclone/rclone.conf` fuera del servidor.** Tiene las
   claves de cifrado: sin ese archivo las copias de R2 no se pueden leer.
5. El cron, cada hora (a los 15 minutos):

   ```bash
   ( crontab -l 2>/dev/null | grep -v offsite-backup; echo '15 * * * * cd /opt/oplex && docker compose -f docker-compose.prod.yml run --rm offsite-backup >> /opt/oplex/offsite-backup.log 2>&1' ) | crontab -
   ```

   El resultado de cada corrida queda en `/opt/oplex/offsite-backup.log` y en
   el panel. Para forzar una subida: `docker compose -f docker-compose.prod.yml run --rm offsite-backup --force`.

### Vigilante externo

Si el servidor entero se cae, el panel y los avisos se caen con él. Para eso,
un servicio de afuera (UptimeRobot o Better Stack, tienen plan gratis) que
revise `https://oplex.com.ar/api/plans` cada pocos minutos y avise por mail o
WhatsApp si no responde.

### Restaurar

Con Docker y el `rclone.conf` guardado, desde cualquier máquina:

```bash
mkdir -p rclone restaurar && cp <copia de rclone.conf> rclone/
# ver qué hay
docker run --rm -v "$PWD/rclone:/config/rclone" rclone/rclone:1.68.2 ls oplex-cifrado:base
# bajar un dump y los archivos
docker run --rm -v "$PWD/rclone:/config/rclone" -v "$PWD/restaurar:/data" rclone/rclone:1.68.2 \
  copy oplex-cifrado:base/<archivo>.dump /data
docker run --rm -v "$PWD/rclone:/config/rclone" -v "$PWD/restaurar:/data" rclone/rclone:1.68.2 \
  copy oplex-cifrado:archivos /data/uploads
```

El `.dump` se carga con `pg_restore` (formato custom) sobre una base vacía, y
`restaurar/uploads` va al volumen `uploads`. Para leer los certificados de ARCA
y tokens guardados hace falta la misma `ENCRYPTION_MASTER_KEY` del `.env`.
