                      
"""Собирает schema.sql из СХЕМА-БАЗЫ.md.

Схема в документе это источник истины. Генератор нужен, чтобы база
и документ не разъехались: правишь документ, пересобираешь схему.
Тип поля выводится из описания, потому что в документе он написан
по-русски: «число», «дата», «да или нет», перечисление значений.
"""
import re
import sys
import os

BASE = os.path.join(os.path.dirname(__file__), '..', '..')
DOK = os.environ.get('LOCUS_SCHEMA_DOC', os.path.join(BASE, 'СХЕМА-БАЗЫ.md'))
                                                                     
import json as _json, subprocess as _sp
VYHOD = _json.loads(_sp.run(
    ['node', '-e', 'console.log(JSON.stringify(require(process.argv[1])));',
     os.path.join(os.path.dirname(__file__), 'puti.js')],
    capture_output=True, text=True, timeout=20).stdout)['SHEMA']

                                                  
BEZ_ID = {
    'otlozhennye_insajty': ['chelovek_id', 'kljuch'],
    'zaprosy_insajtov': ['avtor', 'kljuch_hesh'],
    'dejstvija_grafika': ['avtor', 'kljuch_hesh'],
    'zaprosy_grafika': ['avtor', 'kljuch_hesh'],
    'zaprosy_arhiva': ['avtor', 'kljuch_hesh'],
    'zaprosy_snimkov_planerki': ['avtor', 'kljuch_hesh'],
    'plany_periodov_okr': ['rezultat_id', 'period_id'],
    'zaprosy_planov_okr': ['avtor', 'kljuch_hesh'],
    'istochniki_publikacij_zadach': ['zadacha_id'],
    'zaprosy_istochnikov_publikacij': ['avtor', 'kljuch_hesh'],
    'zaprosy_okr': ['avtor', 'kljuch_hesh'],
    'zaprosy_konteksta_zadach': ['avtor', 'kljuch_hesh'],
    'zaprosy_strategii': ['avtor', 'kljuch_hesh'],
    'zaprosy_pravok_celej': ['avtor', 'kljuch_hesh'],
    'versii_nastroek': ['chelovek_id'],
    'versija_nastroek_sistemy': ['id'],
    'zaprosy_nastroek_sistemy': ['avtor', 'kljuch_hesh'],
    'zaprosy_nastroek': ['avtor', 'kljuch_hesh'],
    'arhiv_strok_baz': ['stroka_id'],
    'zaprosy_baz': ['avtor', 'kljuch_hesh'],
    'plany_kampanij': ['rassylka_id'],
    'porjadki_voln': ['zadacha_id'],
    'zaprosy_planov_kampanij': ['avtor', 'kljuch_hesh'],
    'zaprosy_kampanij': ['avtor', 'kljuch_hesh'],
    'sostavy_voln': ['zadacha_id'],
    'uchastniki_voln': ['zadacha_id', 'chelovek_id'],
    'zaprosy_rassylok': ['avtor', 'kljuch_hesh'],
    'zaprosy_lenty': ['avtor', 'kljuch_hesh'],
    'zavershenija_fokusa': ['sessija_id'],
    'zaprosy_fokusa': ['avtor', 'kljuch_hesh'],
    'referalnye_svjazi_vyplat': ['zadacha_id', 'zhurnal_id'],
    'referalnye_zadachi': ['zadacha_id'],
    'zaprosy_referalnyh_zadach': ['avtor', 'kljuch_hesh'],
    'zaprosy_uslovij_referalov': ['avtor', 'kljuch_hesh'],
    'zaprosy_vyplat_referalam': ['avtor', 'kljuch_hesh'],
    'zaprosy_dejstvij_uslug': ['avtor', 'kljuch_hesh'],
    'zaprosy_dejstvij_proektov': ['avtor', 'kljuch_hesh'],
    'zaprosy_pravok_proektov': ['avtor', 'kljuch_hesh'],
    'zaprosy_proektov': ['avtor', 'kljuch_hesh'],
    'zaprosy_shablonov': ['avtor', 'kljuch_hesh'],
    'zaprosy_sozdanija': ['avtor', 'kljuch_hesh'],
    'zaprosy_materialov': ['avtor', 'kljuch'],
    'zaprosy_zadach': ['avtor', 'kljuch_hesh'],
    'zaprosy_platezhej': ['avtor', 'kljuch_hesh'],
    'otmeny_kontaktov': ['token_hesh'],
    'povody_uvedomlenij': ['kljuch'],
    'schetchiki_anket': ['chelovek_id'],
    'import_svjazi': ['istochnik', 'tablica', 'staryj_id', 'chast'],
    'versii_polej': ['tablica', 'obekt_id', 'pole'],
    'otmetki_povtora': ['zadacha_id', 'data'],
    'rassylka_kasanija': None,                                            
    'snimki_planerki': ['napravlenie', 'god', 'nedelja'],
    'spravochnik_tipov': ['kod'],
    'napravlenija': ['kod'],
    'zamery_akkauntov': ['akkaunt_id', 'data'],
    'zamery_publikacij': ['publikacija_id', 'data'],
    'vizity': ['napravlenie', 'data', 'istochnik_trafika'],
    'nastrojki': ['chelovek_id'],
    'nastrojki_sistemy': None,
    'anketa': ['chelovek_id'],
    'vhod': ['chelovek_id'],
    'prosmotry': ['chelovek_id', 'zadacha_id'],
    'skrytye_plashki': ['chelovek_id', 'o_kom_id'],
    'istorija_filtrov': None,
    'shablon_podzadachi': None,
    'rassylka_plan': ['rassylka_id', 'god', 'nedelja'],
}

S_VERSIEJ = set()

                           
CHISLA = {
    'porjadok', 'summa', 'stoimost', 'cena', 'procent', 'vyplacheno',
    'plan', 'plan_chislo', 'baza', 'razmer', 'chas', 'den', 'nedelja',
    'sprint', 'den_nedeli', 'versija', 'podpischikov', 'publikacij_vsego',
    'summa_prosmotrov', 'ohvat', 'vovlechennost', 'prosmotrov', 'lajkov',
    'kommentariev', 'peresylok', 'sohranenij', 'vizitov', 'poluchen',
    'upotreblenij', 'stavka_naloga', 'nedel_v_okne', 'norma_dnej',
    'dnej_bez_obschenija_porog', 'plan_soobshenij', 'plan_otvetov',
    'plan_soglasij', 'plan_publikacij', 'rabochih_dnej', 'chasov',
}


def tip_polja(imja, opisanie, tablica):
    """Выводит тип SQLite из русского описания поля"""
                                                                     
                                                                        
    explicit = re.match(r'^(INTEGER|TEXT|REAL|BLOB)\b', opisanie, re.I)
    if explicit:
        return explicit.group(1).upper()
    o = opisanie.lower()
    if imja == 'id':
                                                                   
                                                                     
                                                                       
                                                               
                                                       
        if 'число' in o or not opisanie.strip():
            return 'INTEGER'
        return 'TEXT'
                                                                    
                                                                 
                                                    
                                                                               
    if imja == 'nomer' and 'четырёхзначн' in o:
        return 'INTEGER'
    if imja in CHISLA or 'число' in o or 'процент' in o or 'байт' in o:
        return 'INTEGER'
    if o.startswith('да или нет') or 'да или нет' in o:
        return 'INTEGER'                                              
    if 'дата и время' in o or 'метка времени' in o or o.startswith('время'):
        return 'TEXT'                               
    if o.startswith('дата') or imja.endswith('_at') or imja == 'sozdano':
        return 'TEXT'
    if imja.endswith('_id') or imja in ('kto', 'kto_dobavil', 'avtor',
                                        'otvetstvennyj', 'kto_vedet',
                                        'zakryl', 'vladelec', 'klient_id'):
        return 'INTEGER'
    return 'TEXT'


def main():
    s = open(DOK, encoding='utf-8').read()

                                                                    
    global S_VERSIEJ
    mv = re.search(r'Поле\s+есть\s+у\s+(.+?)\.\s+У\s+журналов', s, re.S)
    S_VERSIEJ = set(re.findall(r'`(\w+)`', mv.group(1))) if mv else set()
    if not S_VERSIEJ:
        raise ValueError('Раздел версии записи не найден; исходная schema.sql сохранена')
                                                  
    tablicy = []
    unikalnye = {}
    proverki = {}
                                                                 
                                                                    
    razdely = re.split(r'\n(?=## )', s)
    for razdel in razdely:
        mh = re.match(r'## (\w+)$', razdel.split('\n')[0])
        if not mh:
            continue
        imja = mh.group(1)
        if imja.isdigit():
            continue
                                                              
                                                                    
                                                                
                                                                   
                                                   
        granica = re.search(r'\n\*\*(?!\u041f\u043e\u043b\u044f )', razdel)
        chast = razdel[:granica.start()] if granica else razdel
        bloki = [b for b in re.findall(r'```\n(.*?)```', chast, re.S)
                 if '└──' not in b]
        if not bloki:
            continue
        blok = '\n'.join(bloki)
        unikalnye[imja] = re.findall(r'^UNIQUE\s*\(([a-z_0-9, ]+)\)\s*$', blok, re.M)
        proverki[imja] = re.findall(r'^CHECK\s+(\([^\n]+\))\s*$', blok, re.M)
        polja = []
        posledneje = None
        for line in blok.split('\n'):
            mp = re.match(r'^([a-z][a-z_0-9]*)\s*(.*)$', line)
            if mp:
                polja.append([mp.group(1), mp.group(2).strip()])
                posledneje = polja[-1]
            elif posledneje and line.startswith('   '):
                posledneje[1] += ' ' + line.strip()
        if polja:
            tablicy.append((imja, polja))

    out = ['-- Схема Локуса. Собрана из СХЕМА-БАЗЫ.md, руками не правится',
           '-- Пересобрать: python3 db/sborka_shemy.py',
           '',
           'PRAGMA journal_mode = WAL;',
           'PRAGMA foreign_keys = ON;',
           '']

    for imja, polja in tablicy:
        stroki = []
        imena = [p[0] for p in polja]
        for pole, opis in polja:
            t = tip_polja(pole, opis, imja)
            ogr = ''
            if pole == 'id' and imja not in BEZ_ID:
                                                                     
                                                  
                ogr = ' PRIMARY KEY AUTOINCREMENT' if t == 'INTEGER' else ' PRIMARY KEY'
            else:
                o = opis.lower()
                                                                   
                                                                         
                objazatelno = re.search(r'(?<!не)обязательн', o)
                ogovorka = any(x in o for x in (
                    'кроме', 'может быть пуст', 'необязательн',
                    'пусто значит', 'если ', 'у вех', 'у числовых',
                    'для клиентских', 'у клиентских', 'у бизнесовых',
                    'у реферала', 'у подзадачи',
                ))
                if (objazatelno and not ogovorka) or re.search(r'\bNOT NULL\b', opis, re.I):
                    ogr = ' NOT NULL'
                                                                     
                                                                        
                                         
                if re.search(r'уникал', o) and 'внутри задачи' not in o:
                    ogr += ' UNIQUE'
            umolchanie = re.search(r"\bDEFAULT\s+(\(datetime\('now'\)\)|'[^']*'|-?\d+(?:\.\d+)?)", opis, re.I)
            if umolchanie:
                ogr += ' DEFAULT ' + umolchanie.group(1)
            ssylka = re.search(r'\bREFERENCES\s+([a-z][a-z_0-9]*)\(([a-z][a-z_0-9]*)\)', opis, re.I)
            if ssylka:
                cel, kljuch = ssylka.groups()
                if not any(n == cel and any(p[0] == kljuch for p in ps) for n, ps in tablicy):
                    raise ValueError('нет цели связи: %s.%s → %s.%s' % (imja, pole, cel, kljuch))
                ogr += ' REFERENCES %s(%s)' % (cel, kljuch)
                udalenie = re.search(r'\bON DELETE\s+(CASCADE|RESTRICT|SET NULL|NO ACTION)\b', opis, re.I)
                if udalenie:
                    ogr += ' ON DELETE ' + udalenie.group(1).upper()
            stroki.append('  %-22s %s%s' % (pole, t, ogr))
                                                                 
                                                                   
        if imja in S_VERSIEJ and 'versija' not in imena:
            stroki.append('  %-22s %s' % ('versija', 'INTEGER'))

        klu = BEZ_ID.get(imja)
        if klu:
            stroki.append('  PRIMARY KEY (%s)' % ', '.join(klu))
        for unikalnyj in unikalnye.get(imja, []):
            if any(p.strip() not in imena for p in unikalnyj.split(',')):
                raise ValueError('неизвестное поле составной уникальности: ' + imja)
            stroki.append('  UNIQUE (%s)' % unikalnyj)
        for proverka in proverki.get(imja, []):
            stroki.append('  CHECK ' + proverka)
        out.append('CREATE TABLE IF NOT EXISTS %s (' % imja)
        out.append(',\n'.join(stroki))
        out.append(');')
        out.append('')

    open(VYHOD, 'w', encoding='utf-8').write('\n'.join(out))
    print('таблиц собрано: %d' % len(tablicy))
    print('полей всего: %d' % sum(len(p) + int(t in S_VERSIEJ and not any(n == 'versija' for n, _ in p))
                                for t, p in tablicy))
    print('записано в %s' % VYHOD)
    _sp.run([sys.executable, os.path.join(os.path.dirname(__file__), 'sborka_pravil.py')], check=True)
    return 0


sys.exit(main())
