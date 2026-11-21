#!/usr/bin/env python3
# coding: utf-8
"""Reject new literal visual values; retained legacy values remain an open audit."""
from pathlib import Path
from collections import Counter
import argparse,json,re,hashlib
ROOT=Path(__file__).resolve().parents[1]
PROPS=['color','background','background-color','border-color','border-radius','font-size','font-weight','font-family','line-height','letter-spacing','padding','padding-inline','padding-block','gap','row-gap','column-gap','box-shadow']
PATTERN=re.compile(r'(?<![\w-])('+ '|'.join(sorted(PROPS,key=len,reverse=True))+r')\s*:\s*([^;{}\n]+)')
def scan(root):
    found=Counter();locations={}
    contract=root/'design/system.json'
    if not contract.exists():contract=ROOT/'design/system.json'
    known=set(json.loads(contract.read_text())['tokens'])|{'shevron','kursor'}
    for file in sorted((root/'public').rglob('*')):
        if not file.is_file()or file.suffix not in ['.css','.html','.js']or any(part in ['vendor','shrifty']for part in file.parts)or file.name=='design-tokens.css':continue
        text=file.read_text();text=re.sub(r'/\*.*?\*/',lambda m:'\n'*m.group().count('\n'),text,flags=re.S)
        chunks=[(text,0)]if file.suffix=='.css'else [(m.group(1),text.count('\n',0,m.start(1)))for m in re.finditer(r'<style\b[^>]*>(.*?)</style>',text,re.S|re.I)]+[(m.group(2),text.count('\n',0,m.start(2)))for m in re.finditer(r"style=([\"'])(.*?)\1",text,re.S)]
        declarations=[]
        for body,offset in chunks:
            declarations.extend((m.group(1),m.group(2).strip(),offset+body.count('\n',0,m.start())+1)for m in PATTERN.finditer(body))
        if file.suffix in ['.js','.html']:
            for m in re.finditer(r"\.style\.([a-zA-Z]+)\s*=\s*([\"'])([^\"'\n]+)\2",text):
                prop=re.sub(r'[A-Z]',lambda x:'-'+x.group().lower(),m.group(1))
                if prop in PROPS:declarations.append((prop,m.group(3),text.count('\n',0,m.start())+1))
        for prop,value,line in declarations:
            if value in ['0','none','normal','inherit','initial','unset','transparent','currentColor','currentcolor']:continue
                                                                               
            names=re.findall(r'var\(\s*--([a-zA-Z0-9_-]+)',value);unknown=[name for name in names if name not in known and not re.fullmatch(r'pal-[1-5]|st-(v_plane|v_processe|na_soglasovanii|sdelano|kogda_nibud)',name)]
            without_vars=re.sub(r'var\(\s*--[a-zA-Z0-9_-]+\s*\)','',value)
            if not unknown and without_vars!=value and not re.search(r'#[0-9a-fA-F]{3,8}\b|(?<![\w-])(?:\d*\.)?\d+(?:px|rem|em|%)\b',without_vars):continue
            rel=str(file.relative_to(root));key=json.dumps([rel,prop,value],ensure_ascii=False,separators=(',',':'));found[key]+=1;locations.setdefault(key,[]).append(line)
    return found,locations
def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--baseline-from',type=Path);parser.add_argument('--json',type=Path);args=parser.parse_args();baseline_file=ROOT/'design/legacy-declarations.json'
    if args.baseline_from:
        root=args.baseline_from.resolve();found,_=scan(root);baseline={'kind':'retained-legacy-not-compliant','source_revision':'abea97561a14767c6c3f8255ebb694589b1909fd','entries':dict(sorted(found.items())),'warning':'Do not regenerate this file to conceal a new deviation. Reduce entries as components are migrated.'};baseline_file.write_text(json.dumps(baseline,ensure_ascii=False,indent=2)+'\n')
    baseline=json.loads(baseline_file.read_text());current,locations=scan(ROOT);allowed=Counter(baseline['entries']);extra=current-allowed
    result={'passed':not extra,'new_deviations':[{'file':json.loads(key)[0],'property':json.loads(key)[1],'value':json.loads(key)[2],'new_uses':count,'lines':locations[key]}for key,count in sorted(extra.items())],'retained_legacy_declarations':sum((current&allowed).values()),'legacy_values_not_visual_acceptance':True}
    if args.json:args.json.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(result,ensure_ascii=False))
    if extra:raise SystemExit(1)
if __name__=='__main__':main()
