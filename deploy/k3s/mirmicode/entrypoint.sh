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

template="${CADDYFILE_TEMPLATE:-/etc/mirmicode/Caddyfile.template}"
rendered="${CADDYFILE_RENDERED:-/tmp/Caddyfile}"
if [ -n "${auth_line}" ]; then
  awk -v auth="${auth_line}" '{ gsub(/__AUTH_HEADER__/, auth); print }' "${template}" > "${rendered}"
else
  grep -v '__AUTH_HEADER__' "${template}" > "${rendered}"
fi

/usr/local/bin/socksforward &
fwd="$!"
caddy run --config "${rendered}" --adapter caddyfile &
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
