#!/usr/bin/env bash
# Labhand apply for Mirmicode on cluster asym-k3s.
# Dry-run unless MIRMICODE_APPLY=1. Does not create secrets.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "${here}/../../.." && pwd)"
expected_context="${MIRMICODE_KUBE_CONTEXT:-asym-k3s}"
sha="$(git -C "${root}" rev-parse --short HEAD 2>/dev/null || true)"
image="${MIRMICODE_IMAGE:-mirmicode.local/web:${sha:-latest}}"

echo "Mirmicode"
echo "  cluster:   ${expected_context}"
echo "  node:      asym-k1"
echo "  namespace: mirmicode"
echo "  hostname:  https://mirmicode.tail21f530.ts.net"
echo "  upstream:  https://cahq.tail21f530.ts.net/api/v1/working-set"
echo "  image:     ${image}"
echo "  manifest:  ${here}"
echo "http://127.0.0.1:5173 is interim local preview, not this surface."

if [[ "${MIRMICODE_APPLY:-}" != "1" ]]; then
  echo "Dry run. Apply with MIRMICODE_APPLY=1 ${here}/apply.sh"
  exit 0
fi

if ! command -v kubectl >/dev/null 2>&1; then
  echo "kubectl is required on a host that can reach ${expected_context}." >&2
  exit 1
fi

if [[ ! "${image}" =~ ^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,200}$ ]]; then
  echo "Refusing image ref." >&2
  exit 2
fi

context="$(kubectl config current-context 2>/dev/null || true)"
cluster="$(kubectl config view --minify -o jsonpath='{.clusters[0].name}' 2>/dev/null || true)"
if [[ "${context}" != "${expected_context}" && "${cluster}" != "${expected_context}" && "${MIRMICODE_ALLOW_CONTEXT:-}" != "1" ]]; then
  echo "Refusing to apply: context '${context:-<none>}' cluster '${cluster:-<none>}', expected ${expected_context}." >&2
  echo "Set MIRMICODE_ALLOW_CONTEXT=1 to override." >&2
  exit 2
fi

if ! kubectl -n mirmicode get secret mirmicode-tailscale-auth >/dev/null 2>&1; then
  echo "Secret mirmicode/mirmicode-tailscale-auth (key authkey) is not in the cluster yet." >&2
  echo "Create it from a tailnet auth key before the pod can join. The value stays out of git." >&2
fi

rendered="$(mktemp)"
trap 'rm -f "${rendered}"' EXIT
kubectl kustomize "${here}" > "${rendered}"
if [[ "${image}" != "mirmicode.local/web:latest" ]]; then
  sed -i "s#mirmicode.local/web:latest#${image}#g" "${rendered}"
fi
kubectl apply -f "${rendered}"
kubectl -n mirmicode rollout status deployment/mirmicode --timeout=180s
echo "Rolled out ${image}. Open https://mirmicode.tail21f530.ts.net"
