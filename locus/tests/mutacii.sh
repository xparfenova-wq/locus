#!/bin/bash
                                                                            
                                                          
cd "$(dirname "$0")/.."
                                                                 
export LOCUS_BAZA=/tmp/locus-mutacii.db
export PORT=8792
export LOCUS=http://127.0.0.1:8792
POJMANO=0
PROPUSCHENO=0
mkdir -p /tmp/locus-mut

mutacija() {
  local imja="$1" fajl="$2" bylo="$3" stalo="$4"
  cp "$fajl" "/tmp/locus-mut/$(basename "$fajl").orig"
  python3 - "$fajl" "$bylo" "$stalo" <<'PY'
import sys, pathlib
p = pathlib.Path(sys.argv[1]); s = p.read_text(encoding='utf-8')
if sys.argv[2] not in s:
    print('МУТАЦИЯ НЕ ПРИМЕНИЛАСЬ:', sys.argv[2][:60]); sys.exit(2)
p.write_text(s.replace(sys.argv[2], sys.argv[3], 1), encoding='utf-8')
PY
  if [ $? -ne 0 ]; then
    echo "  ? $imja — мутация не применилась"
    cp "/tmp/locus-mut/$(basename "$fajl").orig" "$fajl"
    return
  fi
  rm -f "$LOCUS_BAZA" "$LOCUS_BAZA"-wal "$LOCUS_BAZA"-shm
  node db/migrate.js > /tmp/locus-mut/migrate 2>&1
  node server.js > /tmp/locus-mut/log 2>&1 &
  local pid=$!
  sleep 1.3
  if node tests/run.js > /tmp/locus-mut/progon 2>&1; then
    echo "  ПРОПУЩЕНА: $imja"
    PROPUSCHENO=$((PROPUSCHENO+1))
  else
    echo "  поймана: $imja"
    POJMANO=$((POJMANO+1))
  fi
  kill $pid 2>/dev/null
  cp "/tmp/locus-mut/$(basename "$fajl").orig" "$fajl"
}

echo "мутации:"

mutacija "версия записи не проверяется" api/obschij.js \
  "if (Number(telo.versija) !== Number(bylo.versija)) {" \
  "if (false && Number(telo.versija) !== Number(bylo.versija)) {"

mutacija "автор перестал быть обязательным" server.js \
  "if (req.method !== 'GET' && avtor === null) {" \
  "if (false && req.method !== 'GET' && avtor === null) {"

mutacija "справочники не проверяются" api/obschij.js \
  "    if (spravochnik && znachenie !== null && !spravochnik.includes(znachenie)) {" \
  "    if (false) {"

mutacija "направления берутся списком из кода" api/opisanija.js \
  "    spravochniki: { napravlenie: napravlenija, status: STATUSY_ZADACHI," \
  "    spravochniki: { napravlenie: NAPRAVLENIJA, status: STATUSY_ZADACHI,"

mutacija "закрытая задача двигает общение" api/podruchki.js \
  "  db.prepare('UPDATE sotrudnichestva SET poslednjaja_zadacha = ? WHERE id = ?')" \
  "  db.prepare('UPDATE sotrudnichestva SET poslednee_obshenie = ? WHERE id = ?')"

mutacija "давно не общались считает по задачам" api/podruchki.js \
  "    const skolko = dnej(r.poslednee_obshenie);" \
  "    const skolko = dnej(r.poslednjaja_zadacha);"

mutacija "никогда не общались выпадают из списка" api/podruchki.js \
  "    if (!nikogda && skolko <= r.norma) continue;" \
  "    if (nikogda || skolko <= r.norma) continue;"

mutacija "дата последней задачи откатывается назад" api/podruchki.js \
  "  if (s.poslednjaja_zadacha && s.poslednjaja_zadacha >= den) return null;" \
  "  if (false) return null;"

mutacija "источник отметки не проверяется" api/podruchki.js \
  "  if (!['ruchnaja', 'bot'].includes(otkuda)) {" \
  "  if (false) {"

mutacija "фильтры контент-плана не работают" api/ekrany.js \
  "      uslovija.push(\`z.\${pole} = ?\`);" \
  "      if (false) uslovija.push(\`z.\${pole} = ?\`);"

mutacija "в контент-план идут все задачи" api/ekrany.js \
  "  const uslovija = ['z.publikacija = 1'," \
  "  const uslovija = ['1 = 1',"

mutacija "участник добавляется дважды" api/podruchki.js \
  "  if (est) return { telo: { ...v_api(est), imja: chel.imja } };" \
  "  if (false) return { telo: { ...v_api(est), imja: chel.imja } };"

mutacija "журнал не пишется" api/obschij.js \
  "    v_zhurnal(db, tablica, id_zapisi, k," \
  "    if (false) v_zhurnal(db, tablica, id_zapisi, k,"

mutacija "возврат из архива отключён" api/opisanija.js \
  "      if (!zadacha.klient_id) return null;" \
  "      if (true || !zadacha.klient_id) return null;"

mutacija "задача без клиента тоже возвращает" api/opisanija.js \
  "      if (!chel || !chel.arhiv) return null;" \
  "      if (!chel) return null;"

mutacija "клиентская задача без клиента проходит" api/opisanija.js \
  "      if (d.tip === 'klientskaja' && !d.klient_id) {" \
  "      if (false && d.tip === 'klientskaja' && !d.klient_id) {"

mutacija "подзадачи закрываются молча" api/podruchki.js \
  "  if (otkrytye > 0 && !telo.i_podzadachi) {" \
  "  if (false && otkrytye > 0 && !telo.i_podzadachi) {"

mutacija "открытая задача определена иначе" api/podruchki.js \
  "const OTKRYTA = \"status NOT IN ('sdelano','kogda_nibud')\";" \
  "const OTKRYTA = \"status NOT IN ('sdelano')\";"

mutacija "архив не скрывает из списков" api/obschij.js \
  "  if (nabor.has('arhiv') && zapros.arhiv !== '1') {" \
  "  if (false && nabor.has('arhiv') && zapros.arhiv !== '1') {"

mutacija "адрес вне канона проходит" server.js \
  "  if (!BAZOVYE.has(tablica)) {" \
  "  if (false && !BAZOVYE.has(tablica)) {"

mutacija "отметка дублируется за тот же день" api/podruchki.js \
  "    'SELECT * FROM otmetki_povtora WHERE zadacha_id = ? AND data = ?'" \
  "    'SELECT * FROM otmetki_povtora WHERE zadacha_id = ? AND data = ? AND 1=0'"

mutacija "журнал пишет имя таблицы" api/obschij.js \
  "  ljudi: 'chelovek', sotrudnichestva: 'sotrudnichestvo', proekty: 'proekt'," \
  "  ljudi: 'ljudi', sotrudnichestva: 'sotrudnichestva', proekty: 'proekty',"

mutacija "чтение журнала не переводит имя" api/podruchki.js \
  "    const znachenie = OBEKT_ZHURNALA[obekt] || obekt;" \
  "    const znachenie = obekt;"

mutacija "неизвестный объект журнала молчит" api/podruchki.js \
  "    if (!PODPIS_OBEKTA[znachenie]) {" \
  "    if (false) {"

mutacija "в журнал пишется всё подряд" api/obschij.js \
  "    if (!pishem.has(k)) continue;" \
  "    if (false) continue;"

echo ""
echo "поймано: $POJMANO, пропущено: $PROPUSCHENO"
[ "$PROPUSCHENO" -eq 0 ] || exit 1
