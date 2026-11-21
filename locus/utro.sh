#!/bin/bash
                                                                  
                                                                  
                                                                    
                                                                          
                                          
set -euo pipefail
umask 077
[ -f /etc/locus-novyj.env ] && . /etc/locus-novyj.env
: "${LOCUS_SERVICE_KEY:?не настроен ключ фоновых заданий}"
PORT=8791
mkdir -p /var/log/locus-novyj
curl -fsS -m 20 -X POST "http://127.0.0.1:$PORT/api/uvedomlenija/po_srokam" \
  -H 'x-locus-chelovek: 61' -H 'Content-Type: application/json' -d '{}' \
  -H "x-locus-service-key: $LOCUS_SERVICE_KEY" \
  >> /var/log/locus-novyj/utro.log 2>&1
echo " $(date -u +%FT%TZ)" >> /var/log/locus-novyj/utro.log
