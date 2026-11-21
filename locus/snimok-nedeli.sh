#!/bin/bash
                                                       
                                                               
                                                           
                         
set -euo pipefail
umask 077
[ -f /etc/locus-novyj.env ] && . /etc/locus-novyj.env
: "${LOCUS_SERVICE_KEY:?не настроен ключ фоновых заданий}"
PORT=8791
NEDELJA=$(TZ=Europe/Moscow date +%V)
LOCUS_SNAPSHOT_YEAR=$(TZ=Europe/Moscow date +%G)
ZHURNAL=/var/log/locus-novyj/snimki-planerki.log
mkdir -p "$(dirname "$ZHURNAL")"
NAPRAVLENIJA=$(curl -fsS -m 20 "http://127.0.0.1:$PORT/api/napravlenija?na_stranice=50" \
  -H 'x-locus-chelovek: 61' -H "x-locus-service-key: $LOCUS_SERVICE_KEY" | python3 -c '
import json,sys
d=json.load(sys.stdin)
for n in d.get("spisok", []):
    if not n.get("arhiv"): print(n["kod"])')
for KOD in $NAPRAVLENIJA; do
  curl -fsS -m 30 -X POST \
    "http://127.0.0.1:$PORT/api/planerka/snimok?nedelja=$NEDELJA&god=$LOCUS_SNAPSHOT_YEAR&napravlenie=$KOD" \
    -H 'x-locus-chelovek: 61' -H 'Content-Type: application/json' -d '{}' \
    -H "x-locus-service-key: $LOCUS_SERVICE_KEY" \
    -o /dev/null -w "нед $NEDELJA $KOD: %{http_code}\n" >> "$ZHURNAL" 2>&1
done
echo "готово $(date -u +%FT%TZ)" >> "$ZHURNAL"
