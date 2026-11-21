#!/usr/bin/env python3
# coding: utf-8
"""Build the call-site inventory; it does not certify visual acceptance."""
from pathlib import Path
import re,json,hashlib,argparse
root=Path(__file__).resolve().parents[1];base=root/'public';rows=[];choices=[];source_files={}
def argument(text,start):
 quote=None;escape=False;depth=0
 for end in range(start,len(text)):
  char=text[end]
  if escape:escape=False;continue
  if char=='\\':escape=True;continue
  if quote:
   if char==quote:quote=None
   continue
  if char in ['"',"'",'`']:quote=char;continue
  if char in '([{':depth+=1
  if char in ')]}':
   if depth==0:return text[start:end]
   depth-=1
  if char==','and depth==0:return text[start:end]
 return text[start:start+160]
for file in sorted(base.rglob('*')):
 if not file.is_file()or file.suffix not in ['.js','.html']or 'vendor'in file.parts:continue
 text=file.read_text();rel='public/'+str(file.relative_to(base));source_files[rel]=hashlib.sha256(file.read_bytes()).hexdigest()
 for m in re.finditer(r'(?<![\w])(?:O\.)?modalka\(',text):
  if re.search(r'function\s+$',text[max(0,m.start()-20):m.start()]):continue
  arg=argument(text,m.end()).strip();literals=re.findall(r"(['\"])([^'\"\n]{1,120}?)\1",arg);labels=list(dict.fromkeys(label for _,label in literals));title=' / '.join(labels)if labels else 'Окно с названием по сценарию'
  rows.append({'title':title,'title_kind':'literal_variants'if labels else 'dynamic','file':rel,'line':text.count('\n',0,m.start())+1,'visual_review':'pending','component':'O.modalka'})
 for m in re.finditer(r'<dialog\b|createElement\([\'"]dialog[\'"]\)',text):rows.append({'title':'Системное окно: '+file.stem,'title_kind':'native_dialog','file':rel,'line':text.count('\n',0,m.start())+1,'visual_review':'pending','component':'dialog'})
 for m in re.finditer(r'(?<![\w])(?:O\.)?vypadajuschij\(|<(?:select|datalist|details)\b|(?:createElement|element)\([\'"](?:select|datalist|details)[\'"]\)',text):
  if re.search(r'function\s+$',text[max(0,m.start()-20):m.start()]):continue
  match=m.group();component='datalist'if'datalist'in match else'details'if'details'in match else'select'if'select'in match else'O.vypadajuschij'
  choices.append({'component':component,'file':rel,'line':text.count('\n',0,m.start())+1,'visual_review':'pending'})
out={'kind':'callsite-inventory-not-visual-acceptance','source_files_sha256':source_files,'modals':rows,'choices':choices,'limits':['Static call sites include dynamic title variants; conditional content and every runtime state still need browser review','Creation panels and inline editors also belong to the component migration; this list does not claim all visual elements were reviewed','No business data or source dialogue is included']}
target=root/'public/design-system-inventory.json';text=json.dumps(out,ensure_ascii=False,indent=2)+'\n';parser=argparse.ArgumentParser();parser.add_argument('--write',action='store_true');args=parser.parse_args()
if args.write:target.write_text(text)
elif not target.exists()or target.read_text()!=text:raise SystemExit('Window inventory is stale: python3 ops/design_inventory.py --write')
print(json.dumps({'window_inventory':True,'window_calls':len(rows),'choice_controls':len(choices),'written':args.write}))
