package main

import (
	"bytes"
	"compress/gzip"
	"context"
	"crypto/tls"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

const defaultScrubListen = "127.0.0.1:8444"
const maxScrubBody = 32 << 20

func promptsScrubEnabled() bool {
	return truthyEnv(os.Getenv("PUBLIC_MODE")) && !truthyEnv(os.Getenv("PUBLIC_FULL_LIVE"))
}

func truthyEnv(value string) bool {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "1", "true", "yes", "on":
		return true
	default:
		return false
	}
}

func startPromptScrubProxy() error {
	addr, err := scrubListenAddr(getenv("SCRUB_LISTEN", defaultScrubListen))
	if err != nil {
		return err
	}
	host := getenv("WORKING_SET_UPSTREAM_HOST", "cahq.tail21f530.ts.net")
	port, err := strconv.Atoi(getenv("WORKING_SET_UPSTREAM_PORT", "443"))
	if err != nil || port < 1 || port > 65535 || !validDNSName(host) {
		return errors.New("upstream host or port is invalid")
	}
	base := &url.URL{Scheme: "https", Host: host}
	if port != 443 {
		base.Host = net.JoinHostPort(host, strconv.Itoa(port))
	}
	ln, err := net.Listen("tcp", addr)
	if err != nil {
		return err
	}
	srv := &http.Server{
		Handler:           newScrubHandler(newSocksUpstreamClient(host, port), base, maxScrubBody),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       60 * time.Second,
		WriteTimeout:      60 * time.Second,
	}
	go func() {
		if err := srv.Serve(ln); err != nil && !errors.Is(err, http.ErrServerClosed) {
			fmt.Fprintf(os.Stderr, "scrubproxy: %v\n", err)
			os.Exit(1)
		}
	}()
	fmt.Fprintf(os.Stderr, "scrubproxy: listening on %s\n", addr)
	return nil
}

func scrubListenAddr(raw string) (string, error) {
	host, port, err := net.SplitHostPort(strings.TrimSpace(raw))
	if err != nil {
		return "", fmt.Errorf("scrub listen address: %w", err)
	}
	ip := net.ParseIP(host)
	if ip == nil || !ip.IsLoopback() {
		return "", errors.New("scrub proxy must bind a loopback address")
	}
	return net.JoinHostPort(ip.String(), port), nil
}

func newSocksUpstreamClient(host string, port int) *http.Client {
	socks := getenv("SOCKS_ADDR", "127.0.0.1:1055")
	transport := &http.Transport{
		DisableCompression:    true,
		ForceAttemptHTTP2:     false,
		TLSHandshakeTimeout:   10 * time.Second,
		ResponseHeaderTimeout: 60 * time.Second,
		DialTLSContext: func(ctx context.Context, _, _ string) (net.Conn, error) {
			raw, err := dialSOCKS5(socks, host, port, 10*time.Second)
			if err != nil {
				return nil, err
			}
			tlsConn := tls.Client(raw, &tls.Config{
				ServerName: host,
				MinVersion: tls.VersionTLS12,
				NextProtos: []string{"http/1.1"},
			})
			if err := tlsConn.HandshakeContext(ctx); err != nil {
				raw.Close()
				return nil, err
			}
			return tlsConn, nil
		},
	}
	return &http.Client{
		Timeout:   60 * time.Second,
		Transport: transport,
		CheckRedirect: func(*http.Request, []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}
}

type scrubHandler struct {
	client  *http.Client
	base    *url.URL
	maxBody int64
}

func newScrubHandler(client *http.Client, base *url.URL, maxBody int64) http.Handler {
	if maxBody <= 0 {
		maxBody = maxScrubBody
	}
	return scrubHandler{client: client, base: base, maxBody: maxBody}
}

func (h scrubHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	upstream, err := h.upstreamRequest(r)
	if err != nil {
		http.Error(w, "working set unavailable", http.StatusBadGateway)
		return
	}
	resp, err := h.client.Do(upstream)
	if err != nil {
		fmt.Fprintf(os.Stderr, "scrubproxy: upstream %s %s: %v\n", r.Method, r.URL.Path, err)
		http.Error(w, "working set unavailable", http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	body, err := readLimited(resp.Body, h.maxBody)
	if err != nil {
		fmt.Fprintf(os.Stderr, "scrubproxy: read %s: %v\n", r.URL.Path, err)
		http.Error(w, "working set unavailable", http.StatusBadGateway)
		return
	}
	decoded, err := decodeBody(resp.Header.Get("Content-Encoding"), body, h.maxBody)
	if err != nil {
		fmt.Fprintf(os.Stderr, "scrubproxy: decode %s: %v\n", r.URL.Path, err)
		http.Error(w, "working set unavailable", http.StatusBadGateway)
		return
	}
	body = decoded

	scrubbed := false
	if len(bytes.TrimSpace(body)) > 0 && looksLikeJSON(resp.Header.Get("Content-Type"), body) {
		next, scrubErr := scrubWorkingSetJSON(body)
		if scrubErr != nil {
			fmt.Fprintf(os.Stderr, "scrubproxy: scrub %s: %v\n", r.URL.Path, scrubErr)
			http.Error(w, "working set unavailable", http.StatusBadGateway)
			return
		}
		body = next
		scrubbed = true
	}

	copyResponseHeaders(w.Header(), resp.Header)
	w.Header().Del("Content-Encoding")
	w.Header().Set("Content-Length", strconv.Itoa(len(body)))
	if scrubbed {
		w.Header().Set("Cache-Control", "no-store")
		if !strings.Contains(strings.ToLower(w.Header().Get("Content-Type")), "json") {
			w.Header().Set("Content-Type", "application/json")
		}
	}
	w.WriteHeader(resp.StatusCode)
	_, _ = w.Write(body)
	fmt.Fprintf(os.Stderr, "scrubproxy: %s %s -> %d scrubbed=%t bytes=%d\n", r.Method, r.URL.Path, resp.StatusCode, scrubbed, len(body))
}

func (h scrubHandler) upstreamRequest(in *http.Request) (*http.Request, error) {
	target := *h.base
	path := in.URL.EscapedPath()
	if path == "" {
		path = "/"
	}
	target.Path = path
	target.RawPath = ""
	target.RawQuery = in.URL.RawQuery
	req, err := http.NewRequestWithContext(in.Context(), in.Method, target.String(), in.Body)
	if err != nil {
		return nil, err
	}
	req.Header = in.Header.Clone()
	dropHopHeaders(req.Header)
	req.Header.Set("Accept-Encoding", "identity")
	req.Host = h.base.Host
	return req, nil
}

func looksLikeJSON(contentType string, body []byte) bool {
	if strings.Contains(strings.ToLower(contentType), "json") {
		return true
	}
	trimmed := bytes.TrimSpace(body)
	return len(trimmed) > 0 && (trimmed[0] == '{' || trimmed[0] == '[')
}

func decodeBody(encoding string, body []byte, limit int64) ([]byte, error) {
	switch strings.ToLower(strings.TrimSpace(encoding)) {
	case "", "identity":
		return body, nil
	case "gzip":
		zr, err := gzip.NewReader(bytes.NewReader(body))
		if err != nil {
			return nil, err
		}
		defer zr.Close()
		return readLimited(zr, limit)
	default:
		return nil, fmt.Errorf("unsupported content-encoding %q", encoding)
	}
}

func readLimited(r io.Reader, n int64) ([]byte, error) {
	body, err := io.ReadAll(io.LimitReader(r, n+1))
	if err != nil {
		return nil, err
	}
	if int64(len(body)) > n {
		return nil, errors.New("response body too large")
	}
	return body, nil
}

func copyResponseHeaders(dst, src http.Header) {
	hop := map[string]struct{}{
		"Connection":          {},
		"Keep-Alive":          {},
		"Proxy-Authenticate":  {},
		"Proxy-Authorization": {},
		"Te":                  {},
		"Trailer":             {},
		"Transfer-Encoding":   {},
		"Upgrade":             {},
		"Content-Length":      {},
	}
	for key, values := range src {
		if _, skip := hop[http.CanonicalHeaderKey(key)]; skip {
			continue
		}
		for _, value := range values {
			dst.Add(key, value)
		}
	}
}

func dropHopHeaders(h http.Header) {
	for _, key := range []string{
		"Connection",
		"Keep-Alive",
		"Proxy-Authenticate",
		"Proxy-Authorization",
		"Te",
		"Trailer",
		"Transfer-Encoding",
		"Upgrade",
	} {
		h.Del(key)
	}
}
