#!/bin/sh
# Userspace Tailscale sidecar. Inbound HTTPS is tailscale serve.
# Outbound MagicDNS is the SOCKS5 port shared with the Caddy container.
set -eu

SOCKET="${TS_SOCKET:-/tmp/tailscaled.sock}"
STATE_DIR="${TS_STATE_DIR:-/var/lib/tailscale}"
HOSTNAME="${TS_HOSTNAME:?TS_HOSTNAME is required}"
SERVE_TARGET="${TS_SERVE_TARGET:?TS_SERVE_TARGET is required}"
AUTHKEY_FILE="${TS_AUTHKEY_FILE:-}"
ADVERTISE_TAGS="${TS_ADVERTISE_TAGS:-}"
SOCKS5="${TS_SOCKS5_SERVER:-127.0.0.1:1055}"

mkdir -p "${STATE_DIR}"
/usr/local/bin/tailscaled \
  --tun=userspace-networking \
  --statedir="${STATE_DIR}" \
  --socket="${SOCKET}" \
  --socks5-server="${SOCKS5}" &
PID="$!"
trap 'kill "${PID}" 2>/dev/null || true; wait "${PID}" 2>/dev/null || true' INT TERM

until [ -S "${SOCKET}" ]; do
  sleep 0.2
done

STATUS="$(tailscale --socket="${SOCKET}" status 2>&1 || true)"
AUTHKEY=""
if printf '%s' "${STATUS}" | grep -Eq 'Logged out|stopped|NeedsLogin'; then
  if [ -z "${AUTHKEY_FILE}" ] || [ ! -s "${AUTHKEY_FILE}" ]; then
    echo "Tailscale state for ${HOSTNAME} requires login and no enrollment key is available." >&2
    exit 2
  fi
  AUTHKEY="$(tr -d '\r\n' < "${AUTHKEY_FILE}")"
fi

if [ -n "${ADVERTISE_TAGS}" ]; then
  if [ -n "${AUTHKEY}" ]; then
    tailscale --socket="${SOCKET}" up \
      --hostname="${HOSTNAME}" \
      --accept-dns=false \
      --advertise-tags="${ADVERTISE_TAGS}" \
      --auth-key="${AUTHKEY}"
  else
    tailscale --socket="${SOCKET}" up \
      --hostname="${HOSTNAME}" \
      --accept-dns=false \
      --advertise-tags="${ADVERTISE_TAGS}"
  fi
else
  if [ -n "${AUTHKEY}" ]; then
    tailscale --socket="${SOCKET}" up \
      --hostname="${HOSTNAME}" \
      --accept-dns=false \
      --auth-key="${AUTHKEY}"
  else
    tailscale --socket="${SOCKET}" up \
      --hostname="${HOSTNAME}" \
      --accept-dns=false
  fi
fi
AUTHKEY=""
unset AUTHKEY

tailscale --socket="${SOCKET}" serve reset >/dev/null 2>&1 || true
tailscale --socket="${SOCKET}" serve --bg --https=443 "${SERVE_TARGET}"
wait "${PID}"
