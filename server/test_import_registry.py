import unittest
import json
import hashlib
import tempfile
from pathlib import Path
from unittest.mock import patch

from import_registry import build_seed, normalize_origin, post_seed, validate_endpoint


class RegistrySeedTests(unittest.TestCase):
    def test_endpoint_accepts_https_and_loopback_http_only(self):
        self.assertEqual(validate_endpoint("https://mirmicode.example/"), "https://mirmicode.example")
        self.assertEqual(validate_endpoint("http://127.0.0.1:8080"), "http://127.0.0.1:8080")
        self.assertEqual(validate_endpoint("http://localhost:8080/"), "http://localhost:8080")
        self.assertEqual(validate_endpoint("http://[::1]:8080"), "http://[::1]:8080")
        for endpoint in (
            "http://mirmicode.example:8080",
            "http://localhost.example:8080",
            "https://user@mirmicode.example",
            "https://mirmicode.example/api",
            "https://mirmicode.example/?redirect=elsewhere",
        ):
            with self.subTest(endpoint=endpoint), self.assertRaises(ValueError):
                validate_endpoint(endpoint)

    def test_normalizes_common_github_origin_forms(self):
        expected = "github.com/asymetryk/mirmicode"
        for value in (
            expected,
            "https://github.com/Asymetryk/Mirmicode.git",
            "git@github.com:Asymetryk/Mirmicode.git",
            "ssh://git@github.com/Asymetryk/Mirmicode.git",
        ):
            with self.subTest(value=value):
                self.assertEqual(normalize_origin(value), expected)
        self.assertIsNone(normalize_origin("https://example.com/asymetryk/mirmicode"))
        self.assertIsNone(normalize_origin("github.com/asymetryk"))
        self.assertEqual(
            normalize_origin("origin.cursor.com/howard-shaw/ai-stack-observatory"),
            "origin.cursor.com/howard-shaw/ai-stack-observatory",
        )
        self.assertEqual(
            normalize_origin("https://origin.cursor.com/howard-shaw/ai-stack-observatory.git"),
            "origin.cursor.com/howard-shaw/ai-stack-observatory",
        )
        local_origin = "local:/Users/howard/Documents/Development Projects/Policy Sentinel.git"
        self.assertEqual(
            normalize_origin(local_origin),
            "local:sha256:" + hashlib.sha256(local_origin.encode("utf-8")).hexdigest(),
        )
        self.assertIsNone(normalize_origin("local:/Users/howard/../private/repo.git"))

    def test_builds_one_unknown_stage_camp_and_preserves_exact_openproject_association(self):
        op = {
            "identifier": "Repo-Mirmicode",
            "url": "https://openproject.tail21f530.ts.net/projects/Repo-Mirmicode",
        }
        registry = {
            "verified_origins": [
                {"origin": "github.com/asymetryk/mirmicode", "openproject": op,
                 "buzz": {"channel_id": "b9faf317-85e2-4a89-ab4e-592791f70f3c"}},
                {"origin": "https://github.com/ASYMETRYK/MIRMICODE.git", "openproject": op,
                 "buzz": {"channel_id": "b9faf317-85e2-4a89-ab4e-592791f70f3c"}},
            ],
            "local_repositories": [{"name": "originless"}] * 4,
            "identity_pending": ["unresolved"],
            "reconciliation_pending": [{"origin": "pending"}] * 4,
        }
        result = build_seed(registry)
        payload = result["payload"]
        self.assertEqual(result["summary"]["camp_count"], 1)
        self.assertEqual(result["summary"]["duplicate_entries_deduplicated"], 1)
        self.assertEqual(result["deduped_origins"], ["github.com/asymetryk/mirmicode"])
        self.assertEqual(payload["source"], "registry-seed")
        self.assertEqual(payload["sessions"], [])
        camp = payload["repositories"][0]
        self.assertEqual(camp["repo_key"], "github.com/asymetryk/mirmicode")
        self.assertEqual(camp["openproject_name"], op["identifier"])
        self.assertEqual(camp["openproject_url"], op["url"])
        self.assertIsNone(camp["buzz_url"])
        self.assertEqual(camp["buzz_channel_id"], "b9faf317-85e2-4a89-ab4e-592791f70f3c")
        self.assertIsNone(camp["label"])
        self.assertIsNone(camp["stage"])
        self.assertEqual(result["summary"]["omissions"]["originless_local_repositories"], 4)
        self.assertEqual(result["summary"]["omissions"]["identity_pending_entries"], 1)
        self.assertEqual(result["summary"]["omissions"]["reconciliation_pending_entries"], 4)

    def test_invalid_and_conflicting_entries_are_reported_and_not_seeded(self):
        registry = {
            "verified_origins": [
                {"origin": "github.com/asymetryk/one", "openproject": {
                    "identifier": "repo-one", "url": "https://openproject.example/projects/one",
                }},
                {"origin": "https://github.com/ASYMETRYK/ONE.git", "openproject": {
                    "identifier": "different-association", "url": "https://openproject.example/projects/other",
                }},
                {"origin": "https://gitlab.com/asymetryk/two", "openproject": {
                    "identifier": "repo-two", "url": "https://openproject.example/projects/two",
                }},
                {"origin": "github.com/asymetryk/three"},
            ],
        }
        result = build_seed(registry)
        self.assertEqual(result["payload"]["repositories"], [])
        self.assertEqual(result["conflicting_origins"], ["github.com/asymetryk/one"])
        self.assertEqual(result["summary"]["conflicting_origins_omitted"], 1)
        self.assertEqual(result["summary"]["conflicting_entries_omitted"], 2)
        self.assertEqual(result["summary"]["omissions"]["invalid_origin_entries"], 1)
        self.assertEqual(result["summary"]["omissions"]["missing_openproject_association_entries"], 1)

    def test_verified_non_github_origins_keep_identity_without_invented_browser_links(self):
        local_origin = "local:/Users/howard/Documents/Development Projects/Policy Sentinel.git"
        entries = [
            ("origin.cursor.com/howard-shaw/ai-stack-observatory", "repo-ai-stack-observatory"),
            (local_origin, "repo-policy-sentinel"),
        ]
        registry = {"verified_origins": [
            {"origin": origin, "openproject": {
                "identifier": identifier,
                "url": f"https://openproject.example/projects/{identifier}",
            }}
            for origin, identifier in entries
        ]}
        result = build_seed(registry)
        local_key = normalize_origin(local_origin)
        cursor_key = normalize_origin(entries[0][0])
        camps = {camp["repo_key"]: camp for camp in result["payload"]["repositories"]}
        self.assertEqual(set(camps), {local_key, cursor_key})
        self.assertIsNone(camps[local_key]["github_url"])
        self.assertEqual(camps[local_key]["label"], "Policy Sentinel")
        self.assertIsNone(camps[cursor_key]["github_url"])
        serialized = json.dumps(result)
        self.assertNotIn(local_origin, serialized)
        self.assertNotIn("/Users/howard/Documents/Development Projects", serialized)

    def test_invalid_buzz_channel_ids_are_not_seeded_as_native_destinations(self):
        result = build_seed({"verified_origins": [{
            "origin": "github.com/asymetryk/mirmicode",
            "openproject": {
                "identifier": "repo-mirmicode",
                "url": "https://openproject.example/projects/repo-mirmicode",
            },
            "buzz": {"channel_id": "not-a-uuid"},
        }]})
        self.assertIsNone(result["payload"]["repositories"][0]["buzz_channel_id"])

    def test_apply_uses_token_file_as_bearer_without_echoing_it(self):
        payload = {"source": "registry-seed", "repositories": [], "sessions": []}
        token = "secret-test-token-value"

        class Response:
            status = 200

            def __enter__(self):
                return self

            def __exit__(self, *_):
                return False

            def read(self):
                return b'{"source":"registry-seed","repositories":0,"sessions":0}'

        class Opener:
            def open(self, request, timeout):
                self.request = request
                self.timeout = timeout
                return Response()

        with tempfile.TemporaryDirectory() as directory:
            token_path = Path(directory) / "token"
            token_path.write_text(token, encoding="utf-8")
            opener = Opener()
            with patch("import_registry.build_opener", return_value=opener):
                response = post_seed("https://mirmicode-uat.example", token_path, payload)
        self.assertEqual(opener.request.get_header("Authorization"), f"Bearer {token}")
        self.assertEqual(opener.request.full_url, "https://mirmicode-uat.example/api/v1/ingest")
        self.assertEqual(json.loads(opener.request.data), payload)
        self.assertEqual(response["source"], "registry-seed")


if __name__ == "__main__":
    unittest.main()
