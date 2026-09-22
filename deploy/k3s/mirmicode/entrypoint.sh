#!/bin/sh
# Render Caddy, then proxy CAHQ through the Tailscale userspace SOCKS port.
set -eu

umask 077
export WORKING_SET_UPSTREAM_HOST="${WORKING_SET_UPSTREAM_HOST:-cahq.tail21f530.ts.net}"
export WORKING_SET_UPSTREAM_PORT="${WORKING_SET_UPSTREAM_PORT:-443}"
export SOCKS_ADDR="${SOCKS_ADDR:-127.0.0.1:1055}"
export FORWARD_LISTEN="${FORWARD_LISTEN:-127.0.0.1:8443}"
export XDG_CONFIG_HOME="${XDG_CONFIG_HOME:-/tmp/caddy-config}"
export XDG_DATA_HOME="${XDG_DATA_HOME:-/tmp/caddy-data}"
mkdir -p "${XDG_CONFIG_HOME}" "${XDG_DATA_HOME}"

trim() {
  printf '%s' "${1:-}" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//'
}

is_truthy() {
  case "$(trim "${1:-}")" in
    1|true|TRUE|yes|YES|on|ON) return 0 ;;
    *) return 1 ;;
  esac
}

# Public Working Set JSON is scrubbed only when PUBLIC_MODE is on and
# PUBLIC_FULL_LIVE is not. Private/tailnet leaves PUBLIC_MODE unset.
prompts_scrub_enabled() {
  if is_truthy "${PUBLIC_MODE:-}"; then
    if is_truthy "${PUBLIC_FULL_LIVE:-}"; then
      return 1
    fi
    return 0
  fi
  return 1
}

# Optional public BIP knob for CF Tunnel deploys. Leave unset on the tailnet pod.
# When set, rewrite /srv/runtime-config.js so the static map scrubs prompts
# without rebuilding the image. Unset keys leave bake-time VITE_PUBLIC_* alone.
write_runtime_config() {
  flag_js() {
    case "$(trim "${1:-}")" in
      1|true|TRUE|yes|YES|on|ON) printf 'true' ;;
      0|false|FALSE|no|NO|off|OFF) printf 'false' ;;
      *) printf 'undefined' ;;
    esac
  }
  runtime_config_path="${RUNTIME_CONFIG_PATH:-/srv/runtime-config.js}"
  public_js="$(flag_js "${PUBLIC_MODE:-}")"
  full_js="$(flag_js "${PUBLIC_FULL_LIVE:-}")"
  if [ "${public_js}" = "undefined" ] && [ "${full_js}" = "undefined" ]; then
    if [ ! -f "${runtime_config_path}" ]; then
      printf '%s\n' 'window.__MIRMICODE__ = window.__MIRMICODE__ || {};' > "${runtime_config_path}"
    fi
    return 0
  fi
  cat > "${runtime_config_path}" <<EOF
window.__MIRMICODE__ = {
  publicMode: ${public_js},
  fullLive: ${full_js}
};
EOF
}

# Private path keeps Caddy's TLS reverse_proxy to the TCP forwarder.
# Public path (PUBLIC_MODE on, full live off) sends /working-set at the
# loopback HTTP scrubber, which dials the same SOCKS upstream and nulls prompts.
rewrite_working_set_for_scrub() {
  awk '
    function delta(s,    i, c, d, n) {
      d = 0
      n = length(s)
      for (i = 1; i <= n; i++) {
        c = substr(s, i, 1)
        if (c == "{") d++
        else if (c == "}") d--
      }
      return d
    }
    BEGIN { skipping = 0; depth = 0 }
    skipping {
      depth += delta($0)
      if (depth <= 0) skipping = 0
      next
    }
    /reverse_proxy https:\/\/\{\$FORWARD_LISTEN\}/ {
      print "		reverse_proxy http://{$SCRUB_LISTEN} {"
      print "			header_up Host {$WORKING_SET_UPSTREAM_HOST}"
      print "			__AUTH_HEADER__"
      print "		}"
      depth = delta($0)
      if (depth > 0) skipping = 1
      next
    }
    { print }
  ' "$1"
}

# Older ConfigMaps omit this handle. Without it, try_files serves index.html
# for a missing /runtime-config.js and Cloudflare caches that HTML.
ensure_runtime_config_handle() {
  if grep -F 'handle /runtime-config.js' "$1" >/dev/null 2>&1; then
    cat "$1"
    return 0
  fi
  awk '
    BEGIN { inserted = 0 }
    !inserted && $0 ~ /^[[:space:]]*handle[[:space:]]*\{[[:space:]]*$/ {
      print "	handle /runtime-config.js {"
      print "		root * /srv"
      print "		header Cache-Control \"no-store\""
      print "		header Content-Type \"application/javascript; charset=utf-8\""
      print "		file_server"
      print "	}"
      print ""
      inserted = 1
    }
    { print }
  ' "$1"
}

render_caddy() {
  template="${CADDYFILE_TEMPLATE:-/etc/mirmicode/Caddyfile.template}"
  rendered="${CADDYFILE_RENDERED:-/tmp/Caddyfile}"
  staged="${rendered}.staged"
  authed="${rendered}.auth"

  if prompts_scrub_enabled; then
    export SCRUB_LISTEN="${SCRUB_LISTEN:-127.0.0.1:8444}"
    rewrite_working_set_for_scrub "${template}" > "${staged}"
  else
    cp "${template}" "${staged}"
  fi

  token_file="${WORKING_SET_TOKEN_FILE:-/run/secrets/working-set/token}"
  auth_line=""
  if [ -f "${token_file}" ]; then
    token="$(tr -d '\r\n' < "${token_file}")"
    if [ -n "${token}" ]; then
      WORKING_SET_AUTHORIZATION="Bearer ${token}"
      export WORKING_SET_AUTHORIZATION
      auth_line='header_up Authorization "{$WORKING_SET_AUTHORIZATION}"'
    fi
    unset token
  fi

  if [ -n "${auth_line}" ]; then
    awk -v auth="${auth_line}" '{ gsub(/__AUTH_HEADER__/, auth); print }' "${staged}" > "${authed}"
  else
    grep -v '__AUTH_HEADER__' "${staged}" > "${authed}"
  fi
  ensure_runtime_config_handle "${authed}" > "${rendered}"
  rm -f "${staged}" "${authed}"
  if prompts_scrub_enabled; then
    if ! grep -F 'reverse_proxy http://{$SCRUB_LISTEN}' "${rendered}" >/dev/null; then
      echo "mirmicode: PUBLIC_MODE is on but /working-set is not pointed at the scrub proxy" >&2
      exit 1
    fi
  fi
}

write_runtime_config
render_caddy

if [ "${MIRMICODE_RENDER_ONLY:-}" = "1" ]; then
  exit 0
fi

/usr/local/bin/socksforward &
fwd="$!"
caddy run --config "${CADDYFILE_RENDERED:-/tmp/Caddyfile}" --adapter caddyfile &
caddy_pid="$!"

shutdown() {
  kill "${fwd}" "${caddy_pid}" 2>/dev/null || true
}
trap shutdown INT TERM

while true; do
  if ! kill -0 "${caddy_pid}" 2>/dev/null; then
    status=0
    wait "${caddy_pid}" || status="$?"
    kill "${fwd}" 2>/dev/null || true
    wait "${fwd}" 2>/dev/null || true
    exit "${status}"
  fi
  if ! kill -0 "${fwd}" 2>/dev/null; then
    kill "${caddy_pid}" 2>/dev/null || true
    wait "${caddy_pid}" 2>/dev/null || true
    exit 1
  fi
  sleep 1
done
