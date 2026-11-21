#!/usr/bin/env python3
"""Собирает действующие индексы и триггеры без повторного наката данных."""
from pathlib import Path
import json
import re
import sqlite3
import subprocess

root = Path(__file__).resolve().parent
paths = json.loads(subprocess.check_output([
    'node', '-e', 'console.log(JSON.stringify(require(process.argv[1])))',
    str(root / 'puti.js')], text=True))
rules = {}
create = re.compile(r'^CREATE\s+(?:UNIQUE\s+)?(INDEX|TRIGGER)\s+'
                    r'(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z_][\w]*)\b', re.I)
drop = re.compile(r'^DROP\s+(INDEX|TRIGGER)\s+(?:IF\s+EXISTS\s+)?'
                  r'([a-zA-Z_][\w]*)\b', re.I)

for source in sorted((root / 'migracii').glob('*.sql')):
    buffer = ''
    for line in source.read_text().splitlines(keepends=True):
        buffer += line
        if not sqlite3.complete_statement(buffer):
            continue
        sql = re.sub(r'^(?:\s|--[^\n]*(?:\n|$))*', '', buffer).strip()
        buffer = ''
        match = drop.match(sql)
        if match:
            rules.pop((match[1].upper(), match[2]), None)
            continue
        match = create.match(sql)
        if not match:
            continue
        if not re.search(r'\bIF\s+NOT\s+EXISTS\b', sql, re.I):
            sql = re.sub(r'^(CREATE\s+(?:UNIQUE\s+)?(?:INDEX|TRIGGER)\s+)',
                         r'\1IF NOT EXISTS ', sql, count=1, flags=re.I)
        rules[(match[1].upper(), match[2])] = (source.name, sql)

text = '-- Действующие индексы и триггеры из миграций, руками не править\n'
text += '-- Пересобрать: python3 db/sborka_pravil.py\n\n'
for source, sql in rules.values():
    text += '-- ' + source + '\n' + sql + '\n\n'
Path(paths['PRAVILA']).write_text(text)
print('правил собрано:', len(rules))
