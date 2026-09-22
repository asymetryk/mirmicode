#!/bin/sh
# Render the Caddyfile the way the pod entrypoint does, without starting Caddy.
set -eu

root="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

unset PUBLIC_MODE PUBLIC_FULL_LIVE WORKING_SET_AUTHORIZATION SCRUB_LISTEN || true

render() {
  token_file="${WORKING_SET_TOKEN_FILE:-$tmp/no-token}"
  env \
    MIRMICODE_RENDER_ONLY=1 \
    RUNTIME_CONFIG_PATH="$tmp/runtime-config.js" \
    CADDYFILE_TEMPLATE="${CADDYFILE_TEMPLATE:-$root/Caddyfile.template}" \
    CADDYFILE_RENDERED="$tmp/Caddyfile" \
    WORKING_SET_TOKEN_FILE="$token_file" \
    PUBLIC_MODE="${PUBLIC_MODE:-}" \
    PUBLIC_FULL_LIVE="${PUBLIC_FULL_LIVE:-}" \
    sh "$root/entrypoint.sh"
}

render
grep -v '__AUTH_HEADER__' "$root/Caddyfile.template" > "$tmp/expected"
diff -u "$tmp/expected" "$tmp/Caddyfile"
grep -F 'window.__MIRMICODE__ = window.__MIRMICODE__ || {};' "$tmp/runtime-config.js" >/dev/null
handles="$(grep -c -F 'handle /runtime-config.js' "$tmp/Caddyfile")"
test "$handles" -eq 1

rm -f "$tmp/Caddyfile" "$tmp/runtime-config.js"
PUBLIC_MODE=1 render
grep -F 'reverse_proxy http://{$SCRUB_LISTEN}' "$tmp/Caddyfile" >/dev/null
if grep -F 'reverse_proxy https://{$FORWARD_LISTEN}' "$tmp/Caddyfile" >/dev/null; then
  echo "public render still uses the private TLS upstream" >&2
  exit 1
fi
if grep -F 'tls_server_name' "$tmp/Caddyfile" >/dev/null; then
  echo "public render still terminates TLS in Caddy" >&2
  exit 1
fi
grep -F 'publicMode: true' "$tmp/runtime-config.js" >/dev/null
grep -F 'Cache-Control "no-store"' "$tmp/Caddyfile" >/dev/null

rm -f "$tmp/Caddyfile" "$tmp/runtime-config.js"
PUBLIC_MODE=1 PUBLIC_FULL_LIVE=1 render
grep -F 'reverse_proxy https://{$FORWARD_LISTEN}' "$tmp/Caddyfile" >/dev/null
grep -F 'fullLive: true' "$tmp/runtime-config.js" >/dev/null

printf 'sekrit-token' > "$tmp/token"
rm -f "$tmp/Caddyfile" "$tmp/runtime-config.js"
PUBLIC_MODE=1 PUBLIC_FULL_LIVE= WORKING_SET_TOKEN_FILE="$tmp/token" render
grep -F 'header_up Authorization "{$WORKING_SET_AUTHORIZATION}"' "$tmp/Caddyfile" >/dev/null
if grep -F 'sekrit-token' "$tmp/Caddyfile" "$tmp/runtime-config.js" >/dev/null; then
  echo "token leaked into rendered config" >&2
  exit 1
fi

# ConfigMap from before the runtime-config handle: entrypoint still inserts it.
cat > "$tmp/old.Caddyfile" <<'EOF'
:8080 {
	handle /working-set/* {
		uri strip_prefix /working-set
		reverse_proxy https://{$FORWARD_LISTEN} {
			header_up Host {$WORKING_SET_UPSTREAM_HOST}
			__AUTH_HEADER__
			transport http {
				tls
				tls_server_name {$WORKING_SET_UPSTREAM_HOST}
			}
		}
	}

	handle {
		root * /srv
		try_files {path} /index.html
		file_server
	}
}
EOF
rm -f "$tmp/Caddyfile"
PUBLIC_MODE= PUBLIC_FULL_LIVE= WORKING_SET_TOKEN_FILE= \
  CADDYFILE_TEMPLATE="$tmp/old.Caddyfile" render
grep -F 'handle /runtime-config.js' "$tmp/Caddyfile" >/dev/null
grep -F 'Cache-Control "no-store"' "$tmp/Caddyfile" >/dev/null
grep -F 'try_files {path} /index.html' "$tmp/Caddyfile" >/dev/null
old_handles="$(grep -c -F 'handle /runtime-config.js' "$tmp/Caddyfile")"
test "$old_handles" -eq 1

echo "entrypoint render ok"
