package main

import (
	"bytes"
	"compress/gzip"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
)

func TestScrubHandlerStripsJSONPrompts(t *testing.T) {
	const secret = "SENTINEL_PROXY_PROMPT"
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/working-set" {
			t.Errorf("path %s", r.URL.Path)
		}
		if r.URL.RawQuery != "view=compact" {
			t.Errorf("query %s", r.URL.RawQuery)
		}
		if r.Header.Get("Authorization") != "Bearer test-token" {
			t.Errorf("auth %q", r.Header.Get("Authorization"))
		}
		if r.Header.Get("Accept-Encoding") != "identity" {
			t.Errorf("accept-encoding %q", r.Header.Get("Accept-Encoding"))
		}
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("X-Upstream", "cahq")
		_, _ = io.WriteString(w, `{"items":[{"item_id":"camel","observed":{"repo":"example/demo","lastUserPrompt":"`+secret+`"},"annotation":{"label":"Thread","note":"SENTINEL_NOTE"}}]}`)
	}))
	defer upstream.Close()

	base, err := url.Parse(upstream.URL)
	if err != nil {
		t.Fatal(err)
	}
	handler := newScrubHandler(upstream.Client(), base, 1<<20)
	req := httptest.NewRequest(http.MethodGet, "http://mirmicode/api/v1/working-set?view=compact", nil)
	req.Header.Set("Authorization", "Bearer test-token")
	req.Header.Set("Accept-Encoding", "gzip")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status %d body %s", rec.Code, rec.Body.String())
	}
	body := rec.Body.String()
	if strings.Contains(body, secret) || strings.Contains(body, "SENTINEL_NOTE") {
		t.Fatalf("leaked prompt: %s", body)
	}
	if !strings.Contains(body, `"hasContextSnippet":true`) && !strings.Contains(body, `"hasContextSnippet": true`) {
		t.Fatalf("missing snippet flag: %s", body)
	}
	if !strings.Contains(body, `"lastUserPrompt":null`) && !strings.Contains(body, `"lastUserPrompt": null`) {
		t.Fatalf("prompt not null: %s", body)
	}
	if rec.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("cache %q", rec.Header().Get("Cache-Control"))
	}
	if rec.Header().Get("X-Upstream") != "cahq" {
		t.Fatalf("dropped header %q", rec.Header().Get("X-Upstream"))
	}
	if strings.Contains(strings.ToLower(rec.Header().Get("Content-Type")), "json") == false {
		t.Fatalf("content-type %q", rec.Header().Get("Content-Type"))
	}
}

func TestScrubHandlerPassesHTMLThrough(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = io.WriteString(w, "<html>upstream page</html>")
	}))
	defer upstream.Close()
	base, _ := url.Parse(upstream.URL)
	rec := httptest.NewRecorder()
	newScrubHandler(upstream.Client(), base, 1<<20).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "http://mirmicode/health", nil))
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), "upstream page") {
		t.Fatalf("status %d body %s", rec.Code, rec.Body.String())
	}
	if rec.Header().Get("Cache-Control") == "no-store" {
		t.Fatal("html response should keep upstream cache headers")
	}
}

func TestScrubHandlerFailClosedOnInvalidJSON(t *testing.T) {
	const secret = "SENTINEL_BROKEN_JSON"
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"lastUserPrompt":"`+secret)
	}))
	defer upstream.Close()
	base, _ := url.Parse(upstream.URL)
	rec := httptest.NewRecorder()
	newScrubHandler(upstream.Client(), base, 1<<20).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "http://mirmicode/api/v1/working-set", nil))
	if rec.Code != http.StatusBadGateway {
		t.Fatalf("status %d", rec.Code)
	}
	if strings.Contains(rec.Body.String(), secret) {
		t.Fatalf("leaked broken body: %s", rec.Body.String())
	}
}

func TestScrubHandlerDecodesGzipJSON(t *testing.T) {
	const secret = "SENTINEL_GZIP_PROMPT"
	var compressed bytes.Buffer
	zw := gzip.NewWriter(&compressed)
	_, _ = zw.Write([]byte(`{"items":[{"repo":"example/demo","prompt":"` + secret + `"}]}`))
	_ = zw.Close()

	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Content-Encoding", "gzip")
		_, _ = w.Write(compressed.Bytes())
	}))
	defer upstream.Close()
	base, _ := url.Parse(upstream.URL)
	client := upstream.Client()
	client.Transport = &http.Transport{DisableCompression: true}
	rec := httptest.NewRecorder()
	newScrubHandler(client, base, 1<<20).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "http://mirmicode/api/v1/working-set", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d body %s", rec.Code, rec.Body.String())
	}
	if strings.Contains(rec.Body.String(), secret) {
		t.Fatalf("leaked gzip prompt: %s", rec.Body.String())
	}
	if rec.Header().Get("Content-Encoding") != "" {
		t.Fatalf("content-encoding %q", rec.Header().Get("Content-Encoding"))
	}
	if !strings.Contains(rec.Body.String(), `"prompt":null`) && !strings.Contains(rec.Body.String(), `"prompt": null`) {
		t.Fatalf("prompt not null: %s", rec.Body.String())
	}
}

func TestScrubHandlerRejectsOversizedBody(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"lastUserPrompt":"SENTINEL_TOO_BIG"}`)
	}))
	defer upstream.Close()
	base, _ := url.Parse(upstream.URL)
	rec := httptest.NewRecorder()
	newScrubHandler(upstream.Client(), base, 8).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "http://mirmicode/api/v1/working-set", nil))
	if rec.Code != http.StatusBadGateway {
		t.Fatalf("status %d", rec.Code)
	}
	if strings.Contains(rec.Body.String(), "SENTINEL_TOO_BIG") {
		t.Fatalf("leaked oversized body: %s", rec.Body.String())
	}
}
