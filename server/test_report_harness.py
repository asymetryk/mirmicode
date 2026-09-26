import unittest
from unittest.mock import patch

from report_harness import keywords, observation


class HarnessReporterTests(unittest.TestCase):
    def test_cursor_parent_and_child_use_stable_distinct_ids_without_prompt_body(self):
        with patch("report_harness.repository", return_value={"repo_key": "github.com/example/app", "label": "app"}):
            parent = observation("cursor", "beforeSubmitPrompt", {
                "conversation_id": "parent-1", "workspace_roots": ["/tmp/app"],
                "model_id": "gpt-6", "prompt": "Fix the map layout now",
            }, "2026-09-24T10:00:00Z")
            child = observation("cursor", "subagentStart", {
                "subagent_id": "child-1", "parent_conversation_id": "parent-1",
                "workspace_roots": ["/tmp/app"], "subagent_type": "explore",
                "task": "Inspect layout options",
            }, "2026-09-24T10:00:10Z")
        self.assertEqual(parent["sessions"][0]["status"], "working")
        self.assertEqual(child["sessions"][0]["parent_id"], parent["sessions"][0]["id"])
        self.assertNotIn("Fix the map layout now", str(parent))
        self.assertNotEqual(child["sessions"][0]["id"], parent["sessions"][0]["id"])

    def test_ohmypi_end_never_claims_objective_success(self):
        with patch("report_harness.repository", return_value={"repo_key": "github.com/example/app", "label": "app"}):
            ended = observation("ohmypi", "agent_end", {
                "session_id": "/private/session.jsonl", "cwd": "/tmp/app", "model": "kimi",
            }, "2026-09-24T10:05:00Z")
        unit = ended["sessions"][0]
        self.assertEqual(unit["status"], "completed")
        self.assertIsNone(unit["outcome"])
        self.assertNotIn("/private/session", str(ended))

    def test_cursor_cli_session_events_use_session_id_and_project_dir(self):
        with patch.dict("report_harness.os.environ", {"CURSOR_PROJECT_DIR": "/tmp/app"}), \
             patch("report_harness.repository", return_value={"repo_key": "github.com/example/app", "label": "app"}):
            started = observation("cursor", "sessionStart", {
                "session_id": "cli-1", "composer_mode": "ask",
            }, "2026-09-24T10:00:00Z")
            ended = observation("cursor", "sessionEnd", {
                "session_id": "cli-1", "reason": "completed", "duration_ms": 4500,
            }, "2026-09-24T10:00:05Z")
        self.assertEqual(started["sessions"][0]["id"], ended["sessions"][0]["id"])
        self.assertEqual(started["sessions"][0]["status"], "working")
        self.assertEqual(ended["sessions"][0]["status"], "completed")
        self.assertEqual(ended["sessions"][0]["duration_ms"], 4500)
        self.assertIsNone(ended["sessions"][0]["outcome"])

    def test_cursor_session_close_is_not_task_success(self):
        with patch("report_harness.repository", return_value={"repo_key": "github.com/example/app", "label": "app"}):
            ended = observation("cursor", "sessionEnd", {
                "session_id": "cli-2", "workspace_roots": ["/tmp/app"], "reason": "user_close",
            }, "2026-09-24T10:00:05Z")
        self.assertEqual(ended["sessions"][0]["status"], "unknown")

    def test_prompt_keywords_drop_secret_bearing_segments(self):
        result = keywords("Fix map. password is sk-ABCDEFGHIJKLMNOPQRSTUVWXYZ. Improve zoom controls.")
        self.assertIn("map", result)
        self.assertIn("zoom", result)
        self.assertNotIn("password", result)
        self.assertNotIn("ABCDEFGHIJKLMNOPQRSTUVWXYZ", result)


if __name__ == "__main__":
    unittest.main()
