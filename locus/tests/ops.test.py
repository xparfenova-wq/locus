"""Exercise recovery against a real SQLite WAL and real isolated Node server."""
import importlib.util
import contextlib
import io
import json
import os
from pathlib import Path
import shutil
import sqlite3
import subprocess
import tarfile
import tempfile
import unittest
from unittest.mock import patch
import socket
import time
import urllib.request
import urllib.error

APP = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('locus_ops', APP / 'ops/locus_ops.py')
ops = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ops)
import_spec = importlib.util.spec_from_file_location('import_legacy', APP / 'ops/import_legacy.py')
legacy_import = importlib.util.module_from_spec(import_spec)
import_spec.loader.exec_module(legacy_import)


class RecoveryTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='locus-ops-test-')
        self.base = Path(self.tmp.name)
        self.app = self.base / 'app'
        self.app.mkdir(mode=0o700)
        ops.copy_files(APP, self.app, ops.runtime_files(APP))
        subprocess.run(['node', 'db/migrate.js'], cwd=self.app,
            env=dict(os.environ, LOCUS_BAZA=str(self.app / 'db/locus.db')),
            check=True, capture_output=True)
        (self.app / 'fajly').mkdir()
        (self.app / 'fajly/proof.txt').write_text('actual attachment content')

    def tearDown(self):
        self.tmp.cleanup()

    def test_shared_settings_preserves_singleton_raw_values_and_refuses_unapproved_changes(self):
        database=self.app/'db/locus.db';before_file=self.base/'before-shared-settings.db'
        with contextlib.closing(sqlite3.connect(database))as db:
            for name in ['nastrojki_sistemy_singleton','versija_nastroek_sistemy_insert','versija_nastroek_sistemy_update','versija_nastroek_sistemy_delete']:db.execute('DROP TRIGGER '+name)
            db.execute('DROP TABLE versija_nastroek_sistemy');db.execute('DROP TABLE zaprosy_nastroek_sistemy');db.execute('DELETE FROM migracii WHERE nomer=151')
            db.execute("INSERT INTO ljudi(id,imja,komanda,dostup,aktiven)VALUES(4900077,'Original settings owner',1,'polnyj',1)")
            db.execute("UPDATE nastrojki_sistemy SET porog_peregruza='1.75',stavka_naloga=11,nedel_v_okne=NULL");db.commit()
        with contextlib.closing(sqlite3.connect(database))as db,contextlib.closing(sqlite3.connect(before_file))as dest:db.backup(dest)
        before=ops.db_state(before_file)
        subprocess.run(['node','db/migrate.js'],cwd=self.app,env=dict(os.environ,LOCUS_BAZA=str(database)),check=True,capture_output=True)
        ops.check_migration_counts(before,ops.db_state(database),self.app,before_file)
        proof=ops.verify_shared_settings_state(before_file,database,self.app)
        self.assertTrue(proof['exact_shared_settings_schema_verified']);self.assertEqual(proof['added_receipt_rows'],0)
        with contextlib.closing(sqlite3.connect(database))as db:
            self.assertEqual(db.execute('SELECT porog_peregruza,typeof(porog_peregruza),stavka_naloga,nedel_v_okne FROM nastrojki_sistemy').fetchone(),('1.75','text',11,None))
            with self.assertRaises(sqlite3.IntegrityError):db.execute('INSERT INTO nastrojki_sistemy(stavka_naloga)VALUES(99)')
        good=self.base/'good-shared-settings.db';shutil.copyfile(database,good)
        changes=["UPDATE nastrojki_sistemy SET porog_peregruza='3'",
                 "UPDATE migracii SET sha256='"+'a'*64+"'WHERE nomer=151",
                 "CREATE TABLE unapproved_settings(id INTEGER)",
                 "ALTER TABLE zaprosy_nastroek_sistemy ADD COLUMN unapproved TEXT",
                 "UPDATE sqlite_sequence SET seq=seq+1 WHERE name='ljudi'",
                 "INSERT INTO versija_nastroek_sistemy(id,versija)VALUES(1,1)",
                 "CREATE TRIGGER unapproved_settings_trigger AFTER UPDATE ON nastrojki_sistemy BEGIN SELECT 1;END;"]
        for change in changes:
            shutil.copyfile(good,database)
            with contextlib.closing(sqlite3.connect(database))as db:db.executescript(change)
            with self.assertRaises(ValueError,msg=change):ops.verify_shared_settings_state(before_file,database,self.app)
        shutil.copyfile(good,database)

    def test_insight_deferral_preserves_old_values_and_refuses_unapproved_changes(self):
        database=self.app/'db/locus.db';before_file=self.base/'before-insight-deferral.db'
        with contextlib.closing(sqlite3.connect(database))as db:
            db.execute("INSERT INTO ljudi(id,imja,komanda,dostup,aktiven)VALUES(4900088,'Original insight owner',1,'polnyj',1)")
            db.execute("INSERT INTO skrytye_plashki(chelovek_id,o_kom_id,skryto_do)VALUES(4900088,4900088,'2026-11-22 12:00:00')")
            db.execute('DROP TABLE otlozhennye_insajty');db.execute('DROP TABLE zaprosy_insajtov');db.execute('DELETE FROM migracii WHERE nomer=150');db.commit()
        with contextlib.closing(sqlite3.connect(database))as db,contextlib.closing(sqlite3.connect(before_file))as dest:db.backup(dest)
        before=ops.db_state(before_file)
        subprocess.run(['node','db/migrate.js'],cwd=self.app,env=dict(os.environ,LOCUS_BAZA=str(database)),check=True,capture_output=True)
        ops.check_migration_counts(before,ops.db_state(database),self.app,before_file)
        proof=ops.verify_insight_deferral_state(before_file,database,self.app)
        self.assertTrue(proof['exact_insight_deferral_schema_verified']);self.assertEqual(proof['added_receipt_rows'],0)
        good=self.base/'good-insight-deferral.db';shutil.copyfile(database,good)
        changes=["UPDATE skrytye_plashki SET skryto_do='2099-01-01'",
                 "UPDATE migracii SET sha256='"+'a'*64+"'WHERE nomer=150",
                 "CREATE TABLE unapproved_insight(id INTEGER)",
                 "ALTER TABLE otlozhennye_insajty ADD COLUMN unapproved TEXT",
                 "UPDATE sqlite_sequence SET seq=seq+1 WHERE name='ljudi'",
                 "INSERT INTO otlozhennye_insajty(chelovek_id,kljuch,otlozhen_do,sozdano)VALUES(4900088,'"+'b'*64+"','2026-11-28','2026-11-21')",
                 "INSERT INTO zaprosy_insajtov(avtor,kljuch_hesh,insajt_kljuch,sozdano)VALUES(4900088,'"+'b'*64+"','"+'c'*64+"','2026-11-21')"]
        for change in changes:
            shutil.copyfile(good,database)
            with contextlib.closing(sqlite3.connect(database))as db:db.executescript(change)
            with self.assertRaises(ValueError):ops.verify_insight_deferral_state(before_file,database,self.app)
        shutil.copyfile(good,database)

    def test_schedule_undo_receipts_preserve_old_values_and_refuse_unapproved_changes(self):
        database=self.app/'db/locus.db';before_file=self.base/'before-schedule-undo.db'
        with contextlib.closing(sqlite3.connect(database))as db:
            db.execute("INSERT INTO ljudi(id,imja,komanda,dostup,aktiven)VALUES(4900088,'Original weekly owner',1,'polnyj',1)")
            db.execute("INSERT INTO grafik(chelovek_id,god,nedelja,den,chasov,s_kakogo,do_kakogo,zametka)VALUES(4900088,2026,42,1,4,'15:00','19:00','Original schedule note')")
            db.execute("INSERT INTO zaprosy_grafika(avtor,kljuch_hesh,chelovek_id,god,nedelja,dejstvie,sozdano)VALUES(4900088,?,4900088,2026,42,'sohranit','2026-11-21')",('c'*64,))
            db.execute('DROP TABLE dejstvija_grafika');db.execute('DELETE FROM migracii WHERE nomer=149');db.commit()
        with contextlib.closing(sqlite3.connect(database))as db,contextlib.closing(sqlite3.connect(before_file))as dest:db.backup(dest)
        before=ops.db_state(before_file)
        subprocess.run(['node','db/migrate.js'],cwd=self.app,env=dict(os.environ,LOCUS_BAZA=str(database)),check=True,capture_output=True)
        ops.check_migration_counts(before,ops.db_state(database),self.app,before_file)
        proof=ops.verify_schedule_undo_state(before_file,database,self.app)
        self.assertTrue(proof['exact_schedule_undo_schema_verified']);self.assertEqual(proof['added_receipt_rows'],0)
        good=self.base/'good-schedule-undo.db';shutil.copyfile(database,good)
        changes=["UPDATE grafik SET chasov=5 WHERE chelovek_id=4900088 AND god=2026 AND nedelja=42",
                 "UPDATE migracii SET sha256='"+'a'*64+"'WHERE nomer=149",
                 "CREATE TABLE unapproved_weekly_snapshot(id INTEGER)",
                 "ALTER TABLE dejstvija_grafika ADD COLUMN unapproved TEXT",
                 "UPDATE sqlite_sequence SET seq=seq+1 WHERE name='ljudi'",
                 "INSERT INTO dejstvija_grafika(avtor,kljuch_hesh,chelovek_id,god,nedelja,dejstvie,sozdano)VALUES(4900088,'"+'b'*64+"',4900088,2026,42,'otmenit','2026-11-21')"]
        for change in changes:
            shutil.copyfile(good,database)
            with contextlib.closing(sqlite3.connect(database))as db:db.executescript(change)
            with self.assertRaises(ValueError):ops.verify_schedule_undo_state(before_file,database,self.app)
        shutil.copyfile(good,database)

    def test_schedule_receipts_preserve_old_values_and_refuse_unapproved_changes(self):
        database=self.app/'db/locus.db';before_file=self.base/'before-schedule-receipts.db'
        with contextlib.closing(sqlite3.connect(database))as db:
            db.execute("INSERT INTO ljudi(id,imja,komanda,dostup,aktiven)VALUES(4900088,'Original weekly owner',1,'polnyj',1)")
            db.execute("INSERT INTO grafik(chelovek_id,god,nedelja,den,chasov,s_kakogo,do_kakogo,zametka)VALUES(4900088,2026,42,1,4,'15:00','19:00','Original schedule note')")
            db.execute('DROP TABLE zaprosy_grafika');db.execute('DELETE FROM migracii WHERE nomer=148');db.commit()
        with contextlib.closing(sqlite3.connect(database))as db,contextlib.closing(sqlite3.connect(before_file))as dest:db.backup(dest)
        before=ops.db_state(before_file)
        subprocess.run(['node','db/migrate.js'],cwd=self.app,env=dict(os.environ,LOCUS_BAZA=str(database)),check=True,capture_output=True)
        ops.check_migration_counts(before,ops.db_state(database),self.app,before_file)
        proof=ops.verify_schedule_receipt_state(before_file,database,self.app)
        self.assertTrue(proof['exact_schedule_receipt_schema_verified']);self.assertEqual(proof['added_receipt_rows'],0)
        good=self.base/'good-schedule-receipts.db';shutil.copyfile(database,good)
        changes=["UPDATE grafik SET chasov=5 WHERE chelovek_id=4900088 AND god=2026 AND nedelja=42",
                 "UPDATE migracii SET sha256='"+'a'*64+"'WHERE nomer=148",
                 "CREATE TABLE unapproved_weekly_snapshot(id INTEGER)",
                 "ALTER TABLE zaprosy_grafika ADD COLUMN unapproved TEXT",
                 "UPDATE sqlite_sequence SET seq=seq+1 WHERE name='ljudi'",
                 "INSERT INTO zaprosy_grafika(avtor,kljuch_hesh,chelovek_id,god,nedelja,dejstvie,sozdano)VALUES(4900088,'"+'b'*64+"',4900088,2026,42,'sohranit','2026-11-21')"]
        for change in changes:
            shutil.copyfile(good,database)
            with contextlib.closing(sqlite3.connect(database))as db:db.executescript(change)
            with self.assertRaises(ValueError):ops.verify_schedule_receipt_state(before_file,database,self.app)
        shutil.copyfile(good,database)

    def test_archive_receipts_preserve_old_values_and_refuse_unapproved_changes(self):
        database=self.app/'db/locus.db';before_file=self.base/'before-archive-receipts.db'
        with contextlib.closing(sqlite3.connect(database))as db:
            db.execute("INSERT INTO ljudi(id,imja,komanda,dostup,aktiven)VALUES(4900088,'Original weekly owner',1,'polnyj',1)")
            db.execute("INSERT INTO snimki_planerki(napravlenie,god,nedelja,dannye,sozdano)VALUES('synapt',2026,42,'{\"legacy\":true,\"zero\":0}','2026-10-18 20:59:00')")
            db.execute('DROP TABLE zaprosy_arhiva');db.execute('DELETE FROM migracii WHERE nomer=147');db.commit()
        with contextlib.closing(sqlite3.connect(database))as db,contextlib.closing(sqlite3.connect(before_file))as dest:db.backup(dest)
        before=ops.db_state(before_file)
        subprocess.run(['node','db/migrate.js'],cwd=self.app,env=dict(os.environ,LOCUS_BAZA=str(database)),check=True,capture_output=True)
        ops.check_migration_counts(before,ops.db_state(database),self.app,before_file)
        proof=ops.verify_archive_receipt_state(before_file,database,self.app)
        self.assertTrue(proof['exact_archive_receipt_schema_verified']);self.assertEqual(proof['added_receipt_rows'],0)
        good=self.base/'good-archive-receipts.db';shutil.copyfile(database,good)
        changes=["UPDATE snimki_planerki SET dannye='changed original'WHERE napravlenie='synapt'AND god=2026 AND nedelja=42",
                 "UPDATE migracii SET sha256='"+'a'*64+"'WHERE nomer=147",
                 "CREATE TABLE unapproved_weekly_snapshot(id INTEGER)",
                 "ALTER TABLE zaprosy_arhiva ADD COLUMN unapproved TEXT",
                 "UPDATE sqlite_sequence SET seq=seq+1 WHERE name='ljudi'",
                 "INSERT INTO zaprosy_arhiva(avtor,kljuch_hesh,tablica,obekt_id,sozdano)VALUES(4900088,'"+'b'*64+"','ljudi',4900088,'2026-11-21')"]
        for change in changes:
            shutil.copyfile(good,database)
            with contextlib.closing(sqlite3.connect(database))as db:db.executescript(change)
            with self.assertRaises(ValueError):ops.verify_archive_receipt_state(before_file,database,self.app)
        shutil.copyfile(good,database)

    def test_weekly_snapshot_receipts_preserve_old_values_and_refuse_unapproved_changes(self):
        database=self.app/'db/locus.db';before_file=self.base/'before-weekly-snapshot-receipts.db'
        with contextlib.closing(sqlite3.connect(database))as db:
            db.execute("INSERT INTO ljudi(id,imja,komanda,dostup,aktiven)VALUES(4900088,'Original weekly owner',1,'polnyj',1)")
            db.execute("INSERT INTO snimki_planerki(napravlenie,god,nedelja,dannye,sozdano)VALUES('synapt',2026,42,'{\"legacy\":true,\"zero\":0}','2026-10-18 20:59:00')")
            db.execute('DROP TABLE zaprosy_snimkov_planerki');db.execute('DELETE FROM migracii WHERE nomer=146');db.commit()
        with contextlib.closing(sqlite3.connect(database))as db,contextlib.closing(sqlite3.connect(before_file))as dest:db.backup(dest)
        before=ops.db_state(before_file)
        subprocess.run(['node','db/migrate.js'],cwd=self.app,env=dict(os.environ,LOCUS_BAZA=str(database)),check=True,capture_output=True)
        ops.check_migration_counts(before,ops.db_state(database),self.app,before_file)
        proof=ops.verify_weekly_snapshot_receipt_state(before_file,database,self.app)
        self.assertTrue(proof['exact_weekly_snapshot_receipt_schema_verified']);self.assertEqual(proof['added_receipt_rows'],0)
        good=self.base/'good-weekly-snapshot-receipts.db';shutil.copyfile(database,good)
        changes=["UPDATE snimki_planerki SET dannye='changed original'WHERE napravlenie='synapt'AND god=2026 AND nedelja=42",
                 "UPDATE migracii SET sha256='"+'a'*64+"'WHERE nomer=146",
                 "CREATE TABLE unapproved_weekly_snapshot(id INTEGER)",
                 "ALTER TABLE zaprosy_snimkov_planerki ADD COLUMN unapproved TEXT",
                 "UPDATE sqlite_sequence SET seq=seq+1 WHERE name='ljudi'",
                 "INSERT INTO zaprosy_snimkov_planerki(avtor,kljuch_hesh,napravlenie,god,nedelja,sozdano)VALUES(4900088,'"+'b'*64+"','synapt',2026,42,'2026-11-20')"]
        for change in changes:
            shutil.copyfile(good,database)
            with contextlib.closing(sqlite3.connect(database))as db:db.executescript(change)
            with self.assertRaises(ValueError):ops.verify_weekly_snapshot_receipt_state(before_file,database,self.app)
        shutil.copyfile(good,database)

    def test_period_plan_migration_refuses_changed_old_data_schema_or_invented_plans(self):
        database=self.app/'db/locus.db';before_file=self.base/'before-period-plans.db'
        with contextlib.closing(sqlite3.connect(database))as db:
            db.execute("INSERT INTO celi(id,nazvanie,napravlenie,period_id,opisanie)VALUES(4900077,'Original period goal','synapt','2026-Q4','Original context')")
            db.execute('DROP TABLE plany_periodov_okr');db.execute('DROP TABLE zaprosy_planov_okr');db.execute('DELETE FROM migracii WHERE nomer=145');db.commit()
        with contextlib.closing(sqlite3.connect(database))as db,contextlib.closing(sqlite3.connect(before_file))as dest:db.backup(dest)
        before=ops.db_state(before_file)
        subprocess.run(['node','db/migrate.js'],cwd=self.app,env=dict(os.environ,LOCUS_BAZA=str(database)),check=True,capture_output=True)
        ops.check_migration_counts(before,ops.db_state(database),self.app,before_file)
        proof=ops.verify_period_plan_state(before_file,database,self.app);self.assertTrue(proof['exact_period_plan_schema_verified']);self.assertEqual(proof['added_business_rows'],0)
        good=self.base/'good-period-plans.db';shutil.copyfile(database,good)
        for change in ["UPDATE celi SET opisanie='Changed original context'WHERE id=4900077","UPDATE migracii SET sha256='"+'a'*64+"'WHERE nomer=145","CREATE TABLE unexpected_period_plan(id INTEGER)","ALTER TABLE plany_periodov_okr ADD COLUMN unapproved TEXT","UPDATE sqlite_sequence SET seq=seq+1 WHERE name='celi'"]:
            shutil.copyfile(good,database)
            with contextlib.closing(sqlite3.connect(database))as db:db.executescript(change)
            with self.assertRaises(ValueError):ops.verify_period_plan_state(before_file,database,self.app)
        shutil.copyfile(good,database)

    def test_goal_edit_receipts_do_not_change_any_old_values_types_rows_or_history(self):
        database=self.app/'db/locus.db';before_file=self.base/'before-goal-edit.db'
        with contextlib.closing(sqlite3.connect(database))as db:
            db.execute("INSERT INTO celi(id,nazvanie,napravlenie,period_id,opisanie)VALUES(4900077,'Original goal','synapt','2026-Q4','Original context')")
            db.execute('DROP TABLE zaprosy_pravok_celej');db.execute('DELETE FROM migracii WHERE nomer=144');db.commit()
        with contextlib.closing(sqlite3.connect(database))as db,contextlib.closing(sqlite3.connect(before_file))as dest:db.backup(dest)
        before=ops.db_state(before_file)
        subprocess.run(['node','db/migrate.js'],cwd=self.app,env=dict(os.environ,LOCUS_BAZA=str(database)),check=True,capture_output=True)
        ops.check_migration_counts(before,ops.db_state(database),self.app,before_file)
        proof=ops.verify_goal_edit_state(before_file,database,self.app);self.assertTrue(proof['exact_goal_edit_schema_verified']);self.assertEqual(proof['added_receipt_rows'],0)
        good=self.base/'good-goal-edit.db';shutil.copyfile(database,good)
        for change in ["UPDATE celi SET opisanie='Changed original context'WHERE id=4900077","UPDATE celi SET period_id='2027-Q1'WHERE id=4900077","UPDATE migracii SET sha256='"+'a'*64+"'WHERE nomer=144","CREATE TABLE unexpected_goal_edit(id INTEGER)","ALTER TABLE zaprosy_pravok_celej ADD COLUMN unapproved TEXT","UPDATE sqlite_sequence SET seq=seq+1 WHERE name='celi'"]:
            shutil.copyfile(good,database)
            with contextlib.closing(sqlite3.connect(database))as db:db.executescript(change)
            with self.assertRaises(ValueError):ops.verify_goal_edit_state(before_file,database,self.app)
        shutil.copyfile(good,database)


    def test_strategy_migration_preserves_old_text_links_types_and_history(self):
        database=self.app/'db/locus.db';before_file=self.base/'before-strategy-state.db'
        with contextlib.closing(sqlite3.connect(database))as db:
            db.execute("INSERT INTO tezisy(id,napravlenie,god,tekst,porjadok)VALUES(4900077,'synapt','2026','Original paragraph\n\nТочный текст',7)")
            db.execute("INSERT INTO celi(id,nazvanie,napravlenie,period_id,tezis_id)VALUES(4900077,'Original linked goal','synapt','2026-Q4',4900077)")
            for name in ['insert','update','delete']:db.execute('DROP TRIGGER versii_tezisy_'+name)
            db.execute("DELETE FROM versii_polej WHERE tablica='tezisy'")
            db.execute('DROP TABLE zaprosy_strategii')
            db.execute('CREATE TABLE strategy_old_theses(id INTEGER PRIMARY KEY AUTOINCREMENT,napravlenie TEXT,god TEXT,tekst TEXT,porjadok INTEGER)')
            db.execute('INSERT INTO strategy_old_theses(id,napravlenie,god,tekst,porjadok)SELECT id,napravlenie,god,tekst,porjadok FROM tezisy')
            db.execute('DROP TABLE tezisy');db.execute('ALTER TABLE strategy_old_theses RENAME TO tezisy')
            db.execute('DELETE FROM migracii WHERE nomer=143');db.commit()
        with contextlib.closing(sqlite3.connect(database))as db,contextlib.closing(sqlite3.connect(before_file))as dest:db.backup(dest)
        before=ops.db_state(before_file)
        subprocess.run(['node','db/migrate.js'],cwd=self.app,env=dict(os.environ,LOCUS_BAZA=str(database)),check=True,capture_output=True)
        ops.check_migration_counts(before,ops.db_state(database),self.app,before_file)
        proof=ops.verify_strategy_state(before_file,database,self.app);self.assertTrue(proof['exact_strategy_schema_verified']);self.assertEqual(proof['added_metadata_rows'],2)
        good=self.base/'good-strategy-state.db';shutil.copyfile(database,good)
        for change in [
            "UPDATE tezisy SET tekst='Changed original text'WHERE id=4900077",
            "UPDATE celi SET tezis_id=NULL WHERE id=4900077",
            "UPDATE tezisy SET porjadok=0 WHERE id=4900077",
            "UPDATE versii_polej SET pole='tekst'WHERE tablica='tezisy'AND pole='*'",
            "UPDATE migracii SET sha256='"+'a'*64+"'WHERE nomer=143",
            "CREATE TABLE strategy_unrelated(id INTEGER)",
            "ALTER TABLE zaprosy_strategii ADD COLUMN unapproved TEXT",
            "UPDATE sqlite_sequence SET seq=seq+1 WHERE name='tezisy'",
        ]:
            shutil.copyfile(good,database)
            with contextlib.closing(sqlite3.connect(database))as db:db.executescript(change)
            with self.assertRaises(ValueError):ops.verify_strategy_state(before_file,database,self.app)
        shutil.copyfile(good,database)

    def test_campaign_migration_keeps_all_old_targets_tasks_and_order_unknown(self):
        database=self.app/'db/locus.db';before_file=self.base/'before-campaign-state.db'
        with contextlib.closing(sqlite3.connect(database))as db:
            db.execute("INSERT INTO ljudi(id,imja)VALUES(4900077,'Broadcast preservation fixture')")
            db.execute("INSERT INTO rassylki(id,nazvanie)VALUES(4900077,'Original campaign')")
            db.execute("INSERT INTO zadachi(id,nomer,nazvanie,napravlenie,otvetstvennyj,rassylka_id)VALUES(4900077,4900077,'Original wave','synapt',4900077,4900077)")
            db.execute("INSERT INTO rassylka_ljudi(id,rassylka_id,chelovek_id,zadacha_id,status)VALUES(4900077,4900077,4900077,4900077,'otvetil')")
            db.execute("INSERT INTO rassylka_kasanija(rassylka_id,chelovek_id,zadacha_id,kogda,chto)VALUES(4900077,4900077,4900077,'2026-11-10','otpravleno')")
            db.execute('DROP TRIGGER zaprosy_kampanij_delete')
            for table in ['porjadki_voln','plany_kampanij','zaprosy_kampanij']:db.execute('DROP TABLE '+table)
            db.execute('DELETE FROM migracii WHERE nomer=135');db.commit()
        with contextlib.closing(sqlite3.connect(database))as db,contextlib.closing(sqlite3.connect(before_file))as dest:db.backup(dest)
        before=ops.db_state(before_file)
        subprocess.run(['node','db/migrate.js'],cwd=self.app,env=dict(os.environ,LOCUS_BAZA=str(database)),check=True,capture_output=True)
        ops.check_migration_counts(before,ops.db_state(database),self.app,before_file)
        proof=ops.verify_campaign_state(before_file,database,self.app);self.assertTrue(proof['exact_campaign_state_schema_verified']);self.assertTrue(proof['historical_targets_and_order_not_invented'])
        good=self.base/'good-campaign-state.db';shutil.copyfile(database,good)
        for change in [
            "UPDATE rassylka_ljudi SET status='otkaz'WHERE id=4900077",
            "UPDATE rassylka_ljudi SET zadacha_id=NULL WHERE id=4900077",
            "UPDATE rassylka_kasanija SET chto='otkaz'WHERE rassylka_id=4900077",
            "UPDATE zadachi SET nazvanie='Invented wave'WHERE id=4900077",
            "INSERT INTO plany_kampanij(rassylka_id,plan_chislo,avtor,sozdano)VALUES(4900077,500,4900077,'2026-11-18')",
            "INSERT INTO zaprosy_kampanij(avtor,kljuch_hesh,tablica,vladelec_id,zapis_id,sozdano)VALUES(4900077,'"+'a'*64+"','rassylki',4900077,0,'2026-11-18')",
            "UPDATE migracii SET sha256='"+'a'*64+"'WHERE nomer=135",
            "CREATE TABLE broadcast_unrelated(id INTEGER)",
            "ALTER TABLE plany_kampanij ADD COLUMN unapproved TEXT",
            "UPDATE sqlite_sequence SET seq=seq+1 WHERE name='rassylki'",
        ]:
            shutil.copyfile(good,database)
            with contextlib.closing(sqlite3.connect(database))as db:db.executescript(change)
            with self.assertRaises(ValueError):ops.verify_campaign_state(before_file,database,self.app)
        shutil.copyfile(good,database)

    def test_broadcast_migration_cannot_invent_old_recipients_or_edit_history(self):
        database=self.app/'db/locus.db';before_file=self.base/'before-broadcast-state.db'
        with contextlib.closing(sqlite3.connect(database))as db:
            db.execute("INSERT INTO ljudi(id,imja)VALUES(4900077,'Broadcast preservation fixture')")
            db.execute("INSERT INTO rassylki(id,nazvanie)VALUES(4900077,'Original campaign')")
            db.execute("INSERT INTO zadachi(id,nomer,nazvanie,napravlenie,otvetstvennyj,rassylka_id)VALUES(4900077,4900077,'Original wave','synapt',4900077,4900077)")
            db.execute("INSERT INTO rassylka_ljudi(id,rassylka_id,chelovek_id,zadacha_id,status)VALUES(4900077,4900077,4900077,4900077,'otvetil')")
            db.execute("INSERT INTO rassylka_kasanija(rassylka_id,chelovek_id,zadacha_id,kogda,chto)VALUES(4900077,4900077,4900077,'2026-11-10','otpravleno')")
            for table in ['uchastniki_voln','sostavy_voln','zaprosy_rassylok']:db.execute('DROP TABLE '+table)
            db.execute('DELETE FROM migracii WHERE nomer=134');db.commit()
        with contextlib.closing(sqlite3.connect(database))as db,contextlib.closing(sqlite3.connect(before_file))as dest:db.backup(dest)
        before=ops.db_state(before_file)
        subprocess.run(['node','db/migrate.js'],cwd=self.app,env=dict(os.environ,LOCUS_BAZA=str(database)),check=True,capture_output=True)
        ops.check_migration_counts(before,ops.db_state(database),self.app,before_file)
        proof=ops.verify_broadcast_state(before_file,database,self.app);self.assertTrue(proof['exact_broadcast_state_schema_verified']);self.assertTrue(proof['historical_rosters_not_invented'])
        good=self.base/'good-broadcast-state.db';shutil.copyfile(database,good)
        for change in [
            "UPDATE rassylka_ljudi SET status='otkaz'WHERE id=4900077",
            "UPDATE rassylka_ljudi SET zadacha_id=NULL WHERE id=4900077",
            "UPDATE rassylka_kasanija SET chto='otkaz'WHERE rassylka_id=4900077",
            "UPDATE zadachi SET nazvanie='Invented wave'WHERE id=4900077",
            "INSERT INTO sostavy_voln(zadacha_id,rassylka_id,plan,polnyj,sozdano,avtor)VALUES(4900077,4900077,1,1,'2026-11-18',4900077)",
            "INSERT INTO zaprosy_rassylok(avtor,kljuch_hesh,rassylka_id,sozdano)VALUES(4900077,'"+'a'*64+"',4900077,'2026-11-18')",
            "UPDATE migracii SET sha256='"+'a'*64+"'WHERE nomer=134",
            "CREATE TABLE broadcast_unrelated(id INTEGER)",
            "ALTER TABLE uchastniki_voln ADD COLUMN unapproved TEXT",
            "UPDATE sqlite_sequence SET seq=seq+1 WHERE name='rassylki'",
        ]:
            shutil.copyfile(good,database)
            with contextlib.closing(sqlite3.connect(database))as db:db.executescript(change)
            with self.assertRaises(ValueError):ops.verify_broadcast_state(before_file,database,self.app)
        shutil.copyfile(good,database)

    def test_feed_state_preserves_messages_and_adds_only_initial_versions_and_empty_receipts(self):
        database=self.app/'db/locus.db';before_file=self.base/'before-feed-state.db'
        with contextlib.closing(sqlite3.connect(database))as db:
            db.execute("INSERT INTO ljudi(id,imja)VALUES(4900088,'Feed preservation fixture')")
            db.execute("INSERT INTO lenta(id,chelovek_id,tip,tekst,sprint,god_sprinta,sozdano)VALUES(4900088,4900088,'refleksija','Raw imported message',46,2026,'2026-11-10 13:00:00')")
            db.execute('DROP TRIGGER zaprosy_lenty_delete');db.execute('DROP TABLE zaprosy_lenty');db.execute('ALTER TABLE lenta DROP COLUMN versija');db.execute('DELETE FROM migracii WHERE nomer=133');db.commit()
        with contextlib.closing(sqlite3.connect(database))as db,contextlib.closing(sqlite3.connect(before_file))as dest:db.backup(dest)
        before=ops.db_state(before_file)
        subprocess.run(['node','db/migrate.js'],cwd=self.app,env=dict(os.environ,LOCUS_BAZA=str(database)),check=True,capture_output=True)
        ops.check_migration_counts(before,ops.db_state(database),self.app,before_file)
        proof=ops.verify_feed_state(before_file,database,self.app);self.assertTrue(proof['exact_feed_state_schema_verified']);self.assertEqual(proof['old_messages_retained'],1)
        good=self.base/'good-feed-state.db';shutil.copyfile(database,good)
        for change in [
            "UPDATE lenta SET tekst='Invented new text'WHERE id=4900088",
            "UPDATE lenta SET chelovek_id=NULL WHERE id=4900088",
            "UPDATE lenta SET versija=2 WHERE id=4900088",
            "UPDATE lenta SET sozdano='2030-01-01'WHERE id=4900088",
            "INSERT INTO zaprosy_lenty(avtor,kljuch_hesh,tablica,vladelec_id,zapis_id,sozdano)VALUES(4900088,'"+'a'*64+"','lenta',4900088,0,'2026-11-18')",
            "UPDATE migracii SET sha256='"+'a'*64+"'WHERE nomer=133",
            "CREATE TABLE feed_unrelated(id INTEGER)",
            "DROP TRIGGER zaprosy_lenty_delete;CREATE TRIGGER zaprosy_lenty_delete AFTER DELETE ON lenta BEGIN SELECT 1;END",
            "UPDATE sqlite_sequence SET seq=seq+1 WHERE name='lenta'",
            "ALTER TABLE lenta ADD COLUMN unapproved TEXT",
        ]:
            shutil.copyfile(good,database)
            with contextlib.closing(sqlite3.connect(database))as db:db.executescript(change)
            with self.assertRaises(ValueError):ops.verify_feed_state(before_file,database,self.app)
        shutil.copyfile(good,database)

    def test_focus_expiry_migration_cannot_close_imported_timers_or_invent_reasons(self):
        database=self.app/'db/locus.db';before_file=self.base/'before-focus-expiry.db'
        with contextlib.closing(sqlite3.connect(database))as db:
            db.execute("INSERT INTO ljudi(id,imja)VALUES(4900099,'Focus expiry preservation fixture')")
            db.execute("INSERT INTO fokus_sessii(id,chelovek_id,rezhim,nachalo,zachtena)VALUES(4900099,4900099,'fokus','2026-11-10 13:00:00',0)")
            db.execute('DROP TABLE zavershenija_fokusa');db.execute('DELETE FROM migracii WHERE nomer=132');db.commit()
        with contextlib.closing(sqlite3.connect(database))as db,contextlib.closing(sqlite3.connect(before_file))as dest:db.backup(dest)
        before=ops.db_state(before_file)
        subprocess.run(['node','db/migrate.js'],cwd=self.app,env=dict(os.environ,LOCUS_BAZA=str(database)),check=True,capture_output=True)
        ops.check_migration_counts(before,ops.db_state(database),self.app,before_file)
        self.assertTrue(ops.verify_focus_expiry(before_file,database,self.app)['imported_sessions_not_expired'])
        good=self.base/'good-focus-expiry.db';shutil.copyfile(database,good)
        for change in [
            "UPDATE fokus_sessii SET konec='2026-11-11 13:00:00'WHERE id=4900099",
            "UPDATE fokus_sessii SET versija=2 WHERE id=4900099",
            "INSERT INTO zavershenija_fokusa VALUES(4900099,4900099,'00000000-0000-4000-8000-000000000000','2026-11-10 13:00:00','2026-11-11 13:00:00','2026-11-11 13:01:00')",
            "UPDATE migracii SET sha256='"+'a'*64+"'WHERE nomer=132",
            "CREATE TABLE expiry_unrelated(id INTEGER)",
            "UPDATE sqlite_sequence SET seq=seq+1 WHERE name='fokus_sessii'",
        ]:
            shutil.copyfile(good,database)
            with contextlib.closing(sqlite3.connect(database))as db:db.executescript(change)
            with self.assertRaises(ValueError):ops.verify_focus_expiry(before_file,database,self.app)
        shutil.copyfile(good,database)

    def test_focus_state_preserves_past_sessions_and_adds_only_unknown_pause_defaults_and_empty_receipts(self):
        database=self.app/'db/locus.db';before_file=self.base/'before-focus-state.db'
        with contextlib.closing(sqlite3.connect(database))as db:
            db.execute("INSERT INTO ljudi(id,imja)VALUES(4900091,'Focus preservation fixture')")
            db.execute("INSERT INTO fokus_sessii(id,chelovek_id,rezhim,nachalo,konec,zachtena)VALUES(4900091,4900091,'fokus','2026-11-10 12:00:00','2026-11-10 12:25:00',1)")
            db.execute("INSERT INTO fokus_sessii(id,chelovek_id,rezhim,nachalo,zachtena)VALUES(4900092,4900091,'fokus','2026-11-10 13:00:00',0)")
            db.execute('DROP TABLE zaprosy_fokusa')
            for name in ['identifikator','versija','pauza_ms','pauza_s']:db.execute('ALTER TABLE fokus_sessii DROP COLUMN '+name)
            db.execute('DELETE FROM migracii WHERE nomer=131');db.commit()
        with contextlib.closing(sqlite3.connect(database))as db,contextlib.closing(sqlite3.connect(before_file))as dest:db.backup(dest)
        before=ops.db_state(before_file)
        subprocess.run(['node','db/migrate.js'],cwd=self.app,env=dict(os.environ,LOCUS_BAZA=str(database)),check=True,capture_output=True)
        ops.check_migration_counts(before,ops.db_state(database),self.app,before_file)
        proof=ops.verify_focus_state(before_file,database,self.app);self.assertTrue(proof['exact_focus_state_schema_verified']);self.assertEqual(proof['old_focus_sessions_retained'],2);self.assertEqual(proof['added_receipt_rows'],0)
        good=self.base/'good-focus-state.db';shutil.copyfile(database,good)
        changes=[
            "UPDATE fokus_sessii SET zachtena=0 WHERE id=4900091",
            "UPDATE fokus_sessii SET konec='2026-11-18 12:00:00'WHERE id=4900092",
            "UPDATE fokus_sessii SET pauza_ms=1 WHERE id=4900091",
            "UPDATE fokus_sessii SET pauza_s='2026-11-10 12:00:00'WHERE id=4900091",
            "UPDATE fokus_sessii SET versija=2 WHERE id=4900091",
            "UPDATE fokus_sessii SET identifikator='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'WHERE id=4900091",
            "INSERT INTO zaprosy_fokusa(avtor,kljuch_hesh,sozdano)VALUES(4900091,'"+'a'*64+"','2026-11-18')",
            "UPDATE ljudi SET imja='Changed person'WHERE id=4900091",
            "UPDATE migracii SET sha256='"+'a'*64+"'WHERE nomer=131",
            "UPDATE sqlite_sequence SET seq=seq+1 WHERE name='fokus_sessii'",
            "ALTER TABLE fokus_sessii ADD COLUMN rogue TEXT",
            "ALTER TABLE zaprosy_fokusa ADD COLUMN rogue TEXT",
            "CREATE TABLE rogue(id INTEGER)",
        ]
        for statement in changes:
            with self.subTest(statement=statement.split()[:3]):
                shutil.copyfile(good,database)
                with contextlib.closing(sqlite3.connect(database))as db:db.executescript(statement)
                with self.assertRaises(ValueError):ops.check_migration_counts(before,ops.db_state(database),self.app,before_file)
        shutil.copyfile(good,database)
        with contextlib.closing(sqlite3.connect(database))as writer:
            writer.execute("UPDATE fokus_sessii SET nachalo='Uncheckpointed WAL'WHERE id=4900091");writer.commit()
            with self.assertRaisesRegex(ValueError,'closed standalone snapshot'):ops.verify_focus_state(before_file,database,self.app)

    def test_referral_payout_links_add_only_an_empty_table_and_preserve_all_original_values(self):
        database=self.app/'db/locus.db';before_file=self.base/'before-referral-links.db'
        with contextlib.closing(sqlite3.connect(database))as db:
            db.execute("INSERT INTO ljudi(id,imja)VALUES(4900081,'Link preservation fixture')")
            db.execute("INSERT INTO sotrudnichestva(id,chelovek_id,napravlenie,rol,vyplacheno)VALUES(4900081,4900081,'synapt','referal',12345.67)")
            db.execute("INSERT INTO zhurnal(obekt,obekt_id,pole,bylo,stalo,kto,kogda)VALUES('sotrudnichestvo',4900081,'vyplacheno','0','12345.67',4900081,'2026-11-18')")
            db.execute('DROP TABLE referalnye_svjazi_vyplat');db.execute('DELETE FROM migracii WHERE nomer=130');db.commit()
        with contextlib.closing(sqlite3.connect(database))as db,contextlib.closing(sqlite3.connect(before_file))as dest:db.backup(dest)
        before=ops.db_state(before_file)
        subprocess.run(['node','db/migrate.js'],cwd=self.app,env=dict(os.environ,LOCUS_BAZA=str(database)),check=True,capture_output=True)
        ops.check_migration_counts(before,ops.db_state(database),self.app,before_file)
        proof=ops.verify_referral_payout_links(before_file,database,self.app);self.assertTrue(proof['exact_referral_payout_link_schema_verified']);self.assertEqual(proof['added_allocation_rows'],0)
        good=self.base/'good-referral-links.db';shutil.copyfile(database,good)
        changes=[
            "UPDATE ljudi SET imja='Changed person'WHERE id=4900081",
            "UPDATE sotrudnichestva SET vyplacheno=0 WHERE id=4900081",
            "UPDATE zhurnal SET stalo='Changed'WHERE obekt_id=4900081",
            "UPDATE migracii SET sha256='"+'a'*64+"'WHERE nomer=130",
            "UPDATE versii_polej SET kogda='Changed'WHERE tablica='sotrudnichestva'AND obekt_id=4900081",
            "UPDATE sqlite_sequence SET seq=seq+1 WHERE name='zhurnal'",
            "DROP TRIGGER versii_zadachi_delete;CREATE TRIGGER versii_zadachi_delete AFTER DELETE ON zadachi BEGIN SELECT 1;END",
            "ALTER TABLE referalnye_svjazi_vyplat ADD COLUMN rogue TEXT",
            "CREATE TABLE rogue(id INTEGER)",
        ]
        for statement in changes:
            with self.subTest(statement=statement.split()[:3]):
                shutil.copyfile(good,database)
                with contextlib.closing(sqlite3.connect(database))as db:db.executescript(statement)
                with self.assertRaises(ValueError):ops.check_migration_counts(before,ops.db_state(database),self.app,before_file)
        shutil.copyfile(good,database)
        with contextlib.closing(sqlite3.connect(database))as writer:
            writer.execute("UPDATE ljudi SET imja='Uncheckpointed WAL'WHERE id=4900081");writer.commit()
            with self.assertRaisesRegex(ValueError,'closed standalone snapshot'):ops.verify_referral_payout_links(before_file,database,self.app)

    def test_referral_task_migration_preserves_history_and_adds_only_unknown_lead_and_empty_tables(self):
        database=self.app/'db/locus.db';before_file=self.base/'before-referral-tasks.db'
        with contextlib.closing(sqlite3.connect(database))as db:
            db.execute("INSERT INTO ljudi(id,imja)VALUES(4900081,'Referral tasks preservation fixture')")
            db.execute("INSERT INTO zadachi(id,nomer,nazvanie,napravlenie,otvetstvennyj)VALUES(4900081,4900081,'Original task','synapt',4900081)")
            for name in ['versii_napravlenija_update','versii_napravlenija_delete','versii_zadachi_delete','versii_sotrudnichestva_delete']:db.execute('DROP TRIGGER '+name)
            db.execute('DROP TABLE referalnye_zadachi');db.execute('DROP TABLE zaprosy_referalnyh_zadach');db.execute('ALTER TABLE napravlenija DROP COLUMN veduschij_id');db.execute('DELETE FROM migracii WHERE nomer=129');db.commit()
        program="const{DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(process.env.LOCUS_BAZA);require('./db/versii.js').ustanovit(db);db.close();"
        subprocess.run(['node','-e',program],cwd=self.app,env=dict(os.environ,LOCUS_BAZA=str(database)),check=True,capture_output=True)
        with contextlib.closing(sqlite3.connect(database))as db,contextlib.closing(sqlite3.connect(before_file))as dest:db.backup(dest)
        before=ops.db_state(before_file)
        subprocess.run(['node','db/migrate.js'],cwd=self.app,env=dict(os.environ,LOCUS_BAZA=str(database)),check=True,capture_output=True)
        ops.check_migration_counts(before,ops.db_state(database),self.app,before_file)
        proof=ops.verify_referral_tasks(before_file,database,self.app);self.assertTrue(proof['exact_referral_tasks_schema_verified']);self.assertEqual(proof['invented_direction_leads'],0)
        good=self.base/'good-referral-tasks.db';shutil.copyfile(database,good)
        changes=[
            "UPDATE ljudi SET imja='Changed person'WHERE id=4900081",
            "UPDATE zadachi SET nazvanie='Changed task'WHERE id=4900081",
            "UPDATE napravlenija SET veduschij_id=4900081 WHERE kod='synapt'",
            "INSERT INTO referalnye_zadachi(zadacha_id,sotrudnichestvo_id,chelovek_id,napravlenie,vid,period_s,period_po,summa,sozdano)VALUES(4900081,1,4900081,'synapt','vyplata','2026-11-01','2026-11-30',12.34,'2026-11-18')",
            "INSERT INTO zaprosy_referalnyh_zadach(avtor,kljuch_hesh,sotrudnichestvo_id,sozdano)VALUES(4900081,'"+'a'*64+"',1,'2026-11-18')",
            "UPDATE migracii SET sha256='"+'a'*64+"'WHERE nomer=129",
            "UPDATE versii_polej SET kogda='Changed'WHERE tablica='zadachi'AND obekt_id=4900081",
            "UPDATE sqlite_sequence SET seq=seq+1 WHERE name='zadachi'",
            "DROP TRIGGER versii_zadachi_delete;CREATE TRIGGER versii_zadachi_delete AFTER DELETE ON zadachi BEGIN SELECT 1;END",
            "ALTER TABLE referalnye_zadachi ADD COLUMN rogue TEXT",
            "ALTER TABLE napravlenija ADD COLUMN rogue TEXT",
            "CREATE TABLE rogue(id INTEGER)",
        ]
        for statement in changes:
            with self.subTest(statement=statement.split()[:3]):
                shutil.copyfile(good,database)
                with contextlib.closing(sqlite3.connect(database))as db:db.executescript(statement)
                with self.assertRaises(ValueError):ops.check_migration_counts(before,ops.db_state(database),self.app,before_file)
        shutil.copyfile(good,database)
        with contextlib.closing(sqlite3.connect(database))as writer:
            writer.execute("UPDATE ljudi SET imja='Uncheckpointed WAL'WHERE id=4900081");writer.commit()
            with self.assertRaisesRegex(ValueError,'closed standalone snapshot'):ops.verify_referral_tasks(before_file,database,self.app)

    def test_referral_payout_receipts_preserve_all_old_values_history_and_exact_schema(self):
        database=self.app/'db/locus.db';before_file=self.base/'before-referral-payout.db'
        with contextlib.closing(sqlite3.connect(database))as db:
            db.execute("INSERT INTO ljudi(id,imja)VALUES(4900081,'Referral preservation fixture')")
            db.execute("INSERT INTO sotrudnichestva(id,chelovek_id,napravlenie,rol,vyplacheno)VALUES(4900081,4900081,'synapt','referal',12345.67)")
            db.execute("INSERT INTO zhurnal(obekt,obekt_id,pole,bylo,stalo,kto,kogda)VALUES('sotrudnichestvo',4900081,'vyplacheno','0','12345.67',4900081,'2026-11-10')")
            trigger=db.execute("SELECT sql FROM sqlite_master WHERE name='versii_sotrudnichestva_delete'").fetchone()[0].replace('\n        UPDATE zaprosy_vyplat_referalam SET udaleno=1 WHERE sotrudnichestvo_id=OLD.id;','')
            db.execute('DROP TRIGGER versii_sotrudnichestva_delete');db.execute(trigger);db.execute('DROP TABLE zaprosy_vyplat_referalam');db.execute('DELETE FROM migracii WHERE nomer=127');db.commit()
            with contextlib.closing(sqlite3.connect(before_file))as dest:db.backup(dest)
        before=ops.db_state(before_file)
        subprocess.run(['node','db/migrate.js'],cwd=self.app,env=dict(os.environ,LOCUS_BAZA=str(database)),check=True,capture_output=True)
        ops.check_migration_counts(before,ops.db_state(database),self.app,before_file)
        self.assertTrue(ops.verify_referral_payout_receipts(before_file,database,self.app)['exact_referral_payout_schema_verified'])
        good=self.base/'good-referral-payout.db';shutil.copyfile(database,good)
        changes=[
            "UPDATE sotrudnichestva SET vyplacheno=12345.68 WHERE id=4900081",
            "UPDATE ljudi SET imja='Changed person'WHERE id=4900081",
            "UPDATE zhurnal SET stalo='Changed history'WHERE obekt_id=4900081",
            "UPDATE versii_polej SET kogda='Changed metadata'WHERE tablica='sotrudnichestva'AND obekt_id=4900081",
            "UPDATE migracii SET sha256='"+'a'*64+"'WHERE nomer=127",
            "INSERT INTO zaprosy_vyplat_referalam(avtor,kljuch_hesh,sotrudnichestvo_id,sozdano)VALUES(4900081,'"+'a'*64+"',4900081,'2026-11-18')",
            "DROP TRIGGER versii_sotrudnichestva_delete;CREATE TRIGGER versii_sotrudnichestva_delete AFTER DELETE ON sotrudnichestva BEGIN SELECT 1;END",
            "ALTER TABLE zaprosy_vyplat_referalam ADD COLUMN rogue TEXT",
            "CREATE TABLE rogue(id INTEGER)",
        ]
        for statement in changes:
            with self.subTest(statement=statement.split()[:3]):
                shutil.copyfile(good,database)
                with contextlib.closing(sqlite3.connect(database))as db:db.executescript(statement)
                with self.assertRaises(ValueError):ops.check_migration_counts(before,ops.db_state(database),self.app,before_file)
        shutil.copyfile(good,database)
        with contextlib.closing(sqlite3.connect(database))as writer:
            writer.execute("UPDATE ljudi SET imja='Uncheckpointed WAL'WHERE id=4900081");writer.commit()
            self.assertGreater(Path(str(database)+'-wal').stat().st_size,0)
            with self.assertRaisesRegex(ValueError,'closed standalone snapshot'):ops.verify_referral_payout_receipts(before_file,database,self.app)

    def test_referral_terms_receipts_preserve_all_old_values_history_and_exact_schema(self):
        database=self.app/'db/locus.db';before_file=self.base/'before-referral-terms.db'
        with contextlib.closing(sqlite3.connect(database))as db:
            db.execute("INSERT INTO ljudi(id,imja)VALUES(4900081,'Referral preservation fixture')")
            db.execute("INSERT INTO sotrudnichestva(id,chelovek_id,napravlenie,rol,vyplacheno)VALUES(4900081,4900081,'synapt','referal',12345.67)")
            db.execute("INSERT INTO zhurnal(obekt,obekt_id,pole,bylo,stalo,kto,kogda)VALUES('sotrudnichestvo',4900081,'vyplacheno','0','12345.67',4900081,'2026-11-10')")
            trigger=db.execute("SELECT sql FROM sqlite_master WHERE name='versii_sotrudnichestva_delete'").fetchone()[0].replace('\n        UPDATE zaprosy_uslovij_referalov SET udaleno=1 WHERE sotrudnichestvo_id=OLD.id;','')
            db.execute('DROP TRIGGER versii_sotrudnichestva_delete');db.execute(trigger);db.execute('DROP TABLE zaprosy_uslovij_referalov');db.execute('DELETE FROM migracii WHERE nomer=128');db.commit()
            with contextlib.closing(sqlite3.connect(before_file))as dest:db.backup(dest)
        before=ops.db_state(before_file)
        subprocess.run(['node','db/migrate.js'],cwd=self.app,env=dict(os.environ,LOCUS_BAZA=str(database)),check=True,capture_output=True)
        ops.check_migration_counts(before,ops.db_state(database),self.app,before_file)
        self.assertTrue(ops.verify_referral_terms_receipts(before_file,database,self.app)['exact_referral_terms_schema_verified'])
        good=self.base/'good-referral-terms.db';shutil.copyfile(database,good)
        changes=[
            "UPDATE sotrudnichestva SET vyplacheno=12345.68 WHERE id=4900081",
            "UPDATE ljudi SET imja='Changed person'WHERE id=4900081",
            "UPDATE zhurnal SET stalo='Changed history'WHERE obekt_id=4900081",
            "UPDATE versii_polej SET kogda='Changed metadata'WHERE tablica='sotrudnichestva'AND obekt_id=4900081",
            "UPDATE migracii SET sha256='"+'a'*64+"'WHERE nomer=128",
            "INSERT INTO zaprosy_uslovij_referalov(avtor,kljuch_hesh,sotrudnichestvo_id,sozdano)VALUES(4900081,'"+'a'*64+"',4900081,'2026-11-18')",
            "DROP TRIGGER versii_sotrudnichestva_delete;CREATE TRIGGER versii_sotrudnichestva_delete AFTER DELETE ON sotrudnichestva BEGIN SELECT 1;END",
            "ALTER TABLE zaprosy_uslovij_referalov ADD COLUMN rogue TEXT",
            "CREATE TABLE rogue(id INTEGER)",
        ]
        for statement in changes:
            with self.subTest(statement=statement.split()[:3]):
                shutil.copyfile(good,database)
                with contextlib.closing(sqlite3.connect(database))as db:db.executescript(statement)
                with self.assertRaises(ValueError):ops.check_migration_counts(before,ops.db_state(database),self.app,before_file)
        shutil.copyfile(good,database)
        with contextlib.closing(sqlite3.connect(database))as writer:
            writer.execute("UPDATE ljudi SET imja='Uncheckpointed WAL'WHERE id=4900081");writer.commit()
            self.assertGreater(Path(str(database)+'-wal').stat().st_size,0)
            with self.assertRaisesRegex(ValueError,'closed standalone snapshot'):ops.verify_referral_terms_receipts(before_file,database,self.app)

    def test_service_migration_preserves_original_values_and_adds_only_unknown_dates_and_empty_receipts(self):
        database=self.app/'db/locus.db';before_file=self.base/'before-service-receipts.db'
        with contextlib.closing(sqlite3.connect(database))as db:
            db.execute("INSERT INTO ljudi(id,imja)VALUES(4900071,'Service migration fixture')")
            db.execute("INSERT INTO uslugi(id,napravlenie,nazvanie,opisanie,cena,porjadok,arhiv)VALUES(4900071,'synapt','Old service','Preserved description',12345.67,1,1)")
            for action in ['insert','update','delete']:db.execute('DROP TRIGGER versii_uslugi_'+action)
            db.execute("DELETE FROM versii_polej WHERE tablica='uslugi'AND pole IN ('arhiv_s','vozvrat_s')")
            db.execute('ALTER TABLE uslugi DROP COLUMN arhiv_s');db.execute('ALTER TABLE uslugi DROP COLUMN vozvrat_s')
            db.execute('DROP TABLE zaprosy_dejstvij_uslug');db.execute('DELETE FROM migracii WHERE nomer=126');db.commit()
        program="const{DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(process.env.LOCUS_BAZA);require('./db/versii.js').ustanovit(db);db.close();"
        subprocess.run(['node','-e',program],cwd=self.app,env=dict(os.environ,LOCUS_BAZA=str(database)),check=True,capture_output=True)
        with contextlib.closing(sqlite3.connect(database))as db,contextlib.closing(sqlite3.connect(before_file))as dest:db.backup(dest)
        before=ops.db_state(before_file)
        subprocess.run(['node','db/migrate.js'],cwd=self.app,env=dict(os.environ,LOCUS_BAZA=str(database)),check=True,capture_output=True)
        ops.check_migration_counts(before,ops.db_state(database),self.app,before_file)
        proof=ops.verify_service_receipts(before_file,database,self.app);self.assertTrue(proof['exact_service_schema_verified']);self.assertTrue(proof['historical_archive_dates_remain_unknown'])
        good=self.base/'good-service-receipts.db';shutil.copyfile(database,good)
        changes=[
            "UPDATE uslugi SET cena=12345.68 WHERE id=4900071",
            "UPDATE uslugi SET opisanie='Changed old value'WHERE id=4900071",
            "UPDATE uslugi SET arhiv_s='2026-11-17'WHERE id=4900071",
            "UPDATE versii_polej SET kogda='Changed old history'WHERE tablica='uslugi'AND obekt_id=4900071",
            "UPDATE migracii SET sha256='"+'a'*64+"'WHERE nomer=126",
            "INSERT INTO zaprosy_dejstvij_uslug(avtor,kljuch_hesh,napravlenie,usluga_id,dejstvie,sozdano)VALUES(4900071,'"+'a'*64+"','synapt',0,'sozdanie','2026-11-17')",
            "DROP TRIGGER versii_uslugi_delete;CREATE TRIGGER versii_uslugi_delete AFTER DELETE ON uslugi BEGIN SELECT 1;END",
            "ALTER TABLE uslugi ADD COLUMN undeclared TEXT",
            "CREATE TABLE undeclared(id INTEGER)",
        ]
        for statement in changes:
            with self.subTest(statement=statement.split()[0:3]):
                shutil.copyfile(good,database)
                with contextlib.closing(sqlite3.connect(database))as db:db.executescript(statement)
                with self.assertRaises(ValueError):ops.check_migration_counts(before,ops.db_state(database),self.app,before_file)
        shutil.copyfile(good,database)
        with contextlib.closing(sqlite3.connect(database))as writer:
            writer.execute("UPDATE ljudi SET imja='Uncheckpointed WAL'WHERE id=4900071");writer.commit()
            self.assertGreater(Path(str(database)+'-wal').stat().st_size,0)
            with self.assertRaisesRegex(ValueError,'closed standalone snapshot'):ops.verify_service_receipts(before_file,database,self.app)

    def test_project_action_receipt_migration_preserves_all_original_values_and_exact_schema(self):
        database=self.app/'db/locus.db';before_file=self.base/'before-project-action-receipts.db'
        with contextlib.closing(sqlite3.connect(database)) as db:
            db.execute("INSERT INTO ljudi(id,imja)VALUES(4900061,'Project migration fixture')")
            db.execute("INSERT INTO proekty(id,nazvanie,klient_id,napravlenie,status,stoimost)VALUES(4900061,'Old project',4900061,'synapt','idet',12345.67)")
            old_trigger=db.execute("SELECT sql FROM sqlite_master WHERE name='versii_proekty_delete'").fetchone()[0].replace('\n        UPDATE zaprosy_dejstvij_proektov SET udaleno=1 WHERE proekt_id=OLD.id;','')
            db.execute('DROP TRIGGER versii_proekty_delete');db.execute(old_trigger)
            db.execute('DROP TABLE zaprosy_dejstvij_proektov');db.execute('DELETE FROM migracii WHERE nomer=125');db.commit()
            with contextlib.closing(sqlite3.connect(before_file)) as target:db.backup(target)
        before=ops.db_state(before_file)
        subprocess.run(['node','db/migrate.js'],cwd=self.app,env=dict(os.environ,LOCUS_BAZA=str(database)),check=True,capture_output=True)
        ops.check_migration_counts(before,ops.db_state(database),self.app,before_file)
        self.assertTrue(ops.verify_project_action_receipts(before_file,database,self.app)['exact_project_action_schema_verified'])
        good=self.base/'good-project-action-receipts.db';shutil.copyfile(database,good)
        changes=[
            "UPDATE proekty SET stoimost=12345.68 WHERE id=4900061",
            "UPDATE ljudi SET imja='Changed customer' WHERE id=4900061",
            "UPDATE versii_polej SET kogda='Changed history' WHERE tablica='proekty' AND obekt_id=4900061",
            "UPDATE migracii SET sha256='"+'a'*64+"' WHERE nomer=125",
            "INSERT INTO zaprosy_dejstvij_proektov(avtor,kljuch_hesh,proekt_id,dejstvie,sozdano)VALUES(4900061,'"+'a'*64+"',4900061,'arhiv','2026-11-17')",
            "DROP TRIGGER versii_proekty_delete;CREATE TRIGGER versii_proekty_delete AFTER DELETE ON proekty BEGIN SELECT 1;END",
        ]
        for statement in changes:
            with self.subTest(statement=statement.split()[0:3]):
                shutil.copyfile(good,database)
                with contextlib.closing(sqlite3.connect(database)) as db:db.executescript(statement)
                with self.assertRaises(ValueError):ops.check_migration_counts(before,ops.db_state(database),self.app,before_file)
        shutil.copyfile(good,database)
        with contextlib.closing(sqlite3.connect(database)) as writer:
            writer.execute("UPDATE ljudi SET imja='Uncheckpointed WAL' WHERE id=4900061");writer.commit()
            self.assertGreater(Path(str(database)+'-wal').stat().st_size,0)
            with self.assertRaisesRegex(ValueError,'closed standalone snapshot'):ops.verify_project_action_receipts(before_file,database,self.app)

    def test_project_edit_receipt_migration_preserves_all_original_values_and_exact_schema(self):
        database=self.app/'db/locus.db';before_file=self.base/'before-project-edit-receipts.db'
        with contextlib.closing(sqlite3.connect(database)) as db:
            db.execute("INSERT INTO ljudi(id,imja)VALUES(4900061,'Project migration fixture')")
            db.execute("INSERT INTO proekty(id,nazvanie,klient_id,napravlenie,status,stoimost)VALUES(4900061,'Old project',4900061,'synapt','idet',12345.67)")
            old_trigger=db.execute("SELECT sql FROM sqlite_master WHERE name='versii_proekty_delete'").fetchone()[0].replace('\n        UPDATE zaprosy_pravok_proektov SET udaleno=1 WHERE proekt_id=OLD.id;','')
            db.execute('DROP TRIGGER versii_proekty_delete');db.execute(old_trigger)
            db.execute('DROP TABLE zaprosy_pravok_proektov');db.execute('DELETE FROM migracii WHERE nomer=124');db.commit()
            with contextlib.closing(sqlite3.connect(before_file)) as target:db.backup(target)
        before=ops.db_state(before_file)
        subprocess.run(['node','db/migrate.js'],cwd=self.app,env=dict(os.environ,LOCUS_BAZA=str(database)),check=True,capture_output=True)
        ops.check_migration_counts(before,ops.db_state(database),self.app,before_file)
        self.assertTrue(ops.verify_project_edit_receipts(before_file,database,self.app)['exact_project_edit_schema_verified'])
        good=self.base/'good-project-edit-receipts.db';shutil.copyfile(database,good)
        changes=[
            "UPDATE proekty SET stoimost=12345.68 WHERE id=4900061",
            "UPDATE ljudi SET imja='Changed customer' WHERE id=4900061",
            "UPDATE versii_polej SET kogda='Changed history' WHERE tablica='proekty' AND obekt_id=4900061",
            "UPDATE migracii SET sha256='"+'a'*64+"' WHERE nomer=124",
            "INSERT INTO zaprosy_pravok_proektov(avtor,kljuch_hesh,proekt_id,sozdano)VALUES(4900061,'"+'a'*64+"',4900061,'2026-11-17')",
            "DROP TRIGGER versii_proekty_delete;CREATE TRIGGER versii_proekty_delete AFTER DELETE ON proekty BEGIN SELECT 1;END",
        ]
        for statement in changes:
            with self.subTest(statement=statement.split()[0:3]):
                shutil.copyfile(good,database)
                with contextlib.closing(sqlite3.connect(database)) as db:db.executescript(statement)
                with self.assertRaises(ValueError):ops.check_migration_counts(before,ops.db_state(database),self.app,before_file)
        shutil.copyfile(good,database)
        with contextlib.closing(sqlite3.connect(database)) as writer:
            writer.execute("UPDATE ljudi SET imja='Uncheckpointed WAL' WHERE id=4900061");writer.commit()
            self.assertGreater(Path(str(database)+'-wal').stat().st_size,0)
            with self.assertRaisesRegex(ValueError,'closed standalone snapshot'):ops.verify_project_edit_receipts(before_file,database,self.app)

    def test_project_receipt_migration_preserves_all_original_values_and_exact_schema(self):
        database=self.app/'db/locus.db';before_file=self.base/'before-project-receipts.db'
        with contextlib.closing(sqlite3.connect(database)) as db:
            db.execute("INSERT INTO ljudi(id,imja)VALUES(4900051,'Project migration fixture')")
            db.execute("INSERT INTO proekty(id,nazvanie,klient_id,napravlenie,status,stoimost)VALUES(4900051,'Old project',4900051,'synapt','idet',12345.67)")
            old_trigger=db.execute("SELECT sql FROM sqlite_master WHERE name='versii_proekty_delete'").fetchone()[0].replace('\n        UPDATE zaprosy_proektov SET udaleno=1 WHERE zapis_id=OLD.id;','')
            db.execute('DROP TRIGGER versii_proekty_delete');db.execute(old_trigger)
            db.execute('DROP TABLE zaprosy_proektov');db.execute('DELETE FROM migracii WHERE nomer=123');db.commit()
            with contextlib.closing(sqlite3.connect(before_file)) as target:db.backup(target)
        before=ops.db_state(before_file)
        subprocess.run(['node','db/migrate.js'],cwd=self.app,env=dict(os.environ,LOCUS_BAZA=str(database)),check=True,capture_output=True)
        ops.check_migration_counts(before,ops.db_state(database),self.app,before_file)
        self.assertTrue(ops.verify_project_receipts(before_file,database,self.app)['exact_project_schema_verified'])
        good=self.base/'good-project-receipts.db';shutil.copyfile(database,good)
        changes=[
            "UPDATE proekty SET stoimost=12345.68 WHERE id=4900051",
            "UPDATE ljudi SET imja='Changed customer' WHERE id=4900051",
            "UPDATE versii_polej SET kogda='Changed history' WHERE tablica='proekty' AND obekt_id=4900051",
            "UPDATE migracii SET sha256='"+'a'*64+"' WHERE nomer=123",
            "INSERT INTO zaprosy_proektov(avtor,kljuch_hesh,tablica,vladelec_id,zapis_id,sozdano)VALUES(4900051,'"+'a'*64+"','proekty',4900051,0,'2026-11-17')",
            "DROP TRIGGER versii_proekty_delete;CREATE TRIGGER versii_proekty_delete AFTER DELETE ON proekty BEGIN SELECT 1;END",
        ]
        for statement in changes:
            with self.subTest(statement=statement.split()[0:3]):
                shutil.copyfile(good,database)
                with contextlib.closing(sqlite3.connect(database)) as db:db.executescript(statement)
                with self.assertRaises(ValueError):ops.check_migration_counts(before,ops.db_state(database),self.app,before_file)
        shutil.copyfile(good,database)
        with contextlib.closing(sqlite3.connect(database)) as writer:
            writer.execute("UPDATE ljudi SET imja='Uncheckpointed WAL' WHERE id=4900051");writer.commit()
            self.assertGreater(Path(str(database)+'-wal').stat().st_size,0)
            with self.assertRaisesRegex(ValueError,'closed standalone snapshot'):ops.verify_project_receipts(before_file,database,self.app)

    def test_template_step_migration_allows_only_exact_history_and_declared_schema(self):
        database=self.app/'db/locus.db';before_file=self.base/'before-template-steps.db'
        with sqlite3.connect(database) as db:
            db.execute("INSERT INTO ljudi(id,imja) VALUES(4900041,'Template migration fixture')")
            db.execute("INSERT INTO shablony(nazvanie,avtor,schitat_fakt,obschij) VALUES('Existing template',4900041,'net',0)")
            template=db.execute("SELECT id FROM shablony WHERE avtor=4900041").fetchone()[0]
            db.execute("INSERT INTO shablon_podzadachi(shablon_id,nazvanie,porjadok) VALUES(?,'Existing step',1)",(template,))
            for action in ['insert','update','delete']:db.execute('DROP TRIGGER versii_shablon_shagi_'+action)
            db.execute("DELETE FROM versii_polej WHERE tablica='shablony' AND pole='podzadachi'")
            db.execute('DROP TABLE zaprosy_shablonov');db.execute('DELETE FROM migracii WHERE nomer=122');db.commit()
            with contextlib.closing(sqlite3.connect(before_file)) as target:db.backup(target)
        db.close()
        before=ops.db_state(before_file)
        subprocess.run(['node','db/migrate.js'],cwd=self.app,env=dict(os.environ,LOCUS_BAZA=str(database)),check=True,capture_output=True)
        ops.check_migration_counts(before,ops.db_state(database),self.app,before_file)
        proof=ops.verify_template_steps(before_file,database,self.app)
        self.assertEqual(proof['added_metadata_rows'],before['counts']['shablony'])
        self.assertTrue(proof['exact_template_schema_verified'])
        good=self.base/'good-template-steps.db';shutil.copyfile(database,good)
        changes=[
            "UPDATE ljudi SET imja='Changed old name' WHERE id=4900041",
            "UPDATE shablony SET nazvanie='Changed template' WHERE id="+str(template),
            "UPDATE shablon_podzadachi SET nazvanie='Changed step' WHERE shablon_id="+str(template),
            "UPDATE versii_polej SET kogda='Changed history' WHERE tablica='shablony' AND pole=''",
            "UPDATE versii_polej SET versija=99 WHERE tablica='shablony' AND pole='podzadachi'",
            "UPDATE versii_polej SET kogda='2020-01-01' WHERE tablica='shablony' AND pole='podzadachi'",
            "DELETE FROM versii_polej WHERE tablica='shablony' AND pole='podzadachi'",
            "INSERT INTO zaprosy_shablonov(avtor,kljuch_hesh,tablica,vladelec_id,zapis_id,sozdano) VALUES(4900041,'"+'a'*64+"','shablony',4900041,0,'2026-11-17')",
            "DROP TRIGGER versii_shablon_shagi_insert; CREATE TRIGGER versii_shablon_shagi_insert AFTER INSERT ON shablon_podzadachi BEGIN SELECT 1; END",
            "UPDATE migracii SET sha256='"+'a'*64+"' WHERE nomer=122",
        ]
        for statement in changes:
            with self.subTest(statement=statement.split()[0:3]):
                shutil.copyfile(good,database)
                with sqlite3.connect(database) as db:db.executescript(statement)
                db.close()
                with self.assertRaises(ValueError):ops.check_migration_counts(before,ops.db_state(database),self.app,before_file)
        shutil.copyfile(good,database)
        writer=sqlite3.connect(database)
        try:
            writer.execute("UPDATE ljudi SET imja='Uncheckpointed WAL' WHERE id=4900041");writer.commit()
            self.assertGreater(Path(str(database)+'-wal').stat().st_size,0)
            with self.assertRaisesRegex(ValueError,'closed standalone snapshot'):ops.verify_template_steps(before_file,database,self.app)
        finally:writer.close()

    def test_payment_version_migration_allows_only_exact_service_metadata(self):
        database=self.app/'db/locus.db';before_file=self.base/'before-payment-versions.db'
        db=sqlite3.connect(database)
        try:
            db.execute("INSERT INTO ljudi(id,imja) VALUES(4900001,'Payment migration fixture')")
            db.execute("INSERT INTO proekty(id,nazvanie,klient_id,napravlenie) VALUES(4900001,'Payment migration fixture',4900001,'synapt')")
            db.execute("INSERT INTO platezhi(id,proekt_id,summa,zhdem_do) VALUES(4900001,4900001,120000,'2026-11-20')")
            db.execute("INSERT INTO akkaunty(id,nazvanie,ploshadka,uroven,napravlenie) VALUES(4900001,'Migration account','telegram','public','synapt')")
            for table in ['platezhi','akkaunty']:
                for action in ['insert','update','delete']:db.execute('DROP TRIGGER versii_'+table+'_'+action)
                db.execute('DELETE FROM versii_polej WHERE tablica=?',(table,))
                db.execute('ALTER TABLE '+table+' DROP COLUMN versija')
            db.execute('DROP TABLE zaprosy_platezhej');db.execute('DELETE FROM migracii WHERE nomer=118');db.commit()
            target=sqlite3.connect(before_file)
            try:db.backup(target)
            finally:target.close()
        finally:db.close()
        before=ops.db_state(before_file)
        subprocess.run(['node','db/migrate.js'],cwd=self.app,env=dict(os.environ,LOCUS_BAZA=str(database)),check=True,capture_output=True)
        ops.check_migration_counts(before,ops.db_state(database),self.app,before_file)
        proof=ops.verify_payment_versions(before_file,database);self.assertEqual(proof['added_metadata_rows'],4)
        good=self.base/'good-payment-versions.db';shutil.copyfile(database,good)
        changes=[
            "UPDATE platezhi SET summa=119999 WHERE id=4900001",
            "UPDATE proekty SET nazvanie='Changed old name' WHERE id=4900001",
            "UPDATE versii_polej SET kogda='Changed old metadata' WHERE tablica='ljudi' AND obekt_id=4900001",
            "INSERT INTO versii_polej(tablica,obekt_id,pole,versija,kogda) VALUES('platezhi',4900001,'summa',1,'2026-11-15')",
            "INSERT INTO zaprosy_platezhej(avtor,kljuch_hesh,platezh_id,dejstvie,zapros_hesh,otvet,obratno,sozdano) VALUES(4900001,'"+'a'*64+"',4900001,'prishlo','"+'b'*64+"','{}','{}','2026-11-15')",
        ]
        for statement in changes:
            with self.subTest(statement=statement.split()[0:3]):
                shutil.copyfile(good,database);db=sqlite3.connect(database)
                try:db.execute(statement);db.commit()
                finally:db.close()
                with self.assertRaises(ValueError):ops.check_migration_counts(before,ops.db_state(database),self.app,before_file)

    def test_direction_version_migration_allows_only_exact_service_metadata(self):
        database=self.app/'db/locus.db';before_file=self.base/'before-direction-versions.db'
        db=sqlite3.connect(database)
        try:
            db.execute("INSERT INTO ljudi(id,imja) VALUES(4900021,'Direction migration fixture')")
            for action in ['insert','update','delete']:db.execute('DROP TRIGGER versii_napravlenija_'+action)
            db.execute("DELETE FROM versii_polej WHERE tablica='napravlenija'")
            db.execute('ALTER TABLE napravlenija DROP COLUMN versija')
            for action in ['insert','update','delete']:db.execute('DROP TRIGGER versii_ljudi_'+action)
            db.execute('ALTER TABLE ljudi DROP COLUMN vozvrat_s')
            db.execute('DELETE FROM migracii WHERE nomer=119');db.commit()
            target=sqlite3.connect(before_file)
            try:db.backup(target)
            finally:target.close()
        finally:db.close()
        before=ops.db_state(before_file)
        subprocess.run(['node','db/migrate.js'],cwd=self.app,env=dict(os.environ,LOCUS_BAZA=str(database)),check=True,capture_output=True)
        ops.check_migration_counts(before,ops.db_state(database),self.app,before_file)
        proof=ops.verify_direction_versions(before_file,database);self.assertEqual(proof['added_metadata_rows'],before['counts']['napravlenija']*2)
        good=self.base/'good-direction-versions.db';shutil.copyfile(database,good)
        changes=[
            "UPDATE napravlenija SET nazvanie='Changed old name' WHERE kod='synapt'",
            "UPDATE ljudi SET imja='Changed old person' WHERE id=4900021",
            "UPDATE versii_polej SET kogda='Changed old metadata' WHERE tablica='ljudi'",
            "INSERT INTO versii_polej(tablica,obekt_id,pole,versija,kogda) VALUES('napravlenija','synapt','arhiv',1,'2026-11-16')",
            "UPDATE napravlenija SET versija=2 WHERE kod='synapt'",
        ]
        for statement in changes:
            with self.subTest(statement=statement.split()[0:3]):
                shutil.copyfile(good,database);db=sqlite3.connect(database)
                try:db.execute(statement);db.commit()
                finally:db.close()
                with self.assertRaises(ValueError):ops.check_migration_counts(before,ops.db_state(database),self.app,before_file)

    def dictionary_source(self):
        columns=json.loads(subprocess.check_output(['node','-e',"console.log(JSON.stringify(require('./ops/legacy-dictionaries.cjs').COLUMNS))"],cwd=APP,text=True))
        source=self.base/'dictionary-source.db'
        with sqlite3.connect(source) as db:
            for table,names in columns.items():db.execute('CREATE TABLE '+table+' ('+','.join(n+' TEXT' for n in names)+')')
            db.execute("INSERT INTO base_person(id,name,tg,email) VALUES('fixture','Imported person','@import_fixture','fixture@example.test')")
        source.chmod(0o600)
        with sqlite3.connect(self.app/'db/locus.db') as db:db.execute("INSERT INTO ljudi(id,imja,imja_norm,komanda,dostup,versija) VALUES(1,'Operator','operator',1,'polnyj',1)")
        return source

    def test_dictionary_import_trial_and_append_only_production_with_maintenance(self):
        source=self.dictionary_source()
        with patch.object(legacy_import.ops,'DEPLOY_ROOT',self.app),patch.object(legacy_import.ops,'service_action') as service,patch.object(legacy_import,'health'):
            result=legacy_import.run(self.app,source,self.base/'imports',1)
        self.assertTrue(result['opened']);self.assertEqual(result['imported']['created_people'],1)
        self.assertTrue(result['verification']['all_original_rows_preserved'])
        self.assertEqual([call.args[1] for call in service.call_args_list],['stop','start'])
        self.assertFalse((self.app/'ops/maintenance.json').exists())
        with sqlite3.connect(self.app/'db/locus.db') as db:self.assertEqual(db.execute('SELECT count(*) FROM import_svjazi').fetchone()[0],1)

    def test_dictionary_import_failed_health_restores_every_original_row_before_reopening(self):
        source=self.dictionary_source();before=self.base/'original.db'
        with sqlite3.connect(self.app/'db/locus.db') as db,sqlite3.connect(before) as target:db.backup(target)
        with patch.object(legacy_import.ops,'DEPLOY_ROOT',self.app),patch.object(legacy_import.ops,'service_action') as service,patch.object(legacy_import,'health',side_effect=ValueError('fixture health failure')):
            with self.assertRaisesRegex(ValueError,'fixture health failure'):legacy_import.run(self.app,source,self.base/'imports',1)
        legacy_import.verify_append_only(before,self.app/'db/locus.db',{'created_people':0,'created_contacts':0,'created_accounts':0,'mappings_added':0})
        self.assertFalse((self.app/'ops/maintenance.json').exists())
        self.assertEqual([call.args[1] for call in service.call_args_list],['stop','start','stop','start'])
        report=json.loads(next((self.base/'imports').glob('*/result.json')).read_text());self.assertTrue(report['rolled_back']);self.assertFalse(report['opened'])

    def test_dictionary_import_rejected_trial_never_stops_service(self):
        source=self.dictionary_source()
        with patch.object(legacy_import.ops,'DEPLOY_ROOT',self.app),patch.object(legacy_import.ops,'service_action') as service:
            with self.assertRaisesRegex(ValueError,'Existing import actor required'):legacy_import.run(self.app,source,self.base/'imports',999999)
        service.assert_not_called();self.assertFalse((self.app/'ops/maintenance.json').exists())
        with sqlite3.connect(self.app/'db/locus.db') as db:self.assertEqual(db.execute('SELECT count(*) FROM ljudi').fetchone()[0],1)

    def test_dictionary_import_rejects_wrong_target_and_public_source(self):
        source=self.dictionary_source()
        with self.assertRaisesRegex(ValueError,'not authorised'):legacy_import.run(self.app,source,self.base/'imports',1)
        source.chmod(0o644)
        with patch.object(legacy_import.ops,'DEPLOY_ROOT',self.app):
            with self.assertRaisesRegex(ValueError,'private external source'):legacy_import.run(self.app,source,self.base/'imports',1)

    def test_dictionary_stop_failure_keeps_database_and_resumes_original_service(self):
        source=self.dictionary_source()
        with patch.object(legacy_import.ops,'DEPLOY_ROOT',self.app),patch.object(legacy_import.ops,'service_action',side_effect=[ValueError('fixture stop failure'),None]) as service:
            with self.assertRaisesRegex(ValueError,'fixture stop failure'):legacy_import.run(self.app,source,self.base/'imports',1)
        self.assertFalse((self.app/'ops/maintenance.json').exists());self.assertEqual([c.args[1] for c in service.call_args_list],['stop','start'])
        with sqlite3.connect(self.app/'db/locus.db') as db:self.assertEqual(db.execute('SELECT count(*) FROM ljudi').fetchone()[0],1)

    def test_release_stop_failure_keeps_code_and_database_and_removes_maintenance(self):
        names=ops.runtime_files(self.app);manifest={'format':1,'revision':'fixture-stop','files':{n:ops.sha(self.app/n) for n in names}}
        ops.write_json(self.base/'release-manifest.json',manifest);archive=self.base/'release.tar.gz'
        with tarfile.open(archive,'w:gz') as tar:
            for name in names:tar.add(self.app/name,arcname=name)
            tar.add(self.base/'release-manifest.json',arcname='release-manifest.json')
        before=ops.db_state(self.app/'db/locus.db')
        with patch.object(ops,'DEPLOY_ROOT',self.app),patch.object(ops,'service_action',side_effect=[ValueError('fixture release stop failure'),None]) as service:
            with self.assertRaisesRegex(ValueError,'fixture release stop failure'):ops.deploy(self.app,archive,self.base/'releases','locus-novyj',ops.DEPLOY_PORT)
        self.assertFalse((self.app/'ops/maintenance.json').exists());self.assertEqual([c.args[1] for c in service.call_args_list],['stop','start'])
        self.assertEqual(ops.db_state(self.app/'db/locus.db'),before)
        self.assertTrue(all(ops.sha(self.app/n)==digest for n,digest in manifest['files'].items()))

    def test_file_error_reports_and_delivery_receipts_survive_app_restore(self):
        directory=self.app/'db/operational';(directory/'reports').mkdir(parents=True)
        event={'id':'fixture-report','kind':'ruchnaja','tekst':'Keep the original report','at':'2026-11-20T08:00:00Z'}
        (directory/'errors.jsonl').write_text(json.dumps(event)+'\n')
        receipt={'id':'fixture-report','log':'ok','telegram':'unknown','event':event}
        (directory/'reports/fixture-report.json').write_text(json.dumps(receipt))
        (directory/'reports/unfinished.tmp').write_text('not a completed receipt')
        manifest=ops.backup(self.app,self.base/'backup-reports')
        self.assertIn('db/operational/errors.jsonl',manifest['files'])
        self.assertIn('db/operational/reports/fixture-report.json',manifest['files'])
        self.assertNotIn('db/operational/reports/unfinished.tmp',manifest['files'])
        target=self.base/'restored-reports';result=ops.restore(self.base/'backup-reports',target)
        self.assertEqual(json.loads((target/'db/operational/reports/fixture-report.json').read_text()),receipt)
        self.assertEqual(json.loads((target/'db/operational/errors.jsonl').read_text()),event)
        self.assertEqual(result['smoke']['/healthz'],200)

    def test_restore_all_counts_wal_source_and_attachments_and_start(self):
        queue=self.app/'db/sbor-ochered';queue.mkdir(mode=0o700)
        (queue/'pending.json').write_text('{"fixture":"pending before acknowledgment"}')
        (queue/'pending.json').chmod(0o600)
        (queue/'.worker.lock').write_text('not a durable batch')
        db = sqlite3.connect(self.app / 'db/locus.db')
        try:
            db.execute('PRAGMA journal_mode=WAL')
            db.execute('PRAGMA wal_autocheckpoint=0')
            db.execute('CREATE TABLE recovery_probe (value TEXT)')
            db.execute("INSERT INTO recovery_probe VALUES ('committed in WAL')")
            db.commit()
            self.assertGreater((self.app / 'db/locus.db-wal').stat().st_size, 0)
            saved = self.base / 'backup'
            snapshot = ops.backup(self.app, saved)
            result = ops.restore(saved, self.base / 'recovered')
            self.assertEqual(snapshot['state'], result['state'])
            self.assertEqual(result['state']['counts']['recovery_probe'], 1)
            self.assertEqual((self.base / 'recovered/fajly/proof.txt').read_text(), 'actual attachment content')
            self.assertEqual((self.base/'recovered/db/sbor-ochered/pending.json').read_bytes(),(queue/'pending.json').read_bytes())
            self.assertFalse((self.base/'recovered/db/sbor-ochered/.worker.lock').exists())
            self.assertTrue((self.base/'recovered/collector/locus_client.py').is_file())
            self.assertEqual(result['smoke'], {'/healthz': 200, '/login': 200, '/api/zadachi': 401})
            self.assertEqual((saved / 'db/locus.db').stat().st_mode & 0o777, 0o600)
            self.assertEqual(saved.stat().st_mode & 0o777, 0o700)
                                                                            
            self.assertEqual(db.execute('SELECT value FROM recovery_probe').fetchone()[0], 'committed in WAL')
        finally:
            db.close()

    def test_corruption_is_rejected_before_restore_and_live_path_never_overwritten(self):
        saved = self.base / 'backup'
        ops.backup(self.app, saved)
        with self.assertRaisesRegex(ValueError, 'new directory'):
            ops.restore(saved, self.app)
        (saved / 'fajly/proof.txt').write_text('damaged')
        with self.assertRaisesRegex(ValueError, 'checksum mismatch'):
            ops.restore(saved, self.base / 'damaged')
        self.assertFalse((self.base / 'damaged').exists())

    def test_missing_or_extra_file_invalidates_complete_set(self):
        saved = self.base / 'backup'
        ops.backup(self.app, saved)
        (saved / 'unexpected').touch()
        with self.assertRaisesRegex(ValueError, 'file list differs'):
            ops.verify_backup(saved)
        (saved / 'unexpected').unlink()
        (saved / 'public/okr.html').unlink()
        with self.assertRaisesRegex(ValueError, 'file list differs'):
            ops.verify_backup(saved)

    def test_archive_paths_links_and_duplicates_rejected_before_extract(self):
        for kind in ['traversal', 'link', 'duplicate']:
            with self.subTest(kind=kind):
                data = io.BytesIO()
                with tarfile.open(fileobj=data, mode='w') as archive:
                    member = tarfile.TarInfo('../escape' if kind == 'traversal' else 'regular')
                    if kind == 'link':
                        member.type = tarfile.SYMTYPE
                        member.linkname = '/etc/passwd'
                    archive.addfile(member)
                    if kind == 'duplicate':
                        archive.addfile(member)
                data.seek(0)
                target = self.base / kind
                target.mkdir()
                with self.assertRaises(ValueError):
                    ops.safe_extract(data, target)
                self.assertEqual(list(target.iterdir()), [])

    def test_concurrent_operations_do_not_interleave(self):
        with ops.operation_lock(self.app):
            with self.assertRaises(BlockingIOError):
                with ops.operation_lock(self.app):
                    self.fail('second operation acquired the lock')

    def test_normal_release_rejects_silent_record_loss(self):
        before=ops.db_state(self.app/'db/locus.db')
        after=json.loads(json.dumps(before))
        after['counts']['ljudi']+=1
        with self.assertRaisesRegex(ValueError,'record count: ljudi'):
            ops.check_migration_counts(before,after,self.app)
        ops.check_migration_counts(before,before,self.app)

    def test_membership_archival_requires_exact_original_rows_and_types(self):
        before=self.base/'membership-before.db'
        after=self.base/'membership-after.db'
        with sqlite3.connect(before) as db:
            db.executescript("CREATE TABLE ljudi(id INTEGER PRIMARY KEY);CREATE TABLE zadachi(id INTEGER PRIMARY KEY);CREATE TABLE migracii(nomer INTEGER PRIMARY KEY);CREATE TABLE zadacha_uchastniki(zadacha_id INTEGER,chelovek_id INTEGER);INSERT INTO ljudi VALUES(1);INSERT INTO zadachi VALUES(2);INSERT INTO zadacha_uchastniki(rowid,zadacha_id,chelovek_id) VALUES(7,2,1),(9,2,'missing-person');")
        with sqlite3.connect(after) as db:
            db.executescript("CREATE TABLE zadacha_uchastniki(id INTEGER PRIMARY KEY,zadacha_id INTEGER,chelovek_id INTEGER);CREATE TABLE nerazobrannye_svjazi(tablica TEXT,staryj_rowid INTEGER,zadacha_id_istochnika BLOB,chelovek_id_istochnika BLOB);CREATE TABLE migracii(nomer INTEGER PRIMARY KEY);INSERT INTO migracii VALUES(107);INSERT INTO zadacha_uchastniki VALUES(7,2,1);INSERT INTO nerazobrannye_svjazi VALUES('zadacha_uchastniki',9,2,'missing-person');")
        ops.verify_membership_archive(before,after)
        for change in ["UPDATE nerazobrannye_svjazi SET chelovek_id_istochnika='another-person'", "UPDATE nerazobrannye_svjazi SET zadacha_id_istochnika=2.0", "DELETE FROM nerazobrannye_svjazi", "UPDATE zadacha_uchastniki SET chelovek_id=3", "INSERT INTO zadacha_uchastniki VALUES(10,2,4)"]:
            with sqlite3.connect(after) as db:
                db.execute('BEGIN')
                db.execute(change)
                db.commit()
            with self.assertRaisesRegex(ValueError,'original partitions'):
                ops.verify_membership_archive(before,after)
            with sqlite3.connect(after) as db:
                db.executescript("DELETE FROM zadacha_uchastniki;DELETE FROM nerazobrannye_svjazi;INSERT INTO zadacha_uchastniki VALUES(7,2,1);INSERT INTO nerazobrannye_svjazi VALUES('zadacha_uchastniki',9,2,'missing-person');")

    def test_notification_conversion_preserves_every_value_and_unresolved_type(self):
        before=self.base/'notifications-before.db'
        after=self.base/'notifications-after.db'
        with sqlite3.connect(before) as db:
            db.executescript("CREATE TABLE ljudi(id INTEGER PRIMARY KEY);CREATE TABLE zadachi(id INTEGER PRIMARY KEY);CREATE TABLE proekty(id INTEGER PRIMARY KEY);CREATE TABLE lenta(id INTEGER PRIMARY KEY);CREATE TABLE migracii(nomer INTEGER PRIMARY KEY);CREATE TABLE uvedomlenija(id INTEGER PRIMARY KEY AUTOINCREMENT,chelovek_id INTEGER,tip TEXT,potok TEXT,zadacha_id INTEGER,tekst TEXT,prochitano INTEGER,sozdano TEXT);INSERT INTO ljudi VALUES(1);INSERT INTO zadachi VALUES(2);INSERT INTO uvedomlenija VALUES(7,1,'komanda_dobavila_zadachu','pro_menja',2,'Valid',0,'2026-11-12 12:00:00'),(9,1,'zadacha_prosrochena','pro_menja','missing-task','Retain raw identity',1,'2026-11-12 11:00:00');UPDATE sqlite_sequence SET seq=99 WHERE name='uvedomlenija';")
            with sqlite3.connect(after) as target:db.backup(target)
        migration=(APP/'db/migracii/108-uvedomlenija-sobytija.sql').read_text()
        with sqlite3.connect(after) as db:
            db.executescript(migration)
            db.execute('INSERT INTO migracii VALUES(108)')
        self.assertEqual(ops.verify_notification_links(before,after),{'original_notifications':2,'unresolved_task_links':1})
        for change,undo in [("UPDATE uvedomlenija SET tekst='Wrong' WHERE id=9","UPDATE uvedomlenija SET tekst='Retain raw identity' WHERE id=9"),("UPDATE uvedomlenija SET zadacha_id_istochnika=2.0 WHERE id=9","UPDATE uvedomlenija SET zadacha_id_istochnika='missing-task' WHERE id=9"),("UPDATE uvedomlenija SET zadacha_id_istochnika=NULL WHERE id=9","UPDATE uvedomlenija SET zadacha_id_istochnika='missing-task' WHERE id=9"),("UPDATE uvedomlenija SET zadacha_id=2 WHERE id=9","UPDATE uvedomlenija SET zadacha_id=NULL WHERE id=9"),("UPDATE sqlite_sequence SET seq=100 WHERE name='uvedomlenija'","UPDATE sqlite_sequence SET seq=99 WHERE name='uvedomlenija'")]:
            with sqlite3.connect(after) as db:db.execute(change)
            with self.assertRaisesRegex(ValueError,'original values'):
                ops.verify_notification_links(before,after)
            with sqlite3.connect(after) as db:db.execute(undo)

    def test_timer_waits_for_previous_operation_to_finish(self):
        import threading
        locked=threading.Event()
        critical_finished=threading.Event()
        def hold():
            with ops.operation_lock(self.app):
                locked.set()
                time.sleep(0.2)
                critical_finished.set()
        worker=threading.Thread(target=hold)
        worker.start();locked.wait(timeout=2)
        try:
            with ops.operation_lock(self.app,timeout=2):
                                                                            
                                                                             
                self.assertTrue(critical_finished.is_set())
        finally:
            worker.join(timeout=2)

    def test_release_export_uses_commit_and_excludes_runtime_data(self):
        subprocess.run(['git', 'init', '-q'], cwd=self.app, check=True)
        subprocess.run(['git', 'add', 'server.js', 'api', 'db/migrate.js', 'db/puti.js', 'db/versii.js', 'db/versii-shagov.js',
            'db/schema.sql', 'db/nachalnye.sql', 'db/pravila.sql', 'db/migracii', 'public', 'ops'],
            cwd=self.app, check=True)
        subprocess.run(['git', '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid',
            'commit', '-qm', 'source'], cwd=self.app, check=True)
        committed = (self.app / 'server.js').read_bytes()
        (self.app / 'server.js').write_text('dirty untested source')
        archive = self.base / 'release.tar.gz'
        ops.pack(self.app, archive, 'HEAD')
        stage = self.base / 'stage'
        stage.mkdir()
        ops.safe_extract(archive, stage)
        manifest = json.loads((stage / 'release-manifest.json').read_text())
        ops.verify_files(stage, manifest, 'release-manifest.json')
        self.assertEqual((stage / 'server.js').read_bytes(), committed)
        self.assertFalse((stage / 'db/locus.db').exists())
        self.assertFalse((stage / 'fajly').exists())
        self.assertFalse((stage / '.git').exists())

    def test_failure_after_trial_restores_code_and_every_database_count(self):
                                                                               
                                                                               
        source = self.base / 'new-source'
        source.mkdir()
        ops.copy_files(self.app, source, ops.runtime_files(self.app))
        (source / 'api/new-release-probe.js').write_text('module.exports = true;')
        names = ops.runtime_files(source)
        ops.write_json(source / 'release-manifest.json', {
            'format': 1, 'revision': 'test-release', 'files': {n: ops.sha(source / n) for n in names}})
        archive = self.base / 'release.tar.gz'
        with tarfile.open(archive, 'w:gz') as tar:
            for name in names + ['release-manifest.json']:
                tar.add(source / name, arcname=name)
        before = ops.db_state(self.app / 'db/locus.db')
        original_run = subprocess.run
        calls = []
        def control(service, action):
            calls.append(action)
        def fail_real_migration(command, **kwargs):
            if command == ['node','db/migrate.js'] and kwargs.get('cwd') == self.app:
                                                                                    
                with sqlite3.connect(self.app / 'db/locus.db') as db:
                    db.execute('CREATE TABLE should_not_survive (value TEXT)')
                raise subprocess.CalledProcessError(1, command)
            return original_run(command, **kwargs)
        with patch.object(ops,'DEPLOY_ROOT',self.app), patch.object(ops,'service_action',control), \
             patch.object(ops.subprocess,'run',fail_real_migration):
            with self.assertRaises(subprocess.CalledProcessError):
                ops.deploy(self.app,archive,self.base/'releases','locus-novyj',8791)
        self.assertEqual(ops.db_state(self.app/'db/locus.db'),before)
        self.assertFalse((self.app/'api/new-release-probe.js').exists())
        self.assertFalse((self.app/'ops/maintenance.json').exists())
        self.assertEqual(calls,['stop','stop','start'])
        result=json.loads(next((self.base/'releases').glob('*/result.json')).read_text())
        self.assertTrue(result['rolled_back'])
        self.assertFalse(result['deployed'])

    def test_successful_release_opens_only_after_health_and_checksums(self):
        source = self.base / 'new-source'
        source.mkdir()
        ops.copy_files(self.app, source, ops.runtime_files(self.app))
        (source/'api/new-release-probe.js').write_text('module.exports = true;')
        names=ops.runtime_files(source)
        ops.write_json(source/'release-manifest.json',{
            'format':1,'revision':'test-release','files':{n:ops.sha(source/n) for n in names}})
        archive=self.base/'release.tar.gz'
        with tarfile.open(archive,'w:gz') as tar:
            for name in names+['release-manifest.json']:
                tar.add(source/name,arcname=name)
        with socket.socket() as listener:
            listener.bind(('127.0.0.1',0)); port=listener.getsockname()[1]
        process=None
        calls=[]
        def control(service,action):
            nonlocal process
            calls.append(action)
            if action=='start':
                self.assertTrue((self.app/'ops/maintenance.json').exists())
                process=subprocess.Popen(['node','server.js'],cwd=self.app,
                    env=dict(os.environ,PORT=str(port),NODE_ENV='production',LOCUS_TEST_AUTH='0',
                             LOCUS_BAZA=str(self.app/'db/locus.db')),
                    stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
                for attempt in range(100):
                    try:
                        urllib.request.urlopen('http://127.0.0.1:'+str(port)+'/api/zadachi',timeout=1)
                    except urllib.error.HTTPError as response:
                        self.assertEqual(response.code,503)
                        self.assertEqual(response.headers['retry-after'],'15')
                        break
                    except OSError:
                        time.sleep(0.02)
                else:
                    self.fail('maintenance gate did not respond')
        try:
            with patch.object(ops,'DEPLOY_ROOT',self.app),patch.object(ops,'DEPLOY_PORT',port), \
                 patch.object(ops,'service_action',control):
                result=ops.deploy(self.app,archive,self.base/'releases','locus-novyj',port)
            self.assertTrue(result['deployed'])
            self.assertFalse((self.app/'ops/maintenance.json').exists())
            self.assertTrue((self.app/'api/new-release-probe.js').exists())
            self.assertEqual(calls,['stop','start'])
            self.assertEqual(json.loads((self.app/'ops/release.json').read_text())['revision'],'test-release')
            with self.assertRaises(urllib.error.HTTPError) as caught:
                urllib.request.urlopen('http://127.0.0.1:'+str(port)+'/api/zadachi',timeout=2)
            self.assertEqual(caught.exception.code,401)
        finally:
            if process:
                process.terminate();process.wait(timeout=10)

    def test_diagnostics_survive_database_failure_without_opening_team_data(self):
        salt='test-only-salt'
        password='test-only-password'
        hashed=salt+':'+subprocess.check_output(['node','-e',
            "console.log(require('node:crypto').scryptSync(process.argv[1],process.argv[2],64).toString('hex'))",
            password,salt],text=True).strip()
        with sqlite3.connect(self.app/'db/locus.db') as db:
            for person,access in [(900001,'polnyj'),(900002,'bez_deneg')]:
                db.execute('INSERT INTO ljudi(id,imja,dostup) VALUES (?,?,?)',(person,'Test',access))
                db.execute('INSERT INTO vhod(chelovek_id,login,parol_hesh,zablokirovan) VALUES (?,?,?,0)',
                           (person,'test-'+str(person),hashed))
        script="""const {server}=require('./server');
server.listen(0,'127.0.0.1',()=>console.log(server.address().port));
process.stdin.on('data',()=>{require('./db/db').baza().close();console.log('closed')});"""
        process=subprocess.Popen(['node','-e',script],cwd=self.app,
            env=dict(os.environ,NODE_ENV='production',LOCUS_TEST_AUTH='0',LOCUS_BAZA=str(self.app/'db/locus.db')),
            stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,text=True)
        try:
            port=process.stdout.readline().strip()
            self.assertTrue(port.isdecimal())
            def request(path,cookie=None,body=None):
                headers={'content-type':'application/json'}
                if cookie:headers['cookie']=cookie
                req=urllib.request.Request('http://127.0.0.1:'+port+path,headers=headers,
                    data=json.dumps(body).encode() if body else None)
                try:res=urllib.request.urlopen(req,timeout=3)
                except urllib.error.HTTPError as error:res=error
                return res.code,dict(res.headers),json.loads(res.read())
            cookies=[]
            for person in [900001,900002]:
                code,headers,_=request('/api/vhod/parol',body={'login':'test-'+str(person),'parol':password})
                self.assertEqual(code,200)
                cookies.append(headers['set-cookie'].split(';')[0])
            self.assertEqual(request('/api/sostojanie',cookies[1])[0],403)
            self.assertEqual(request('/api/sostojanie',cookies[0])[0],200)
            process.stdin.write('close\n');process.stdin.flush()
            self.assertEqual(process.stdout.readline().strip(),'closed')
            code,_,state=request('/api/sostojanie',cookies[0])
            self.assertEqual(code,200)
            self.assertEqual(len(state),5)
            self.assertFalse(state['sluzhba']['baza_dostupna'])
            self.assertEqual(request('/api/sostojanie',cookies[1])[0],403)
            self.assertEqual(request('/api/zadachi',cookies[0])[0],401)
            self.assertEqual(request('/api/sostojanie','locus-sessija=unknown')[0],401)
        finally:
            process.terminate();process.wait(timeout=10)
            process.stdin.close();process.stdout.close()


if __name__ == '__main__':
    unittest.main()
