import json
import os
import tempfile
import unittest
from pathlib import Path

from install_harness_reporters import merged_cursor, plan


class HarnessEnrollmentTests(unittest.TestCase):
    def test_cursor_enrollment_preserves_other_hooks_and_is_idempotent(self):
        template = {"hooks": {"stop": [{"command": "python3 report_harness.py --event stop"}]}}
        original = {"version": 1, "hooks": {"stop": [{"command": "./my-audit.sh"}]}}
        once = merged_cursor(original, template)
        twice = merged_cursor(once, template)
        self.assertEqual(once, twice)
        self.assertEqual(once["hooks"]["stop"][0], {"command": "./my-audit.sh"})
        self.assertEqual(original["hooks"]["stop"], [{"command": "./my-audit.sh"}])

    def test_conflicting_reporter_is_not_overwritten(self):
        template = {"hooks": {"stop": [{"command": "python3 report_harness.py --event stop"}]}}
        existing = {"hooks": {"stop": [{"command": "python3 report_harness.py --event something-else"}]}}
        with self.assertRaisesRegex(ValueError, "refusing overwrite"):
            merged_cursor(existing, template)

    def test_plan_is_read_only_and_requires_private_token(self):
        with tempfile.TemporaryDirectory() as tmp:
            home = Path(tmp)
            token = home / "token"
            token.write_text("test-secret", encoding="utf-8")
            os.chmod(token, 0o600)
            destinations = plan("https://mirmicode.example", token, home)
            self.assertEqual(destinations[-1]["token_file"], str(token))
            self.assertFalse((home / ".cursor").exists())
            os.chmod(token, 0o644)
            with self.assertRaisesRegex(ValueError, "private"):
                plan("https://mirmicode.example", token, home)


if __name__ == "__main__":
    unittest.main()
