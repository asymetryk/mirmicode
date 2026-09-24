import json
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

from collect_codex import prompt_keywords, session_from_file, token_usage_from_info


class PromptPrivacyTests(unittest.TestCase):
    def test_keyword_sketch_omits_raw_text_and_sensitive_segments(self):
        prompt = (
            "Please implement collector lifecycle fields and focused tests. "
            "My password is Hunter2 and the API key is abc123. "
            "See https://private.example/path and /Users/someone/private/file.txt."
        )

        summary = prompt_keywords(prompt)

        self.assertEqual(summary, "Prompt keywords: implement, collector, lifecycle, fields, focused, tests")
        self.assertNotIn("Please", summary)
        self.assertNotIn("Hunter2", summary)
        self.assertNotIn("abc123", summary)
        self.assertNotIn("private.example", summary)
        self.assertNotIn("/Users/", summary)
        self.assertLess(len(summary), len(prompt))

    def test_prompt_with_only_sensitive_or_code_content_has_no_summary(self):
        self.assertIsNone(prompt_keywords("password is Hunter2; API key: abc123"))
        self.assertIsNone(prompt_keywords("```token = 'secret'```"))


class SourceMetadataTests(unittest.TestCase):
    def write_session(self, directory, events, filename="session.jsonl"):
        path = Path(directory) / filename
        path.write_text("".join(json.dumps(event) + "\n" for event in events), encoding="utf-8")
        return path

    def collect(self, path):
        with patch("collect_codex.canonical_remote", return_value="github.com/example/repo"):
            return session_from_file(
                path, {}, {}, datetime(2026, 9, 24, 12, tzinfo=timezone.utc),
            )

    def test_latest_prompt_and_task_lifecycle_are_additive(self):
        key = "github.com/example/repo"
        events = [
            {"type": "session_meta", "payload": {
                "id": "task-id", "cwd": "/repo", "timestamp": "2026-09-24T08:00:00Z",
            }},
            {"type": "event_msg", "timestamp": "2026-09-24T08:00:00Z",
             "payload": {"type": "task_started", "started_at": "2026-09-24T08:00:00Z"}},
            {"type": "response_item", "payload": {
                "type": "message", "role": "user",
                "content": [{"type": "input_text", "text": "Create an obsolete draft."}],
            }},
            {"type": "event_msg", "timestamp": "2026-09-24T08:10:00Z",
             "payload": {"type": "task_started", "started_at": "2026-09-24T08:10:00Z"}},
            {"type": "response_item", "payload": {
                "type": "message", "role": "user",
                "content": [{"type": "input_text", "text": "Improve collector lifecycle tests."}],
            }},
            {"type": "event_msg", "payload": {"type": "token_count", "info": {
                "total_token_usage": {
                    "input_tokens": 1250, "output_tokens": 310,
                    "cached_input_tokens": 200, "reasoning_output_tokens": 70,
                    "total_tokens": 1560, "cache_write_input_tokens": 30,
                },
            }}},
            {"type": "event_msg", "timestamp": "2026-09-24T08:12:00Z",
             "payload": {"type": "task_complete", "started_at": "2026-09-24T08:10:00Z",
                         "completed_at": "2026-09-24T08:12:00Z", "duration_ms": 120000,
                         "last_agent_message": "Done."}},
        ]
        with tempfile.TemporaryDirectory() as directory:
            repo, session = self.collect(self.write_session(directory, events))

        self.assertEqual(repo["repo_key"], key)
        self.assertEqual(session["status"], "completed")
        self.assertEqual(session["prompt_tldr"], "Prompt keywords: improve, collector, lifecycle, tests")
        self.assertEqual(session["started_at"], "2026-09-24T08:10:00Z")
        self.assertEqual(session["finished_at"], "2026-09-24T08:12:00Z")
        self.assertEqual(session["duration_ms"], 120000)
        self.assertEqual(session["token_usage"], {
            "input_tokens": 1250, "output_tokens": 310, "cached_input_tokens": 200,
            "reasoning_output_tokens": 70, "total_tokens": 1560,
        })
        self.assertIsNone(session["outcome"])
        encoded = json.dumps(session)
        self.assertNotIn("obsolete draft", encoded)
        self.assertNotIn("Done.", encoded)

    def test_unknown_lifecycle_and_non_cumulative_usage_remain_null(self):
        events = [
            {"type": "session_meta", "payload": {
                "id": "task-id", "cwd": "/repo", "timestamp": "2026-09-24T08:00:00Z",
            }},
            {"type": "event_msg", "payload": {"type": "token_count", "info": {
                "last_token_usage": {"input_tokens": 12, "output_tokens": 4},
            }}},
        ]
        with tempfile.TemporaryDirectory() as directory:
            _, session = self.collect(self.write_session(directory, events))

        self.assertEqual(session["status"], "unknown")
        self.assertIsNone(session["prompt_tldr"])
        self.assertEqual(session["started_at"], "2026-09-24T08:00:00Z")
        self.assertIsNone(session["finished_at"])
        self.assertIsNone(session["duration_ms"])
        self.assertIsNone(session["token_usage"])
        self.assertIsNone(session["outcome"])

    def test_invalid_and_partial_token_counts_are_typed_safely(self):
        self.assertIsNone(token_usage_from_info({"last_token_usage": {"input_tokens": 10}}))
        self.assertEqual(token_usage_from_info({"total_token_usage": {
            "input_tokens": True, "output_tokens": 3,
        }}), {
            "input_tokens": None, "output_tokens": 3, "cached_input_tokens": None,
            "reasoning_output_tokens": None, "total_tokens": None,
        })

    def test_native_url_requires_matching_codex_metadata_and_rollout_filename(self):
        session_id = "01a0ceaf-c451-7f13-a104-de0966d48183"
        events = [{"type": "session_meta", "payload": {
            "id": session_id, "cwd": "/repo", "timestamp": "2026-09-24T08:00:00Z",
        }}]
        filename = f"rollout-2026-09-24T08-00-00-{session_id}.jsonl"
        with tempfile.TemporaryDirectory() as directory:
            _, session = self.collect(self.write_session(directory, events, filename))

        self.assertEqual(session["native_url"], f"codex://threads/{session_id}")
        self.assertNotIn("/repo", session["native_url"])

    def test_native_url_is_omitted_for_malformed_or_mismatched_ids(self):
        valid_id = "01a0ceaf-c451-7f13-a104-de0966d48183"
        other_id = "01a0ceaf-c451-7f13-a104-de0966d48184"
        for session_id in ("not-a-thread-id", "01a0ceaf-c451-7f13-a104-de0966d48183?x=1", other_id):
            with self.subTest(session_id=session_id), tempfile.TemporaryDirectory() as directory:
                events = [{"type": "session_meta", "payload": {
                    "id": session_id, "cwd": "/repo", "timestamp": "2026-09-24T08:00:00Z",
                }}]
                filename = f"rollout-2026-09-24T08-00-00-{valid_id}.jsonl"
                _, session = self.collect(self.write_session(directory, events, filename))

            self.assertIsNone(session["native_url"])

    def test_native_url_is_absent_without_session_id_or_codex_filename(self):
        session_id = "01a0ceaf-c451-7f13-a104-de0966d48183"
        events = [{"type": "session_meta", "payload": {
            "cwd": "/repo", "timestamp": "2026-09-24T08:00:00Z",
        }}]
        with tempfile.TemporaryDirectory() as directory:
            self.assertIsNone(self.collect(self.write_session(directory, events)))

        events[0]["payload"]["id"] = session_id
        with tempfile.TemporaryDirectory() as directory:
            _, session = self.collect(self.write_session(directory, events))

        self.assertIsNone(session["native_url"])


if __name__ == "__main__":
    unittest.main()
