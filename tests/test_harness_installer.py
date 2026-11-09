"""Installer checks catch unwanted writes, lost user files and wrong child cwd."""
import json
import importlib.util
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / 'scripts/install_harness.py'
SPEC = importlib.util.spec_from_file_location('harness_installer_test', SCRIPT)
installer = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(installer)


class HarnessInstallerTests(unittest.TestCase):
    def fixture(self, root):
        package = root / 'src/plainspeak'
        package.mkdir(parents=True)
        (package / '__init__.py').write_text('', encoding='utf-8')
        (package / '__main__.py').write_text(
            'import json, os, pathlib, sys\n'
            'p=pathlib.Path(os.environ["PLAINSPEAK_HOME"])/"setup-call.json"\n'
            'p.write_text(json.dumps({"args":sys.argv[1:],"cwd":str(pathlib.Path.cwd())}),encoding="utf-8")\n',
            encoding='utf-8')
        (package / '__pycache__').mkdir()
        (package / '__pycache__/junk.pyc').write_bytes(b'junk')
        (package / 'data').mkdir()
        (package / 'data/models.json').write_text(json.dumps({'models': [{'id': 'small'}]}), encoding='utf-8')
        plugin = root / 'adapters/harness-ui'
        for name in ('src/index.js', 'lib/client.js', 'package.json'):
            path = plugin / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text('{}' if name == 'package.json' else '// fixture', encoding='utf-8')

    def run_installer(self, root, home, *extra):
        return subprocess.run([sys.executable, str(SCRIPT), '--project-root', str(root),
                               '--home', str(home), '--profile-dir', str(home.parent / 'profile'),
                               '--model', 'small', *extra],
                              capture_output=True, text=True, encoding='utf-8')

    def test_dry_run_creates_nothing(self):
        with tempfile.TemporaryDirectory() as directory:
            root, home = Path(directory) / 'source', Path(directory) / 'install'
            self.fixture(root)
            result = self.run_installer(root, home, '--dry-run')
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertFalse(home.exists())
            self.assertFalse((home.parent / 'profile').exists())

    def test_real_setup_uses_installed_package_and_rerun_preserves_user_files(self):
        with tempfile.TemporaryDirectory() as directory:
            root, home = Path(directory) / 'source', Path(directory) / 'install'
            self.fixture(root)
            result = self.run_installer(root, home)
            self.assertEqual(result.returncode, 0, result.stderr)
            call = json.loads((home / 'setup-call.json').read_text(encoding='utf-8'))
            self.assertEqual(call, {'args': ['setup', '--model', 'small'], 'cwd': str(home / 'app')})
            self.assertFalse((home / 'app/plainspeak/__pycache__/junk.pyc').exists())
            (home / 'user-note.txt').write_text('保留', encoding='utf-8')
            result = self.run_installer(root, home, '--prepare-only')
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual((home / 'user-note.txt').read_text(encoding='utf-8'), '保留')
            self.assertTrue((home.parent / 'profile/node_modules/@plainspeak/harness-ui/src/index.js').is_file())
            (home / 'app/plainspeak/__init__.py').write_text('# user change', encoding='utf-8')
            result = self.run_installer(root, home, '--prepare-only')
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual((home / 'app/plainspeak/__init__.py').read_text(encoding='utf-8'), '# user change')

    def test_existing_unowned_destination_is_refused_before_writes(self):
        with tempfile.TemporaryDirectory() as directory:
            root, home = Path(directory) / 'source', Path(directory) / 'install'
            self.fixture(root)
            target = home / 'app/plainspeak/__init__.py'
            target.parent.mkdir(parents=True)
            target.write_text('user', encoding='utf-8')
            result = self.run_installer(root, home, '--prepare-only')
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(target.read_text(encoding='utf-8'), 'user')
            self.assertFalse((home / 'install-harness-manifest.json').exists())

    def test_source_path_with_spaces_reaches_setup_as_one_argument(self):
        with tempfile.TemporaryDirectory() as directory:
            root, home = Path(directory) / 'source', Path(directory) / 'install'
            self.fixture(root)
            source = Path(directory) / 'official model.gguf'
            source.write_bytes(b'fixture')
            result = self.run_installer(root, home, '--source', str(source))
            self.assertEqual(result.returncode, 0, result.stderr)
            call = json.loads((home / 'setup-call.json').read_text(encoding='utf-8'))
            self.assertEqual(call['args'], ['setup', '--model', 'small', '--source', str(source)])

    def test_unowned_app_directory_and_unknown_model_are_refused(self):
        with tempfile.TemporaryDirectory() as directory:
            root, home = Path(directory) / 'source', Path(directory) / 'install'
            self.fixture(root)
            result = self.run_installer(root, home, '--model', 'unknown', '--prepare-only')
            self.assertNotEqual(result.returncode, 0)
            self.assertFalse(home.exists())
            existing = home / 'app/plainspeak/user-module.py'
            existing.parent.mkdir(parents=True)
            existing.write_text('user', encoding='utf-8')
            result = self.run_installer(root, home, '--prepare-only')
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(list(existing.parent.iterdir()), [existing])

    def test_unowned_profile_plugin_is_not_overwritten(self):
        with tempfile.TemporaryDirectory() as directory:
            root, home = Path(directory) / 'source', Path(directory) / 'install'
            self.fixture(root)
            existing = Path(directory) / 'profile/node_modules/@plainspeak/harness-ui/user.txt'
            existing.parent.mkdir(parents=True)
            existing.write_text('preserve', encoding='utf-8')
            result = self.run_installer(root, home, '--prepare-only')
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(existing.read_text(encoding='utf-8'), 'preserve')
            self.assertFalse(home.exists())

    def test_interrupted_first_install_and_upgrade_resume_without_losing_user_data(self):
        for upgrade in (False, True):
            for scope, name in [('home', 'app/plainspeak/__init__.py'),
                                ('profile', 'src/index.js'),
                                ('profile', '.plainspeak-install-manifest.json'),
                                ('home', 'install-harness-manifest.json')]:
                with self.subTest(upgrade=upgrade, scope=scope, name=name), tempfile.TemporaryDirectory() as directory:
                    root, home = Path(directory) / 'source', Path(directory) / 'install'
                    profile = Path(directory) / 'profile'
                    self.fixture(root)
                    if upgrade:
                        installer.prepare(root, home, 'small', None, True, False, profile)
                    home.mkdir(exist_ok=True)
                    note = home / 'models/user-note.txt'
                    note.parent.mkdir(exist_ok=True)
                    note.write_text('preserve model and records', encoding='utf-8')
                    (root / 'src/plainspeak/__init__.py').write_text('# new release', encoding='utf-8')
                    (root / 'adapters/harness-ui/src/index.js').write_text('// new release', encoding='utf-8')
                    target = (home if scope == 'home' else profile / 'node_modules/@plainspeak/harness-ui') / name
                    original = installer._atomic_write
                    def fail_write(path, content):
                        if path == target:
                            raise OSError('injected failure before atomic publication')
                        return original(path, content)
                    with patch.object(installer, '_atomic_write', side_effect=fail_write):
                        with self.assertRaisesRegex(OSError, 'injected'):
                            installer.prepare(root, home, 'small', None, True, False, profile)
                    result = self.run_installer(root, home, '--prepare-only')
                    self.assertEqual(result.returncode, 0, result.stderr)
                    self.assertEqual((home / 'app/plainspeak/__init__.py').read_text(encoding='utf-8'), '# new release')
                    self.assertEqual((profile / 'node_modules/@plainspeak/harness-ui/src/index.js').read_text(encoding='utf-8'), '// new release')
                    self.assertEqual(note.read_text(encoding='utf-8'), 'preserve model and records')
                    self.assertFalse((home / installer.TRANSACTION).exists())

    def crash_install(self, root, home, client='web', crash_target=None):
        # A real process exits immediately after publishing a live file: no finally
        # blocks or Python exception recovery get a chance to repair the install.
        target = crash_target or home / 'app/plainspeak/__init__.py'
        code = ('import importlib.util,os,pathlib; '
                f's=importlib.util.spec_from_file_location("installer",{str(SCRIPT)!r}); '
                'm=importlib.util.module_from_spec(s); s.loader.exec_module(m); original=m._atomic_write\n'
                'def crash(path,content):\n'
                ' original(path,content)\n'
                f' if path==pathlib.Path({str(target)!r}): os._exit(73)\n'
                'm._atomic_write=crash\n'
                f'm.prepare(pathlib.Path({str(root)!r}),pathlib.Path({str(home)!r}),"small",None,True,False,pathlib.Path({str(home.parent / "profile")!r}),client={client!r})')
        return subprocess.run([sys.executable, '-c', code], capture_output=True, text=True, encoding='utf-8')

    def test_hard_process_crash_resumes_in_new_invocation(self):
        with tempfile.TemporaryDirectory() as directory:
            root, home = Path(directory) / 'source', Path(directory) / 'install'
            self.fixture(root)
            self.assertEqual(self.crash_install(root, home).returncode, 73)
            self.assertFalse((home / installer.MANIFEST).exists())
            result = self.run_installer(root, home, '--prepare-only')
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertTrue((home / installer.MANIFEST).is_file())

    def test_recovery_preserves_real_user_modification_and_unknown_collision(self):
        for relative in ('app/plainspeak/__init__.py', 'app/plainspeak/__main__.py'):
            with self.subTest(relative=relative), tempfile.TemporaryDirectory() as directory:
                root, home = Path(directory) / 'source', Path(directory) / 'install'
                self.fixture(root)
                self.assertEqual(self.crash_install(root, home).returncode, 73)
                changed = home / relative
                changed.write_text('# user content after interruption', encoding='utf-8')
                result = self.run_installer(root, home, '--prepare-only')
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(changed.read_text(encoding='utf-8'), '# user content after interruption')
                self.assertFalse((home.parent / 'profile').exists())

    def test_pending_profile_modification_is_refused_and_dry_run_does_not_recover(self):
        with tempfile.TemporaryDirectory() as directory:
            root, home = Path(directory) / 'source', Path(directory) / 'install'
            profile = Path(directory) / 'profile'
            self.fixture(root)
            original = installer._atomic_write
            def fail_receipt(path, content):
                if path == home / installer.MANIFEST:
                    raise OSError('injected receipt failure')
                return original(path, content)
            with patch.object(installer, '_atomic_write', side_effect=fail_receipt):
                with self.assertRaises(OSError):
                    installer.prepare(root, home, 'small', None, True, False, profile)
            journal = home / installer.TRANSACTION
            before = journal.read_bytes()
            result = self.run_installer(root, home, '--dry-run')
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(journal.read_bytes(), before)
            self.assertFalse((home / installer.MANIFEST).exists())
            changed = profile / 'node_modules/@plainspeak/harness-ui/src/index.js'
            changed.write_text('// user modification', encoding='utf-8')
            result = self.run_installer(root, home, '--prepare-only')
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(changed.read_text(encoding='utf-8'), '// user modification')
            self.assertFalse((home / installer.MANIFEST).exists())

    def desktop_profile(self, profile):
        profile.mkdir(parents=True)
        manifest = {'name': 'dsh-profile-desktop', 'private': True,
                    'dependencies': {'user-plugin': '1.0.0'}, 'custom': {'keep': True},
                    'dsh': {'other': 7, 'profile': {'extra': 'keep', 'bundles': [
                        '@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', 'user-bundle']}}}
        (profile / 'package.json').write_text(json.dumps(manifest), encoding='utf-8')
        (profile / 'cordis.patch.yml').write_text('# user patch\n[]\n', encoding='utf-8')
        return manifest

    def test_desktop_bundle_activation_preserves_profile_and_is_idempotent(self):
        with tempfile.TemporaryDirectory() as directory:
            root, home, profile = (Path(directory) / name for name in ('source', 'install', 'profile'))
            self.fixture(root)
            before = self.desktop_profile(profile)
            user_patch = (profile / 'cordis.patch.yml').read_bytes()
            for _ in range(2):
                result = self.run_installer(root, home, '--client', 'desktop', '--prepare-only')
                self.assertEqual(result.returncode, 0, result.stderr)
            report = json.loads(result.stdout)
            self.assertEqual(report['client'], 'desktop')
            self.assertEqual(report['profile_dir'], str(profile))
            self.assertTrue(report['restart_required'])
            self.assertIsNone(report['launch_command'])
            after = json.loads((profile / 'package.json').read_text(encoding='utf-8'))
            before['dsh']['profile']['bundles'].append('@plainspeak/harness-ui')
            self.assertEqual(after, before)
            self.assertEqual((profile / 'cordis.patch.yml').read_bytes(), user_patch)
            plugin = profile / 'node_modules/@plainspeak/harness-ui'
            metadata = json.loads((plugin / 'package.json').read_text(encoding='utf-8'))
            self.assertEqual(metadata['dsh']['bundle']['patch'], 'cordis.patch.yml')
            self.assertEqual((plugin / 'cordis.patch.yml').read_bytes(), (home / 'harness.patch.yml').read_bytes())
            self.assertFalse((home / 'setup-call.json').exists())

    def test_desktop_requires_initialized_profile_before_any_writes(self):
        with tempfile.TemporaryDirectory() as directory:
            root, home = Path(directory) / 'source', Path(directory) / 'install'
            self.fixture(root)
            result = self.run_installer(root, home, '--client', 'desktop', '--prepare-only')
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('start DeepSeek Harness', result.stderr)
            self.assertFalse(home.exists())
            self.assertFalse((home.parent / 'profile').exists())

    def test_default_desktop_profile_uses_selected_dsh_home_and_dry_run_is_read_only(self):
        with tempfile.TemporaryDirectory() as directory:
            root, home = Path(directory) / 'source', Path(directory) / 'install'
            profile = Path(directory) / 'dsh/profiles/desktop'
            self.fixture(root)
            self.desktop_profile(profile)
            before = (profile / 'package.json').read_bytes()
            with patch.dict(os.environ, {'DSH_HOME': str(Path(directory) / 'dsh')}):
                report = installer.prepare(root, home, 'small', None, True, True, client='desktop')
            self.assertEqual(report['profile_dir'], str(profile))
            self.assertFalse(home.exists())
            self.assertEqual((profile / 'package.json').read_bytes(), before)
            self.assertFalse((profile / 'node_modules').exists())

    def test_desktop_shared_manifest_failure_recovers_and_wrong_client_refuses(self):
        with tempfile.TemporaryDirectory() as directory:
            root, home, profile = (Path(directory) / name for name in ('source', 'install', 'profile'))
            self.fixture(root)
            before = self.desktop_profile(profile)
            original = installer._atomic_write
            def fail_shared(path, content):
                if path == profile / 'package.json':
                    raise OSError('injected shared profile write failure')
                return original(path, content)
            with patch.object(installer, '_atomic_write', side_effect=fail_shared):
                with self.assertRaisesRegex(OSError, 'shared profile'):
                    installer.prepare(root, home, 'small', None, True, False, profile, client='desktop')
            snapshot = {p: p.read_bytes() for p in home.rglob('*') if p.is_file()}
            result = self.run_installer(root, home, '--prepare-only')
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('desktop', result.stderr)
            self.assertEqual(snapshot, {p: p.read_bytes() for p in home.rglob('*') if p.is_file()})
            self.assertEqual(json.loads((profile / 'package.json').read_text(encoding='utf-8')), before)
            result = self.run_installer(root, home, '--client', 'desktop', '--prepare-only')
            self.assertEqual(result.returncode, 0, result.stderr)

    def test_desktop_pending_shared_manifest_user_edit_is_never_overwritten(self):
        with tempfile.TemporaryDirectory() as directory:
            root, home, profile = (Path(directory) / name for name in ('source', 'install', 'profile'))
            self.fixture(root)
            self.desktop_profile(profile)
            original = installer._atomic_write
            def fail_final_receipt(path, content):
                if path == home / installer.MANIFEST:
                    raise OSError('injected final receipt failure')
                return original(path, content)
            with patch.object(installer, '_atomic_write', side_effect=fail_final_receipt):
                with self.assertRaises(OSError):
                    installer.prepare(root, home, 'small', None, True, False, profile, client='desktop')
            changed = profile / 'package.json'
            data = json.loads(changed.read_text(encoding='utf-8'))
            data['user-edit'] = 'after interruption'
            changed.write_text(json.dumps(data), encoding='utf-8')
            before = changed.read_bytes()
            result = self.run_installer(root, home, '--client', 'desktop', '--prepare-only')
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(changed.read_bytes(), before)
            self.assertTrue((home / installer.TRANSACTION).exists())

    def test_desktop_hard_crash_after_activation_recovers_and_other_profile_refuses(self):
        with tempfile.TemporaryDirectory() as directory:
            root, home, profile = (Path(directory) / name for name in ('source', 'install', 'profile'))
            self.fixture(root)
            self.desktop_profile(profile)
            result = self.crash_install(root, home, 'desktop', profile / 'package.json')
            self.assertEqual(result.returncode, 73, result.stderr)
            self.assertFalse((home / installer.MANIFEST).exists())
            other_profile = Path(directory) / 'other-profile'
            self.desktop_profile(other_profile)
            with self.assertRaisesRegex(ValueError, 'same --client and --profile-dir'):
                installer.prepare(root, home, 'small', None, True, False, other_profile, 'desktop')
            self.assertFalse((other_profile / 'node_modules').exists())
            result = self.run_installer(root, home, '--client', 'desktop', '--prepare-only')
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertTrue((home / installer.MANIFEST).is_file())
            self.assertFalse((home / installer.TRANSACTION).exists())


if __name__ == '__main__':
    unittest.main()
