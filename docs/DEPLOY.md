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
- Backups: el cron diario deja los `pg_dump` en el volumen `backups` del mismo
  servidor. **Falta copiarlos afuera** (otro proveedor o almacenamiento de
  archivos); hasta entonces, si se pierde el servidor se pierden los backups.
