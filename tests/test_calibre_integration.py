"""Opt-in real Calibre tests. Synthetic temporary library only; never starts a server."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
CAT = ROOT / "calibre-catalog-read/scripts"
APPLY = ROOT / "calibre-metadata-apply/scripts/calibredb_apply.mjs"


@unittest.skipUnless(os.environ.get("CALIBRE_NATIVE_TESTS") == "1", "set CALIBRE_NATIVE_TESTS=1 for isolated real Calibre tests")
class NativeIntegration(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        for binary in ("node", "calibredb", "ebook-convert"):
            if not shutil.which(binary):
                raise unittest.SkipTest(binary + " is not installed")
        cls.temp = tempfile.TemporaryDirectory(prefix="calibre-native-integration-")
        cls.addClassCleanup(cls.temp.cleanup)
        cls.root = Path(cls.temp.name)
        cls.lib = cls.root / "library 日本語"
        cls.env = {"PATH": os.environ["PATH"], "HOME": str(cls.root), "LANG": "C.UTF-8", "TZ": "Asia/Tokyo", "QT_QPA_PLATFORM": "offscreen", "CALIBRE_CONFIG_DIRECTORY": str(cls.root / "config")}
        source = cls.root / "source.txt"
        source.write_text("Synthetic integration chapter. 日本語 evidence. Every fragment is test data, not a real book.\n" * 100)
        cls.execute(["ebook-convert", str(source), str(cls.root / "fixture.epub"), "--title", "Synthetic Book", "--authors", "Alice"])
        cls.calibre("add", cls.root / "fixture.epub")
        cls.calibre("add", "--empty", "--title", "Second synthetic book", "--authors", "Bob")
        cls.calibre("set_metadata", 1, "--field", "comments:<p>Original $& comment.</p>", "--field", "tags:existing")

    @classmethod
    def execute(cls, args, input="", ok=True):
        r = subprocess.run(list(map(str, args)), input=input, env=cls.env, cwd=cls.root, capture_output=True, text=True, timeout=90)
        if ok and r.returncode:
            raise AssertionError(str(args) + "\n" + r.stdout + "\n" + r.stderr)
        return r

    @classmethod
    def calibre(cls, *args):
        return cls.execute(["calibredb", *args, "--with-library", cls.lib])

    def snapshot(self):
        return json.loads(self.calibre("list", "--for-machine", "--fields", "all").stdout)

    def node(self, file, *args, **kwargs):
        return self.execute(["node", file, *args], **kwargs)

    def plan(self, record, name):
        plan = self.root / (name + ".json")
        r = self.node(APPLY, "--with-library", self.lib, "--state-dir", self.root / "apply-state", "--plan-file", plan, input=json.dumps(record) + "\n")
        return plan, json.loads(r.stdout)

    def apply(self, plan, ok=True):
        return self.node(APPLY, "--apply", "--plan-file", plan, "--state-dir", self.root / "apply-state", ok=ok)

    def test_1_catalog_prepare_complete_dry_run_apply(self):
        before = self.snapshot()
        r = self.execute([sys.executable, CAT / "run_analysis_pipeline.py", "prepare", "--book-id", 1, "--run-id", "native1", "--with-library", self.lib, "--cache-dir", self.root / "cache", "--chunk-chars", 3000])
        prepared = json.loads(r.stdout)
        manifest = json.loads(Path(prepared["prepared_input"]).read_text())
        parts = manifest["source_files"]
        self.assertTrue(all(Path(p["path"]).read_text() for p in parts))
        self.assertEqual(before, self.snapshot(), "preparation must not mutate metadata")
        analysis = {k: manifest[k] for k in ("run_id", "book_id", "library_id", "file_hash", "lang")}
        analysis.update(summary="Synthetic <unsafe> & $&", highlights=["Known synthetic text", "No real book content"], reread=[{"section": "Synthetic chapter", "page": "EPUB n/a", "chunk_id": parts[0]["id"], "reason": "Fixture"}], tags=["verified-fixture"], coverage={"mode": "full", "expected_files": len(parts), "read_files": len(parts), "read_chars": sum(p["chars"] for p in parts), "part_ids": [p["id"] for p in parts]})
        result = self.root / "analysis.json"; result.write_text(json.dumps(analysis))
        state = self.root / "runs.json"
        self.node(CAT / "run_state.mjs", "upsert", "--run-id", "native1", "--input-json", prepared["prepared_input"], "--state", state)
        proposal = self.root / "proposal.jsonl"
        self.node(CAT / "handle_completion.mjs", "--run-id", "native1", "--analysis-json", result, "--proposal-jsonl", proposal, "--state", state)
        self.assertEqual(before, self.snapshot(), "completion must not mutate metadata")
        plan, dry = self.plan(json.loads(proposal.read_text()), "analysis-plan")
        self.assertEqual(before, self.snapshot(), "dry-run must not mutate metadata")
        applied = json.loads(self.apply(plan).stdout)
        self.assertEqual(applied["summary"]["applied"], 1)
        current = self.snapshot()[0]
        self.assertIn("Original $& comment", current["comments"])
        self.assertIn("&lt;unsafe&gt;", current["comments"])
        self.assertEqual(current["comments"].count("<!-- OC_ANALYSIS_START -->"), 1)
        self.assertIn("existing", current["tags"])
        self.assertIn("verified-fixture", current["tags"])
        self.assertNotEqual(self.apply(plan, ok=False).returncode, 0)

    def test_2_native_dates_languages_authors_and_sort(self):
        record = {"id": 2, "title_sort": "日本語 O'Neil", "authors": ["Doe, Jane", "日本語著者"], "author_sort": "ドウ, ジェーン & リサーチ", "languages": ["ja", "en"], "pubdate": "2024-02-29", "series": "シリーズ", "series_index": 0.5, "tags": ["A", "B"], "tags_merge": False}
        plan, _ = self.plan(record, "metadata-plan")
        outcome = json.loads(self.apply(plan).stdout)
        self.assertEqual(outcome["summary"]["applied"], 1)
        book = next(b for b in self.snapshot() if b["id"] == 2)
        self.assertEqual(book["pubdate"][:10], "2024-02-29")
        self.assertEqual(set(book["languages"]), {"jpn", "eng"})
        self.assertEqual(book["series_index"], 0.5)
        noop, dry = self.plan(record, "metadata-noop-plan")
        self.assertEqual(dry["summary"]["no_op"], 1)
        self.assertEqual(json.loads(self.apply(noop).stdout)["summary"]["no_op"], 1)

    def test_3_native_clear_and_single_block_replacement(self):
        plan, _ = self.plan({"id": 2, "pubdate": None, "languages": [], "tags": [], "tags_merge": False}, "clear-plan")
        self.apply(plan)
        book = next(b for b in self.snapshot() if b["id"] == 2)
        self.assertEqual(book["tags"], [])
        self.assertEqual(book["languages"], [])
        self.assertTrue(book["pubdate"].startswith("0101-"))
        plan, _ = self.plan({"id": 1, "analysis": {"summary": "Replacement $& <value>", "highlights": ["one", "two"]}}, "replacement-plan")
        self.apply(plan)
        book = next(b for b in self.snapshot() if b["id"] == 1)
        self.assertEqual(book["comments"].count("<!-- OC_ANALYSIS_START -->"), 1)
        self.assertIn("Original $& comment", book["comments"])
        self.assertIn("Replacement $&amp; &lt;value&gt;", book["comments"])


if __name__ == "__main__":
    unittest.main()
