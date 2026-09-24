import json
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

from install_codex_repo_hook import EnrollmentError, enroll


@unittest.skipUnless(shutil.which("git"), "Git CLI is required for repo-enrollment tests")
class CodexRepoHookEnrollmentTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.repo = Path(self.temp.name) / "repo"
        self.repo.mkdir()
        subprocess.run(["git", "init", "-q", str(self.repo)], check=True)

    def tearDown(self):
        self.temp.cleanup()

    def test_dry_run_describes_changes_without_writing(self):
        actions = enroll(self.repo)
        self.assertTrue(any("four Mirmicode lifecycle hook groups" in action for action in actions))
        self.assertFalse((self.repo / ".codex").exists())
        self.assertTrue(any("Codex /hooks review" in action for action in actions))
        self.assertTrue(any("host reporter must be installed" in action for action in actions))

    def test_apply_creates_four_hooks_and_is_idempotent(self):
        enroll(self.repo, apply=True)
        config_path = self.repo / ".codex" / "hooks.json"
        config = json.loads(config_path.read_text(encoding="utf-8"))
        self.assertEqual(set(config["hooks"]), {"UserPromptSubmit", "Stop", "SubagentStart", "SubagentStop"})
        self.assertTrue((self.repo / ".codex" / "hooks" / "mirmicode_report.py").is_file())
        original_config = config_path.read_bytes()
        original_script = (self.repo / ".codex" / "hooks" / "mirmicode_report.py").read_bytes()
        enroll(self.repo, apply=True)
        self.assertEqual(config_path.read_bytes(), original_config)
        self.assertEqual((self.repo / ".codex" / "hooks" / "mirmicode_report.py").read_bytes(), original_script)

    def test_existing_unrelated_hooks_are_preserved(self):
        codex = self.repo / ".codex"
        codex.mkdir()
        custom = {"type": "command", "command": "./my-existing-hook.sh"}
        (codex / "hooks.json").write_text(json.dumps({"hooks": {"Stop": [{"hooks": [custom]}]}, "other": 7}))
        enroll(self.repo, apply=True)
        config = json.loads((codex / "hooks.json").read_text(encoding="utf-8"))
        self.assertIn({"hooks": [custom]}, config["hooks"]["Stop"])
        self.assertEqual(config["other"], 7)
        self.assertEqual(len(config["hooks"]["Stop"]), 2)

    def test_conflicting_script_is_never_overwritten(self):
        script = self.repo / ".codex" / "hooks" / "mirmicode_report.py"
        script.parent.mkdir(parents=True)
        script.write_text("local edits\n")
        with self.assertRaisesRegex(EnrollmentError, "differs"):
            enroll(self.repo, apply=True)
        self.assertEqual(script.read_text(), "local edits\n")

    def test_conflicting_mirmicode_group_is_never_overwritten(self):
        codex = self.repo / ".codex"
        codex.mkdir()
        conflicting = {
            "hooks": {
                "Stop": [{"hooks": [{
                    "type": "command",
                    "command": "python3 .codex/hooks/mirmicode_report.py --unexpected",
                }]}]
            }
        }
        (codex / "hooks.json").write_text(json.dumps(conflicting))
        with self.assertRaisesRegex(EnrollmentError, "differs"):
            enroll(self.repo, apply=True)
        self.assertEqual(json.loads((codex / "hooks.json").read_text()), conflicting)
        self.assertFalse((codex / "hooks" / "mirmicode_report.py").exists())

    def test_rejects_non_git_directory(self):
        with tempfile.TemporaryDirectory() as plain:
            with self.assertRaisesRegex(EnrollmentError, "Git worktree"):
                enroll(Path(plain))


if __name__ == "__main__":
    unittest.main()
