#!/bin/bash
                                                              
                                     
                                 
                                                
                                  
                                                              
 
                                                             
                                                               
                                                                 
                                                               
                    
 
                                                                    
                                                                 
                                   
set -u
umask 077

SLUZHBA=locus-novyj
PORT=8791
ADRES=locus-novyj.187-124-165-215.nip.io
ZHURNAL=/var/log/locus-novyj/storozh.jsonl
MARKER_PEREZAPUSKA=/run/locus-novyj-storozh-perezapusk
MARKER_PISMA=/run/locus-novyj-storozh-pismo
[ -f /etc/locus-storozh.env ] && . /etc/locus-storozh.env

mkdir -p "$(dirname "$ZHURNAL")"
                                                                     
                             
[ -f /var/www/locus-novyj/ops/maintenance.json ] && exit 0

zapis() { # zapis статус беда
  printf '{"kogda":"%s","status":"%s","beda":"%s"}\n' \
    "$(date -u +%FT%TZ)" "$1" "${2:-}" >> "$ZHURNAL"
}

soobschit() { # одно письмо на поломку, следующее только после починки
  [ -f "$MARKER_PISMA" ] && return
  touch "$MARKER_PISMA"
  [ -n "${TG_TOKEN:-}" ] && [ -n "${TG_CHAT:-}" ] && \
    curl -s -m 10 "https://api.telegram.org/bot$TG_TOKEN/sendMessage" \
      -d chat_id="$TG_CHAT" -d text="Локус: $1" > /dev/null
}
         
DNS_OK=1
if ! getent hosts "$ADRES" > /dev/null 2>&1; then
  DNS_OK=0
  zapis beda "dns не резолвится"
  soobschit "имя $ADRES не резолвится"
fi
                                                                
                                          
KOD_STR=$(curl -s -o /dev/null -w '%{http_code}' -m 10 "http://127.0.0.1:$PORT/login")
KOD_API=$(curl -s -o /dev/null -w '%{http_code}' -m 10 \
  "http://127.0.0.1:$PORT/healthz")
            
ZHIVA=$(systemctl is-active "$SLUZHBA" 2>/dev/null)

if [ "$KOD_STR" = 200 ] && [ "$KOD_API" = 200 ]; then
  [ "$DNS_OK" = 1 ] || exit 1
  zapis ok
  rm -f "$MARKER_PEREZAPUSKA" "$MARKER_PISMA"
  exit 0
fi
                                                            
                         
if [ "$ZHIVA" != active ]; then
  zapis beda "служба $ZHIVA, страница $KOD_STR, api $KOD_API"
  soobschit "служба $ZHIVA, ждём Restart=always"
  exit 1
fi
                                                         
if [ ! -f "$MARKER_PEREZAPUSKA" ]; then
  touch "$MARKER_PEREZAPUSKA"
  zapis pochinka "служба жива, api $KOD_API: перезапускаю один раз"
  systemctl restart "$SLUZHBA"
else
  zapis beda "перезапуск не помог: страница $KOD_STR, api $KOD_API"
  soobschit "API мёртв и перезапуск не помог: страница $KOD_STR, api $KOD_API. Откат на снимок только руками (Т-501)"
fi
exit 1
