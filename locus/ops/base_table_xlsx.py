# coding: utf-8
"""Read bounded XLSX cells from stdin without extracting or executing content."""
import io,json,posixpath,re,sys,zipfile
from datetime import datetime,timedelta
from decimal import Decimal,InvalidOperation,ROUND_HALF_UP
from xml.etree import ElementTree as ET
MAX_INPUT=8*1024*1024;MAX_PART=20*1024*1024;MAX_TOTAL=64*1024*1024;MAX_ROWS=5001;MAX_COLS=256;MAX_CELL=20000
NS={'m':'http://schemas.openxmlformats.org/spreadsheetml/2006/main','r':'http://schemas.openxmlformats.org/officeDocument/2006/relationships'}
REL='{http://schemas.openxmlformats.org/package/2006/relationships}Relationship'
def run(data,chosen=None):
 ns=dict(NS)
 if len(data)>MAX_INPUT:raise ValueError('Файл больше 8 МБ')
 with zipfile.ZipFile(io.BytesIO(data))as z:
  entries=z.infolist();names=[i.filename for i in entries]
  if len(entries)>2000 or len(set(names))!=len(names):raise ValueError('В XLSX слишком много или повторяются части')
  if sum(i.file_size for i in entries)>MAX_TOTAL or any(i.flag_bits&1 for i in entries):raise ValueError('XLSX защищён паролем или слишком велик после распаковки')
  remaining=MAX_TOTAL
  def xml(name):
   nonlocal remaining
   if name not in names:raise ValueError('В XLSX не найдена нужная часть таблицы')
   info=z.getinfo(name)
   if info.file_size>MAX_PART:raise ValueError('Один лист XLSX слишком велик')
   with z.open(name)as part:raw=part.read(min(MAX_PART,remaining)+1)
   remaining-=len(raw)
   if remaining<0 or len(raw)>MAX_PART or re.search(br'<!\s*(DOCTYPE|ENTITY)\b',raw,re.I):raise ValueError('Неподдерживаемое или слишком большое содержимое XLSX')
   root=ET.fromstring(raw)
   depth=0;stack=[(root,1)]
   while stack:
    node,level=stack.pop()
    if level>64:raise ValueError('Слишком сложная структура XLSX')
    stack.extend((child,level+1)for child in node)
   return root
  workbook=xml('xl/workbook.xml');main=re.fullmatch(r'\{([^}]+)\}workbook',workbook.tag)
  if not main or main[1]not in(NS['m'],'http://purl.oclc.org/ooxml/spreadsheetml/main'):raise ValueError('Неподдерживаемая структура XLSX')
  ns['m']=main[1];rels=xml('xl/_rels/workbook.xml.rels');links={r.attrib.get('Id'):r.attrib for r in rels if r.tag.rsplit('}',1)[-1]=='Relationship'};sheets=[]
  for i,s in enumerate(workbook.findall('m:sheets/m:sheet',ns),1):
   rel=links.get(next((v for k,v in s.attrib.items()if k.endswith('}id')),None))
   if not rel or rel.get('TargetMode')=='External' or not rel.get('Type','').endswith('/worksheet'):continue
   target=rel.get('Target','');target=posixpath.normpath(target.lstrip('/')if target.startswith('/')else posixpath.join('xl',target))
   if not target.startswith('xl/worksheets/')or target not in names:raise ValueError('Лист XLSX ссылается на неподдерживаемую часть')
   sheets.append({'nomer':i,'nazvanie':s.attrib.get('name','Лист '+str(i)),'skryt':s.attrib.get('state','visible')!='visible','part':target})
  if not sheets:raise ValueError('В файле нет доступных листов таблицы')
  if chosen is None:selected=next((s for s in sheets if not s['skryt']),sheets[0])
  else:
   selected=next((s for s in sheets if s['nomer']==chosen),None)
   if selected is None:raise ValueError('Выбранный лист не найден')
  def rich(node):
   if node is None:return ''
   return ''.join(t.text or ''for t in [*node.findall('m:t',ns),*node.findall('m:r/m:t',ns)])
  shared=[rich(si)for si in xml('xl/sharedStrings.xml').findall('m:si',ns)]if'xl/sharedStrings.xml'in names else[]
  builtins={14:'mm-dd-yy',15:'d-mmm-yy',16:'d-mmm',17:'mmm-yy',18:'h:mm AM/PM',19:'h:mm:ss AM/PM',20:'h:mm',21:'h:mm:ss',22:'m/d/yy h:mm',45:'mm:ss',46:'[h]:mm:ss',47:'mmss.0'}
  formats=[0];custom={}
  if 'xl/styles.xml'in names:
   styles=xml('xl/styles.xml');custom={int(f.attrib['numFmtId']):f.attrib.get('formatCode','')for f in styles.findall('m:numFmts/m:numFmt',ns)};formats=[int(f.attrib.get('numFmtId','0'))for f in styles.findall('m:cellXfs/m:xf',ns)]or[0]
  properties=workbook.find('m:workbookPr',ns);epoch1904=properties is not None and properties.attrib.get('date1904','').lower()in('1','true');converted=[]
  def number(raw,style,coordinate):
   if not raw:return ''
   try:value=Decimal(raw)
   except InvalidOperation:raise ValueError('Некорректное число в '+coordinate)
   if not value.is_finite()or abs(value.adjusted())>MAX_CELL:raise ValueError('Недопустимое число в '+coordinate)
   if style<0 or style>=len(formats):raise ValueError('Не найден формат ячейки '+coordinate)
   fmt=custom.get(formats[style],builtins.get(formats[style],''));plain=re.sub(r'"[^"]*"|\\.|\[[^\]]*\]', '',fmt).lower();duration=bool(re.search(r'\[[hms]+\]',fmt,re.I));date=bool(re.search(r'[yd]',plain))or'm'in plain and not re.search(r'[hs]',plain);time=bool(re.search(r'[hs]',plain))
   if date or time or duration:
    micros=int((value*Decimal(86400000000)).to_integral_value(rounding=ROUND_HALF_UP));days=micros//86400000000
    if duration:
     negative=micros<0;remaining=abs(micros);hours,remaining=divmod(remaining,3600000000);minutes,remaining=divmod(remaining,60000000);seconds,remainder=divmod(remaining,1000000);result=('-'if negative else'')+f'{hours}:{minutes:02d}:{seconds:02d}'+(f'.{remainder:06d}'.rstrip('0')if remainder else'')
    elif not date:result=(datetime(2000,1,1)+timedelta(microseconds=micros%86400000000)).time().isoformat()
    else:
     if not epoch1904 and days==60:raise ValueError('В '+coordinate+' Excel хранит несуществующую дату 29 февраля1900года. Исправь её перед импортом')
     if not epoch1904 and days==0:raise ValueError('В '+coordinate+' не подтверждена календарная дата: нулевой номер дня Excel')
     adjustment=86400000000 if not epoch1904 and 0<value<60 else 0;instant=datetime(1904,1,1)if epoch1904 else datetime(1899,12,30);instant+=timedelta(microseconds=micros+adjustment);result=instant.isoformat()if time or instant.time()!=datetime.min.time()else instant.date().isoformat()
    converted.append(coordinate);return result
   if re.fullmatch(r'0{2,}',fmt)and value==value.to_integral_value():return ('-'if value<0 else'')+str(abs(int(value))).zfill(len(fmt))
   result=format(value,'f');return result.rstrip('0').rstrip('.')if'.'in result else result
  sheet=xml(selected['part']);rows=[];formulae=[];previous=0;hyperlinks={}
  for source in sheet.findall('m:sheetData/m:row',ns):
   cells=[c for c in source.findall('m:c',ns)if c.find('m:v',ns)is not None or c.find('m:is',ns)is not None or c.find('m:f',ns)is not None]
   if not cells:continue
   row_no=int(source.attrib.get('r',previous+1))
   if row_no<=previous or row_no>MAX_ROWS:raise ValueError('В одном листе допускается до 5000 строк данных и заголовок')
   while previous+1<row_no:rows.append([]);previous+=1
   row=[];seen=set()
   for cell in cells:
    coordinate=cell.attrib.get('r','');match=re.fullmatch(r'([A-Z]+)([1-9]\d*)',coordinate)
    if not match or int(match[2])!=row_no:raise ValueError('Не подтверждён адрес ячейки XLSX')
    col=0
    for char in match[1]:col=col*26+ord(char)-64
    if col>MAX_COLS or col in seen:raise ValueError('В таблице больше 256 колонок или повторяется адрес ячейки')
    seen.add(col);kind=cell.attrib.get('t','n');value=cell.find('m:v',ns);cached=value.text or ''if value is not None else ''
    if cell.find('m:f',ns)is not None:
     if value is None or not cached and kind!='str':raise ValueError('У формулы в '+coordinate+' нет сохранённого значения. Сохрани файл с рассчитанными значениями или вставь значения вместо формул')
     formulae.append(coordinate)
     expression=cell.find('m:f',ns).text or '';literal=re.match(r'^(?:_xlfn\.)?HYPERLINK\(\s*"((?:[^"]|"")*)"\s*[,;]',expression,re.I)
     if literal:hyperlinks[str(row_no-1)+':'+str(col-1)]=literal[1].replace('""','"')
    if kind=='s':
     try:
      if not re.fullmatch(r'[+]?[0-9]+',cached.strip()):raise ValueError()
      result=shared[int(cached)]
     except (ValueError,IndexError):raise ValueError('В XLSX не найдена строка ячейки '+coordinate)
    elif kind=='inlineStr':result=rich(cell.find('m:is',ns))
    elif kind=='b':
     if cached not in('0','1'):raise ValueError('Некорректный флаг в ячейке '+coordinate)
     result='TRUE'if cached=='1'else'FALSE'
    elif kind=='e':raise ValueError('В ячейке '+coordinate+' сохранена ошибка. Исправь её перед импортом')
    elif kind=='n':result=number(cached,int(cell.attrib.get('s','0')),coordinate)
    elif kind in('str','d'):result=cached
    else:raise ValueError('Неподдерживаемый тип ячейки '+coordinate)
    if len(result)>MAX_CELL:raise ValueError('В ячейке '+coordinate+' больше 20000 символов')
    while len(row)<col:row.append('')
    row[col-1]=result
   rows.append(row);previous=row_no
  sheet_rels=posixpath.join(posixpath.dirname(selected['part']),'_rels',posixpath.basename(selected['part'])+'.rels')
  if sheet_rels in names:
   rels={r.attrib.get('Id'):r.attrib for r in xml(sheet_rels)if r.tag.rsplit('}',1)[-1]=='Relationship'}
   for link in sheet.findall('m:hyperlinks/m:hyperlink',ns):
    identity=next((v for k,v in link.attrib.items()if k.endswith('}id')),None);rel=rels.get(identity)
    if not rel or rel.get('TargetMode')!='External' or not rel.get('Type','').endswith('/hyperlink'):continue
    match=re.fullmatch(r'([A-Z]+)([1-9]\d*)',link.attrib.get('ref',''))
    if not match:raise ValueError('Ссылка XLSX должна относиться к одной ячейке')
    col=0
    for char in match[1]:col=col*26+ord(char)-64
    row_no=int(match[2]);target=rel.get('Target','')
    if row_no>MAX_ROWS or col>MAX_COLS or len(target)>MAX_CELL:raise ValueError('Ссылка XLSX выходит за допустимый размер таблицы')
    key=str(row_no-1)+':'+str(col-1)
    if key in hyperlinks and hyperlinks[key]!=target:raise ValueError('В одной ячейке XLSX указаны разные ссылки')
    hyperlinks[key]=target
  if len(hyperlinks)>10000:raise ValueError('В XLSX больше 10000 ссылок')
  for key,target in hyperlinks.items():
   ri,ci=map(int,key.split(':'))
   if ri>=MAX_ROWS or ci>=MAX_COLS or len(target)>MAX_CELL:raise ValueError('Ссылка XLSX выходит за допустимый размер таблицы')
   while len(rows)<=ri:rows.append([])
   while len(rows[ri])<=ci:rows[ri].append('')
   if not rows[ri][ci]:rows[ri][ci]=target
  while rows and not any(rows[-1]):rows.pop()
  if not rows:raise ValueError('Выбранный лист пуст')
  columns=max(map(len,rows));rows=[row+['']*(columns-len(row))for row in rows]
  return {'listy':[{k:v for k,v in s.items()if k!='part'}for s in sheets],'list':selected['nomer'],'rows':rows,'columns':columns,'formuly':formulae,'formuly_ne_vychisljalis':True,'hyperlinks':hyperlinks,'daty_preobrazovany':converted}
if __name__=='__main__':
 try:
  try:
   import resource
   resource.setrlimit(resource.RLIMIT_AS,(512*1024*1024,512*1024*1024))
  except (ImportError,ValueError):pass
  data=sys.stdin.buffer.read(MAX_INPUT+1);result=run(data,int(sys.argv[1])if len(sys.argv)>1 else None);print(json.dumps(result,ensure_ascii=False))
 except (ValueError,zipfile.BadZipFile,ET.ParseError,KeyError,RuntimeError,MemoryError,OverflowError)as e:
  print(json.dumps({'oshibka':str(e)or'Не удалось прочитать XLSX'},ensure_ascii=False));sys.exit(1)
