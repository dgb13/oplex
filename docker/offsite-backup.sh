#!/bin/sh
# Copia de los backups FUERA del servidor (Cloudflare R2), cifrada.
#
# Lo corre el cron del servidor, todos los días después del pg_dump de las
# 2 AM (BackupSchedulerService):
#   docker compose -f docker-compose.prod.yml run --rm offsite-backup
#
# Sube:
#   base/                los .dump del volumen "backups" (pg_dump diario)
#   archivos/            espejo del volumen "uploads" (fotos, PDFs, avatares)
#   archivos-borrados/   lo que se borró de uploads, guardado por fecha
# y borra de R2 lo que tenga más de OFFSITE_KEEP_DAYS días.
#
# El remoto "oplex-cifrado" es un remoto crypt de rclone sobre el bucket de
# R2: nombres y contenido viajan cifrados. Su configuración
# (/opt/oplex/rclone/rclone.conf) es lo ÚNICO que permite leer las copias:
# guardar una copia fuera del servidor. El paso a paso está en docs/DEPLOY.md.

set -eu

REMOTE="${OFFSITE_REMOTE:-oplex-cifrado}"
KEEP_DAYS="${OFFSITE_KEEP_DAYS:-30}"
TODAY="$(date -u +%Y-%m-%d)"

echo "== $(date -u '+%Y-%m-%d %H:%M:%S') UTC - copia a $REMOTE"

# Si el pg_dump de anoche no se hizo, igual se suben los archivos, pero el
# script termina con error para que quede a la vista en el log.
DUMP_OK=1
if [ -z "$(find /backups -maxdepth 1 -name '*.dump' -mmin -1560)" ]; then
  echo "ATENCIÓN: no hay ningún .dump de las últimas 26 horas en /backups"
  DUMP_OK=0
fi

# Los .dump que ya están arriba no se vuelven a subir.
rclone copy /backups "$REMOTE:base" --include '*.dump'
rclone delete "$REMOTE:base" --min-age "${KEEP_DAYS}d"

# Espejo de uploads: lo que se borró o cambió acá no se pierde enseguida,
# queda en archivos-borrados/<fecha> hasta que cumple KEEP_DAYS.
rclone sync /uploads "$REMOTE:archivos" --backup-dir "$REMOTE:archivos-borrados/$TODAY"
# mkdir: el primer día archivos-borrados todavía no existe y delete fallaría.
rclone mkdir "$REMOTE:archivos-borrados"
rclone delete "$REMOTE:archivos-borrados" --min-age "${KEEP_DAYS}d"

echo "Arriba en base/:"
rclone lsl "$REMOTE:base" | sort -k2,3 | tail -n 3

if [ "$DUMP_OK" -eq 0 ]; then
  exit 1
fi
echo "OK"
