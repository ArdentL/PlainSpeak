"""Behavioral checks for portable skill identity and non-destructive setup."""
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("client_setup", ROOT / "scripts/client_setup.py")
setup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(setup)


class ClientSetupTests(unittest.TestCase):
    def test_actual_bundles_use_canonical_skill_names_and_keep_licenses(self):
        with tempfile.TemporaryDirectory() as directory:
            for client, skill_root in [("codex", ".agents"), ("claude", ".claude"), ("harness", ".dsh")]:
                output = Path(directory) / client
                setup.prepare(client, output, Path(sys.executable), ["Kiterlin--anti-defensive-writing"], True)
                self.assertFalse(output.exists())
                setup.prepare(client, output, Path(sys.executable), ["Kiterlin--anti-defensive-writing"], False)
                skills = output / skill_root / "skills"
                self.assertEqual({p.name for p in skills.iterdir()}, {"plain-writing", "roundtrip-readability", "anti-defensive-writing"})
                source = ROOT / "third_party/Kiterlin--anti-defensive-writing"
                for path in source.rglob("*"):
                    if path.is_file():
                        self.assertEqual(path.read_bytes(), (skills / "anti-defensive-writing" / path.relative_to(source)).read_bytes())
                for path in output.glob("*.json"):
                    json.loads(path.read_text(encoding="utf-8"))
                before = {p: p.read_bytes() for p in output.rglob("*") if p.is_file()}
                with self.assertRaises(ValueError):
                    setup.prepare(client, output, Path(sys.executable), [], False)
                self.assertEqual(before, {p: p.read_bytes() for p in output.rglob("*") if p.is_file()})

    def test_chinese_vendor_slug_maps_to_canonical_name(self):
        with tempfile.TemporaryDirectory() as directory:
            setup.prepare("codex", Path(directory), Path(sys.executable), ["op7418--Humanizer-zh"], False)
            destination = Path(directory) / ".agents/skills/humanizer-zh"
            self.assertTrue((destination / "SKILL.md").is_file())
            self.assertEqual((destination / "LICENSE").read_bytes(), (ROOT / "third_party/op7418--Humanizer-zh/LICENSE").read_bytes())

    def test_unsafe_selection_and_duplicate_canonical_names_refused_before_write(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for selection in ["../bad", "bad/name", ".."]:
                with self.assertRaises(ValueError):
                    setup.prepare("codex", root / "out", Path(sys.executable), [selection], False)
            self.assertFalse((root / "out").exists())
            for folder in ["skills/plain-writing", "skills/roundtrip-readability", "third_party/vendor"]:
                target = root / folder
                target.mkdir(parents=True)
                name = "plain-writing" if folder.endswith("vendor") else target.name
                (target / "SKILL.md").write_text(f"---\nname: {name}\ndescription: Test\n---\n", encoding="utf-8")
            with patch.object(setup, "ROOT", root):
                with self.assertRaises(ValueError):
                    setup.prepare("codex", root / "out", Path(sys.executable), ["vendor"], False)
            self.assertFalse((root / "out").exists())


if __name__ == "__main__":
    unittest.main()
