#!/bin/sh
# Copia de los backups FUERA del servidor (Cloudflare R2), cifrada.
#
# Lo corre el cron del servidor CADA HORA:
#   docker compose -f docker-compose.prod.yml run --rm offsite-backup
# Sólo trabaja cuando hay un .dump nuevo (o pasó un día desde la última
# subida); el resto de las horas termina enseguida sin tocar R2. Así la
# frecuencia de las copias se maneja sólo desde /admin/backups.
# Con --force sube siempre.
#
# Sube:
#   base/                los .dump del volumen "backups" (pg_dump de la API)
#   archivos/            espejo del volumen "uploads" (fotos, PDFs, avatares)
#   archivos-borrados/   lo que se borró de uploads, guardado por fecha
# y borra de R2 lo que tenga más días que los configurados en el panel.
#
# Deja en /offsite (volumen compartido con la API, que lo muestra en el panel):
#   status.json     resultado de la última corrida y qué hay en R2
#   history.jsonl   una línea por corrida (las últimas 90)
# y lee de ahí config.json, que escribe la API ({"keepDays": 30}).
#
# El remoto "oplex-cifrado" es un remoto crypt de rclone sobre el bucket de
# R2: nombres y contenido viajan cifrados. Su configuración
# (/opt/oplex/rclone/rclone.conf) es lo ÚNICO que permite leer las copias:
# guardar una copia fuera del servidor. El paso a paso está en docs/DEPLOY.md.

set -u

REMOTE="${OFFSITE_REMOTE:-oplex-cifrado}"
RAW_REMOTE="${OFFSITE_RAW_REMOTE:-r2:oplex-backups}"
STATE_DIR="${OFFSITE_DIR:-/offsite}"
STATUS="$STATE_DIR/status.json"
HISTORY="$STATE_DIR/history.jsonl"
CONFIG="$STATE_DIR/config.json"
TODAY="$(date -u +%Y-%m-%d)"
START="$(date +%s)"
LOG="$(mktemp)"

mkdir -p "$STATE_DIR"
# La API (usuario node, uid 1000) escribe config.json acá.
chown 1000:1000 "$STATE_DIR" 2>/dev/null || true

json_field() { # json_field <archivo> <campo> - sólo números o strings simples
  [ -f "$1" ] || return 0
  sed -n "s/.*\"$2\":\"\{0,1\}\([^\",}]*\)\"\{0,1\}[,}].*/\1/p" "$1" | head -n 1
}
json_escape() { sed 's/\\/\\\\/g; s/"/\\"/g' | tr -d '\r\n'; }

KEEP_DAYS="$(json_field "$CONFIG" keepDays)"
KEEP_DAYS="${KEEP_DAYS:-${OFFSITE_KEEP_DAYS:-30}}"

NEWEST_PATH="$(ls -1t /backups/*.dump 2>/dev/null | head -n 1)"
NEWEST="$(basename "${NEWEST_PATH:-}" 2>/dev/null)"
PREV_DUMP="$(json_field "$STATUS" lastDump)"
PREV_OK_EPOCH="$(json_field "$STATUS" lastSuccessEpoch)"
PREV_OK_AT="$(json_field "$STATUS" lastSuccessAt)"
PREV_OK_EPOCH="${PREV_OK_EPOCH:-0}"

# Si la última corrida falló, se reintenta cada hora.
if [ "${1:-}" != "--force" ] && [ "$(json_field "$STATUS" ok)" = "true" ] \
  && [ -n "$NEWEST" ] && [ "$NEWEST" = "$PREV_DUMP" ] \
  && [ $((START - PREV_OK_EPOCH)) -lt 82800 ]; then
  echo "$(date -u '+%Y-%m-%d %H:%M:%S') UTC - nada nuevo para subir"
  exit 0
fi

echo "== $(date -u '+%Y-%m-%d %H:%M:%S') UTC - copia a $REMOTE (guarda $KEEP_DAYS días)"

write_status() { # write_status <ok> <error> <lastDump> <okAt> <okEpoch> <base> <archivos> <borrados> <bucket>
  NOW="$(date +%s)"
  printf '{"ok":%s,"error":"%s","finishedAt":"%s","durationSec":%s,"keepDays":%s,"lastDump":"%s","lastSuccessAt":"%s","lastSuccessEpoch":%s,"base":%s,"archivos":%s,"borrados":%s,"bucket":%s}\n' \
    "$1" "$2" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" $((NOW - START)) "$KEEP_DAYS" "$3" "$4" "$5" "$6" "$7" "$8" "$9" > "$STATUS.tmp"
  mv "$STATUS.tmp" "$STATUS"
}
append_history() { # append_history <ok> <error> <dumps> <files> <moved>
  printf '{"at":"%s","ok":%s,"error":"%s","durationSec":%s,"dump":"%s","uploadedDumps":%s,"uploadedFiles":%s,"movedFiles":%s}\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" "$2" $(($(date +%s) - START)) "$NEWEST" "$3" "$4" "$5" >> "$HISTORY"
  tail -n 90 "$HISTORY" > "$HISTORY.tmp" && mv "$HISTORY.tmp" "$HISTORY"
}
fail() {
  ERR="$(grep -v '^[[:space:]]*$' "$LOG" | tail -n 1 | sed 's/^[0-9\/]* [0-9:]* //' | json_escape)"
  echo "FALLÓ: $ERR"
  # Se conserva la última subida buena: la próxima hora vuelve a intentar.
  write_status false "$ERR" "$PREV_DUMP" "$PREV_OK_AT" "$PREV_OK_EPOCH" null null null null
  append_history false "$ERR" 0 0 0
  exit 1
}
step() { "$@" >> "$LOG" 2>&1 || fail; }
copied() { grep -c 'Copied (new)\|Copied (replaced' "$LOG" 2>/dev/null || true; }

# Los .dump que ya están arriba no se vuelven a subir.
step rclone copy /backups "$REMOTE:base" --include '*.dump' -v
DUMPS="$(copied)"
step rclone delete "$REMOTE:base" --min-age "${KEEP_DAYS}d"

# Espejo de uploads: lo que se borró o cambió acá no se pierde enseguida,
# queda en archivos-borrados/<fecha> hasta que cumple KEEP_DAYS.
# --size-only: los archivos subidos no se editan (cada uno tiene nombre
# propio) y así rclone no consulta la fecha de cada objeto en R2.
step rclone sync /uploads "$REMOTE:archivos" --size-only --backup-dir "$REMOTE:archivos-borrados/$TODAY" -v
FILES=$(($(copied) - DUMPS))
MOVED="$(grep -c 'Moved (server-side)' "$LOG" 2>/dev/null || true)"
# mkdir: el primer día archivos-borrados todavía no existe y delete fallaría.
step rclone mkdir "$REMOTE:archivos-borrados"
step rclone delete "$REMOTE:archivos-borrados" --min-age "${KEEP_DAYS}d"

# Inventario para el panel (nombres descifrados).
BASE="$(rclone lsjson "$REMOTE:base" --files-only 2>> "$LOG" | tr -d '\r\n')" || fail
ARCHIVOS="$(rclone size --json "$REMOTE:archivos" 2>> "$LOG")" || fail
BORRADOS="$(rclone size --json "$REMOTE:archivos-borrados" 2>> "$LOG")" || fail
BUCKET="$(rclone size --json "$RAW_REMOTE" 2>> "$LOG")" || fail

OK_EPOCH="$(date +%s)"
write_status true "" "$NEWEST" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$OK_EPOCH" "${BASE:-[]}" "$ARCHIVOS" "$BORRADOS" "$BUCKET"
append_history true "" "$DUMPS" "$FILES" "$MOVED"
rm -f "$LOG"
echo "OK: $DUMPS copias de la base y $FILES archivos subidos, $MOVED archivos a borrados"
