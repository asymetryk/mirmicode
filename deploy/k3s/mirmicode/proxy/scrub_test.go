package main

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestScrubWorkingSetJSONNullsPromptAliases(t *testing.T) {
	const (
		camel = "SENTINEL_CAMEL_PROMPT"
		snake = "SENTINEL_SNAKE_PROMPT"
		note  = "SENTINEL_NOTE_PROMPT"
		flat  = "SENTINEL_FLAT_PROMPT"
	)
	raw := []byte(`{
	  "snapshot": {"stale": false, "count": 9007199254740993},
	  "items": [
	    {
	      "item_id": "camel",
	      "observed": {
	        "repo": "example/demo",
	        "lifecycle": "idle",
	        "lastUserPrompt": "` + camel + `",
	        "last_user_prompt": "` + snake + `"
	      },
	      "annotation": {
	        "label": "a < b & c",
	        "note": "` + note + `",
	        "status": "open",
	        "hidden": false
	      },
	      "last_prompt": "` + flat + `",
	      "lastPrompt": "SENTINEL_LAST_PROMPT",
	      "last_user_message": "SENTINEL_LUM",
	      "lastUserMessage": "SENTINEL_LUM2",
	      "user_prompt": "SENTINEL_UP",
	      "userPrompt": "SENTINEL_UP2",
	      "prompt": "SENTINEL_P",
	      "input": "SENTINEL_INPUT",
	      "thread_name": "keep-thread"
	    },
	    {
	      "item_id": "bare",
	      "observed": {"repo": "example/demo", "lastUserPrompt": "   "},
	      "annotation": {"label": "Only a thread", "note": " "}
	    }
	  ],
	  "note": "operator diary that is not annotation.note"
	}`)

	out, err := scrubWorkingSetJSON(raw)
	if err != nil {
		t.Fatal(err)
	}
	text := string(out)
	for _, secret := range []string{camel, snake, note, flat, "SENTINEL_LAST_PROMPT", "SENTINEL_LUM", "SENTINEL_LUM2", "SENTINEL_UP", "SENTINEL_UP2", "SENTINEL_P", "SENTINEL_INPUT"} {
		if strings.Contains(text, secret) {
			t.Fatalf("leaked %s in %s", secret, text)
		}
	}
	if !strings.Contains(text, "a < b & c") {
		t.Fatalf("label was escaped or dropped: %s", text)
	}
	if !strings.Contains(text, "operator diary that is not annotation.note") {
		t.Fatalf("non-annotation note dropped: %s", text)
	}

	var payload map[string]any
	dec := json.NewDecoder(strings.NewReader(text))
	dec.UseNumber()
	if err := dec.Decode(&payload); err != nil {
		t.Fatal(err)
	}
	items := payload["items"].([]any)
	camelItem := items[0].(map[string]any)
	if camelItem["hasContextSnippet"] != true {
		t.Fatalf("hasContextSnippet %#v", camelItem["hasContextSnippet"])
	}
	observed := camelItem["observed"].(map[string]any)
	if observed["lastUserPrompt"] != nil || observed["last_user_prompt"] != nil {
		t.Fatalf("observed prompts %#v", observed)
	}
	if observed["repo"] != "example/demo" || observed["lifecycle"] != "idle" {
		t.Fatalf("observed metadata %#v", observed)
	}
	ann := camelItem["annotation"].(map[string]any)
	if ann["note"] != nil {
		t.Fatalf("note %#v", ann["note"])
	}
	if ann["label"] != "a < b & c" || ann["status"] != "open" || ann["hidden"] != false {
		t.Fatalf("annotation metadata %#v", ann)
	}
	for _, key := range []string{"last_prompt", "lastPrompt", "last_user_message", "lastUserMessage", "user_prompt", "userPrompt", "prompt", "input"} {
		if camelItem[key] != nil {
			t.Fatalf("%s = %#v", key, camelItem[key])
		}
	}
	if camelItem["thread_name"] != "keep-thread" {
		t.Fatalf("thread %#v", camelItem["thread_name"])
	}

	bare := items[1].(map[string]any)
	if _, ok := bare["hasContextSnippet"]; ok {
		t.Fatalf("blank prompt counted as a snippet: %#v", bare["hasContextSnippet"])
	}
	bareObs := bare["observed"].(map[string]any)
	if bareObs["lastUserPrompt"] != nil {
		t.Fatalf("blank prompt kept: %#v", bareObs["lastUserPrompt"])
	}

	snap := payload["snapshot"].(map[string]any)
	if snap["stale"] != false {
		t.Fatalf("stale %#v", snap["stale"])
	}
	if snap["count"].(json.Number).String() != "9007199254740993" {
		t.Fatalf("count %v", snap["count"])
	}
}

func TestScrubNestedUnitsAndLeavesBareUnits(t *testing.T) {
	raw := []byte(`{
	  "bases": [
	    {
	      "repo": "example/demo",
	      "label": "Map",
	      "units": [
	        {"id": "u1", "last_prompt": "SENTINEL_UNIT", "thread_name": "t"},
	        {"id": "u2", "thread_name": "bare"}
	      ]
	    }
	  ]
	}`)
	out, err := scrubWorkingSetJSON(raw)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(out), "SENTINEL_UNIT") {
		t.Fatalf("leaked unit prompt: %s", out)
	}
	var payload map[string]any
	if err := json.Unmarshal(out, &payload); err != nil {
		t.Fatal(err)
	}
	base := payload["bases"].([]any)[0].(map[string]any)
	if _, ok := base["hasContextSnippet"]; ok {
		t.Fatalf("base flagged from a child unit: %#v", base["hasContextSnippet"])
	}
	units := base["units"].([]any)
	first := units[0].(map[string]any)
	second := units[1].(map[string]any)
	if first["hasContextSnippet"] != true || first["last_prompt"] != nil || first["thread_name"] != "t" {
		t.Fatalf("first unit %#v", first)
	}
	if _, ok := second["hasContextSnippet"]; ok {
		t.Fatalf("bare unit %#v", second)
	}
	if base["label"] != "Map" {
		t.Fatalf("label %#v", base["label"])
	}
}

func TestScrubRejectsTrailingJSON(t *testing.T) {
	if _, err := scrubWorkingSetJSON([]byte(`{"ok":true}{"lastUserPrompt":"SENTINEL"}`)); err == nil {
		t.Fatal("expected trailing json error")
	}
}

func TestPromptsScrubEnabled(t *testing.T) {
	t.Setenv("PUBLIC_MODE", "")
	t.Setenv("PUBLIC_FULL_LIVE", "")
	if promptsScrubEnabled() {
		t.Fatal("unset PUBLIC_MODE should leave prompts in place")
	}
	t.Setenv("PUBLIC_MODE", "1")
	if !promptsScrubEnabled() {
		t.Fatal("PUBLIC_MODE=1 should scrub")
	}
	t.Setenv("PUBLIC_MODE", " yes ")
	if !promptsScrubEnabled() {
		t.Fatal("trimmed yes should scrub")
	}
	t.Setenv("PUBLIC_FULL_LIVE", "on")
	if promptsScrubEnabled() {
		t.Fatal("full live should keep prompts")
	}
	t.Setenv("PUBLIC_MODE", "0")
	t.Setenv("PUBLIC_FULL_LIVE", "")
	if promptsScrubEnabled() {
		t.Fatal("PUBLIC_MODE=0 should leave prompts in place")
	}
}

func TestScrubListenAddrLoopbackOnly(t *testing.T) {
	got, err := scrubListenAddr("127.0.0.1:8444")
	if err != nil || got != "127.0.0.1:8444" {
		t.Fatalf("got %q err %v", got, err)
	}
	if _, err := scrubListenAddr("[::1]:8444"); err != nil {
		t.Fatal(err)
	}
	for _, bad := range []string{"0.0.0.0:8444", "10.1.2.3:8444", "localhost:8444", "8444"} {
		if _, err := scrubListenAddr(bad); err == nil {
			t.Fatalf("accepted %q", bad)
		}
	}
}
