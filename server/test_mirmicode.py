import json
import http.client
import tempfile
import threading
import unittest
from http.server import ThreadingHTTPServer
from pathlib import Path

from collect_codex import last_event
from mirmicode import (
    RevisionConflict, connect, ingest, make_handler, snapshot, update_metadata,
    valid_editor_session,
)


class StoreTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp.name) / "store.sqlite3"

    def tearDown(self):
        self.temp.cleanup()

    def test_ingest_survives_reopen_and_exposes_only_metadata(self):
        payload = {
            "source": "codex-local",
            "repositories": [{"repo_key": "github.com/asymetryk/mirmicode",
                              "github_url": "https://github.com/asymetryk/mirmicode",
                              "openproject_url": "https://openproject.example/projects/repo-mirmicode"}],
            "sessions": [{"id": "task-1", "repo_key": "github.com/asymetryk/mirmicode",
                          "harness": "Codex", "status": "working",
                          "updated_at": "2026-09-23T14:00:00Z", "parent_id": "parent-1"}],
        }
        with connect(self.db_path) as db:
            ingest(db, payload)
            ingest(db, payload)
        with connect(self.db_path) as db:
            result = snapshot(db)
        self.assertEqual(len(result["camps"]), 1)
        self.assertEqual(len(result["units"]), 1)
        self.assertEqual(result["units"][0]["parent_id"], "parent-1")
        self.assertNotIn("prompt", json.dumps(result).lower())

    def test_invalid_session_rolls_back_entire_batch(self):
        payload = {"source": "codex-local", "repositories": [{"repo_key": "repo"}],
                   "sessions": [{"id": "session", "repo_key": "repo", "harness": "Codex",
                                 "status": "invented", "updated_at": "2026-09-23T14:00:00Z"}]}
        with connect(self.db_path) as db:
            with self.assertRaises(ValueError):
                ingest(db, payload)
            self.assertEqual(db.execute("SELECT COUNT(*) FROM repositories").fetchone()[0], 0)

    def test_timestamp_without_timezone_is_rejected(self):
        payload = {"source": "codex-local", "repositories": [{"repo_key": "repo"}],
                   "sessions": [{"id": "session", "repo_key": "repo", "harness": "Codex",
                                 "status": "working", "updated_at": "2026-09-23T14:00:00"}]}
        with connect(self.db_path) as db:
            with self.assertRaisesRegex(ValueError, "timezone"):
                ingest(db, payload)

    def test_no_source_is_marked_stale(self):
        with connect(self.db_path) as db:
            result = snapshot(db)
        self.assertTrue(result["stale"])
        self.assertEqual(result["units"], [])

    def test_complete_source_window_prunes_old_sessions(self):
        repository = {"repo_key": "github.com/asymetryk/mirmicode"}
        session = {"id": "old", "repo_key": repository["repo_key"],
                   "harness": "Codex", "status": "completed",
                   "updated_at": "2026-09-23T14:00:00Z"}
        with connect(self.db_path) as db:
            ingest(db, {"source": "codex-local", "repositories": [repository],
                        "sessions": [session]})
            ingest(db, {"source": "codex-local", "repositories": [repository],
                        "sessions": []})
            self.assertEqual(snapshot(db)["units"], [])

    def test_partial_second_source_keeps_repository_associations(self):
        key = "github.com/asymetryk/mirmicode"
        with connect(self.db_path) as db:
            ingest(db, {"source": "registry", "repositories": [{
                "repo_key": key,
                "openproject_url": "https://openproject.example/projects/repo-mirmicode",
                "buzz_url": "https://hive.example/channels/mirmicode",
            }], "sessions": []})
            ingest(db, {"source": "codex-local", "repositories": [{
                "repo_key": key, "label": "mirmicode",
            }], "sessions": []})
            camp = snapshot(db)["camps"][0]
        self.assertEqual(camp["repo_label"], "mirmicode")
        self.assertEqual(camp["open_project"]["url"],
                         "https://openproject.example/projects/repo-mirmicode")
        self.assertEqual(camp["buzz_url"], "https://hive.example/channels/mirmicode")

    def test_shared_metadata_is_durable_and_separate_from_observations(self):
        key = "github.com/asymetryk/mirmicode"
        with connect(self.db_path) as db:
            ingest(db, {"source": "codex-local", "repositories": [{
                "repo_key": key, "github_url": "https://github.com/asymetryk/mirmicode",
                "openproject_url": "https://openproject.example/projects/old",
                "buzz_url": "https://hive.example/channels/old",
            }], "sessions": [{
                "id": "task-1", "repo_key": key, "harness": "Codex", "status": "completed",
                "thread_name": "Latest discussion", "native_url": "codex://threads/task-1",
                "updated_at": "2026-09-23T14:00:00Z",
            }]})
            result = update_metadata(db, {
                "expected_revision": 0, "repo_key": key,
                "appearance": {"color": "#AABBCC", "building_set": ["pad", "depot", "lab"]},
                "links": {"openproject_url": "https://openproject.example/projects/fixed"},
                "unit_id": "task-1", "unit_appearance": {"unit_role": "builder"},
            }, "editor:test")
            self.assertEqual(result["revision"], 1)
        with connect(self.db_path) as db:
            ingest(db, {"source": "codex-local", "repositories": [{
                "repo_key": key, "github_url": "https://github.com/asymetryk/mirmicode",
                "openproject_url": "https://openproject.example/projects/old",
                "buzz_url": "https://hive.example/channels/old",
            }], "sessions": [{
                "id": "task-1", "repo_key": key, "harness": "Codex", "status": "completed",
                "thread_name": "Latest discussion", "native_url": "codex://threads/task-1",
                "updated_at": "2026-09-23T14:00:00Z",
            }]})
            data = snapshot(db)
            camp = data["camps"][0]
            unit = data["units"][0]
            self.assertEqual(data["metadata_revision"], 1)
            self.assertEqual(camp["appearance"], {"color": "#aabbcc", "building_set": ["pad", "depot", "lab"]})
            self.assertEqual(camp["links"]["openproject_url"], "https://openproject.example/projects/fixed")
            self.assertEqual(camp["links"]["github_url"], "https://github.com/asymetryk/mirmicode")
            self.assertEqual(unit["appearance"]["unit_role"], "builder")
            self.assertEqual(camp["latest_thread"], {
                "id": "task-1", "title": "Latest discussion", "url": "codex://threads/task-1",
                "updated_at": "2026-09-23T14:00:00Z",
            })

    def test_metadata_uses_revision_conflicts_and_audit(self):
        key = "github.com/asymetryk/mirmicode"
        with connect(self.db_path) as db:
            ingest(db, {"source": "codex-local", "repositories": [{"repo_key": key}], "sessions": []})
            update_metadata(db, {"expected_revision": 0, "repo_key": key,
                                 "links": {"buzz_url": None}}, "editor:test")
            with self.assertRaises(RevisionConflict) as conflict:
                update_metadata(db, {"expected_revision": 0, "repo_key": key,
                                     "appearance": {"building_set": ["pad"]}}, "editor:test")
            self.assertEqual(conflict.exception.revision, 1)
            audit = db.execute("SELECT revision, actor_id, after_json FROM metadata_audit").fetchone()
        self.assertEqual(audit["revision"], 1)
        self.assertEqual(audit["actor_id"], "editor:test")
        self.assertIn('"buzz_url":null', audit["after_json"])

    def test_metadata_rejects_invalid_links_and_unknown_unit(self):
        key = "github.com/asymetryk/mirmicode"
        with connect(self.db_path) as db:
            ingest(db, {"source": "codex-local", "repositories": [{"repo_key": key}], "sessions": []})
            with self.assertRaisesRegex(ValueError, "https URL"):
                update_metadata(db, {"expected_revision": 0, "repo_key": key,
                                     "links": {"buzz_url": "javascript:alert(1)"}}, "editor:test")
            with self.assertRaisesRegex(ValueError, "building_set"):
                update_metadata(db, {"expected_revision": 0, "repo_key": key,
                                     "appearance": {"building_set": ["not-a-building"]}}, "editor:test")
            with self.assertRaisesRegex(ValueError, "session in repo_key"):
                update_metadata(db, {"expected_revision": 0, "repo_key": key,
                                     "unit_id": "missing", "unit_appearance": {"unit_role": "builder"}}, "editor:test")

    def test_reset_removes_manual_override_and_restores_source_link(self):
        key = "github.com/asymetryk/mirmicode"
        observed = "https://hive.example/channels/source"
        with connect(self.db_path) as db:
            ingest(db, {"source": "codex-local", "repositories": [{
                "repo_key": key, "buzz_url": observed,
            }], "sessions": []})
            update_metadata(db, {"expected_revision": 0, "repo_key": key,
                                 "links": {"buzz_url": "https://hive.example/channels/fixed"}}, "editor:test")
            update_metadata(db, {"expected_revision": 1, "repo_key": key,
                                 "reset": {"links": ["buzz_url"]}}, "editor:test")
            camp = snapshot(db)["camps"][0]
        self.assertEqual(camp["links"]["buzz_url"], observed)
        self.assertEqual(camp["link_provenance"]["buzz_url"], "observation")

    def test_latest_thread_requires_a_source_native_url(self):
        key = "github.com/asymetryk/mirmicode"
        with connect(self.db_path) as db:
            ingest(db, {"source": "codex-local", "repositories": [{"repo_key": key}],
                        "sessions": [{"id": "task-1", "repo_key": key, "harness": "Codex",
                                      "status": "completed", "updated_at": "2026-09-23T14:00:00Z"}]})
            self.assertIsNone(snapshot(db)["camps"][0]["latest_thread"])

    def test_latest_thread_never_falls_back_to_an_older_available_url(self):
        key = "github.com/asymetryk/mirmicode"
        with connect(self.db_path) as db:
            ingest(db, {"source": "codex-local", "repositories": [{"repo_key": key}], "sessions": [
                {"id": "older", "repo_key": key, "harness": "Codex", "status": "completed",
                 "native_url": "codex://threads/older", "updated_at": "2026-09-23T14:00:00Z"},
                {"id": "latest", "repo_key": key, "harness": "Codex", "status": "completed",
                 "updated_at": "2026-09-23T15:00:00Z"},
            ]})
            self.assertIsNone(snapshot(db)["camps"][0]["latest_thread"])

    def test_editor_session_cookie_expires_and_cannot_be_forged(self):
        from mirmicode import editor_session_cookie
        token = "private-test-editor-token"
        cookie = editor_session_cookie(token, 2000)
        self.assertTrue(valid_editor_session(cookie, token, now=1999))
        self.assertFalse(valid_editor_session(cookie, token, now=2000))
        self.assertFalse(valid_editor_session(cookie, "different-token", now=1999))

    def test_http_edit_auth_audit_conflict_and_missing_secret(self):
        key = "github.com/asymetryk/mirmicode"
        with connect(self.db_path) as db:
            ingest(db, {"source": "codex-local", "repositories": [{"repo_key": key}], "sessions": []})
        token_path = Path(self.temp.name) / "editor-token"
        static_dir = Path(self.temp.name) / "static"
        static_dir.mkdir()

        def request(handler, method, path, headers=None, body=None):
            server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
            worker = threading.Thread(target=server.serve_forever, daemon=True)
            worker.start()
            try:
                connection = http.client.HTTPConnection("127.0.0.1", server.server_port, timeout=2)
                connection.request(method, path, body=body, headers=headers or {})
                response = connection.getresponse()
                result = response.status, dict(response.getheaders()), response.read()
                connection.close()
                return result
            finally:
                server.shutdown()
                worker.join(timeout=2)
                server.server_close()

        missing_handler = make_handler(self.db_path, static_dir, "missing-ingest", str(token_path))
        status, _, _ = request(missing_handler, "POST", "/api/v1/session", {
            "Host": "mirmicode.example", "Origin": "https://mirmicode.example",
            "Content-Type": "application/json",
        }, json.dumps({"token": "anything"}))
        self.assertEqual(status, 503)

        token_path.write_text("private-test-editor-token", encoding="utf-8")
        handler = make_handler(self.db_path, static_dir, "missing-ingest", str(token_path))
        origin_headers = {"Host": "mirmicode.example", "Origin": "https://mirmicode.example",
                          "Content-Type": "application/json"}
        status, _, _ = request(handler, "POST", "/api/v1/session", origin_headers,
                               json.dumps({"token": "wrong"}))
        self.assertEqual(status, 401)
        status, headers, _ = request(handler, "POST", "/api/v1/session", origin_headers,
                                     json.dumps({"token": "private-test-editor-token"}))
        self.assertEqual(status, 204)
        cookie = headers["Set-Cookie"]
        self.assertIn("HttpOnly", cookie)
        self.assertIn("Secure", cookie)
        self.assertNotIn("private-test-editor-token", cookie)
        status, _, response_body = request(handler, "GET", "/api/v1/session", {
            "Host": "mirmicode.example", "Cookie": cookie.split(";", 1)[0],
        })
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(response_body), {"authenticated": True})

        update_headers = {"Host": "mirmicode.example", "Origin": "https://mirmicode.example",
                          "Cookie": cookie.split(";", 1)[0], "Content-Type": "application/json"}
        body = json.dumps({"expected_revision": 0, "repo_key": key,
                           "appearance": {"color": "#123456"}})
        status, _, response_body = request(handler, "PUT", "/api/v1/metadata", update_headers, body)
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(response_body)["revision"], 1)
        status, _, response_body = request(handler, "PUT", "/api/v1/metadata", update_headers, body)
        self.assertEqual(status, 409)
        self.assertEqual(json.loads(response_body), {"error": "revision_conflict", "revision": 1})

        wrong_origin = dict(update_headers, Origin="https://attacker.example")
        status, _, _ = request(handler, "PUT", "/api/v1/metadata", wrong_origin,
                               json.dumps({"expected_revision": 1, "repo_key": key,
                                           "appearance": {"building_set": ["barracks"]}}))
        self.assertEqual(status, 403)
        with connect(self.db_path) as db:
            actor = db.execute("SELECT actor_id FROM metadata_audit").fetchone()["actor_id"]
        self.assertTrue(actor.startswith("editor:"))
        self.assertNotIn("private-test-editor-token", actor)


class CollectorTests(unittest.TestCase):
    def test_explicit_complete_wins_over_prior_start(self):
        events = [
            {"type": "event_msg", "timestamp": "2026-09-23T14:00:00Z",
             "payload": {"type": "task_started"}},
            {"type": "event_msg", "timestamp": "2026-09-23T14:01:00Z",
             "payload": {"type": "task_complete"}},
        ]
        self.assertEqual(last_event(events), ("2026-09-23T14:01:00Z", "completed"))


if __name__ == "__main__":
    unittest.main()
