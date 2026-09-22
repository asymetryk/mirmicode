package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"strings"
)

// Prompt field names read by src/adapters/normalize.ts as Last prompt.
// annotation.note is cleared only on annotation objects (see scrubNode).
// Keep this list in sync with readUnit in normalize.ts.
var promptFieldKeys = map[string]struct{}{
	"lastUserPrompt":    {},
	"last_user_prompt":  {},
	"last_prompt":       {},
	"lastPrompt":        {},
	"last_user_message": {},
	"lastUserMessage":   {},
	"user_prompt":       {},
	"userPrompt":        {},
	"prompt":            {},
	"input":             {},
}

// scrubWorkingSetJSON nulls prompt aliases and sets hasContextSnippet on any
// object whose prompt chain had a non-blank string. The boolean is what the
// map's hard filter already uses, so units stay on the public map without the text.
func scrubWorkingSetJSON(body []byte) ([]byte, error) {
	dec := json.NewDecoder(bytes.NewReader(body))
	dec.UseNumber()
	var payload any
	if err := dec.Decode(&payload); err != nil {
		return nil, err
	}
	if err := dec.Decode(&struct{}{}); err != io.EOF {
		if err == nil {
			return nil, errors.New("trailing json value")
		}
		return nil, err
	}
	scrubNode(payload)
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(payload); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func scrubNode(v any) {
	switch node := v.(type) {
	case map[string]any:
		if objectHasUsablePrompt(node) {
			node["hasContextSnippet"] = true
		}
		for key, child := range node {
			if _, scrub := promptFieldKeys[key]; scrub {
				node[key] = nil
				continue
			}
			if key == "annotation" {
				if ann, ok := child.(map[string]any); ok {
					if _, exists := ann["note"]; exists {
						ann["note"] = nil
					}
				}
			}
			scrubNode(child)
		}
	case []any:
		for _, child := range node {
			scrubNode(child)
		}
	}
}

// objectHasUsablePrompt matches normalize.ts: a snippet exists when any alias
// in the Last-prompt chain is a non-blank string. Whitespace and non-strings
// do not count. annotation.note counts only as that prompt fallback.
func objectHasUsablePrompt(obj map[string]any) bool {
	observed, _ := obj["observed"].(map[string]any)
	annotation, _ := obj["annotation"].(map[string]any)
	candidates := []any{
		mapField(observed, "lastUserPrompt"),
		mapField(observed, "last_user_prompt"),
		obj["last_prompt"],
		obj["lastPrompt"],
		obj["last_user_message"],
		obj["lastUserMessage"],
		obj["user_prompt"],
		obj["userPrompt"],
		obj["prompt"],
		obj["input"],
		mapField(annotation, "note"),
	}
	for _, candidate := range candidates {
		if usablePromptString(candidate) {
			return true
		}
	}
	return false
}

func mapField(obj map[string]any, key string) any {
	if obj == nil {
		return nil
	}
	return obj[key]
}

func usablePromptString(value any) bool {
	text, ok := value.(string)
	if !ok {
		return false
	}
	return strings.TrimSpace(text) != ""
}
