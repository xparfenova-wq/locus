# coding: utf-8
"""Meaningful negative checks for new unreviewed visual values."""
import importlib.util,json,tempfile,unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('design_guard',Path(__file__).resolve().parents[1]/'ops/design_guard.py');guard=importlib.util.module_from_spec(spec);spec.loader.exec_module(guard)
class DesignGuardTest(unittest.TestCase):
 def test_new_styles_cannot_hide_extra_pixel_color_or_unknown_token(self):
  with tempfile.TemporaryDirectory()as folder:
   root=Path(folder);(root/'public').mkdir();(root/'design').mkdir();(root/'design/system.json').write_text(json.dumps({'tokens':{'t1':'#1a1815','text-body':'13px','space-2':'8px','space-4':'16px'}}))
   (root/'public/a.css').write_text('.good{color:var(--t1);font-size:var(--text-body);padding:var(--space-2) var(--space-4)}.pixel{font-size:calc(var(--text-body) + 1px)}.shade{color:#1a1816}.unknown{color:var(--unknown)}.fallback{color:var(--t1,#112233)}')
   values,_=guard.scan(root);rows=[json.loads(key)for key in values];self.assertEqual(len(rows),4);self.assertTrue(any('1px'in row[2]for row in rows));self.assertTrue(any('#1a1816'in row[2]for row in rows));self.assertTrue(any('--unknown'in row[2]for row in rows));self.assertFalse(any(row[2]=='var(--text-body)'for row in rows))
 def test_inline_and_script_literals_count_but_measurement_objects_do_not(self):
  with tempfile.TemporaryDirectory()as folder:
   root=Path(folder);(root/'public').mkdir();(root/'design').mkdir();(root/'design/system.json').write_text(json.dumps({'tokens':{}}))
   (root/'public/page.html').write_text('<p style="color:#123456;font-size:17px">Text</p><style>.x{border-radius:13px}</style>')
   (root/'public/page.js').write_text("const metadata={padding:style.padding,color:style.color};node.style.color='#654321';node.style.fontSize='18px';")
   rows=[json.loads(key)for key in guard.scan(root)[0]];self.assertEqual(len(rows),5);self.assertFalse(any('style.padding'in row[2]for row in rows))
if __name__=='__main__':unittest.main()
