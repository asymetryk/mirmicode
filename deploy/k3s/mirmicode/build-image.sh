#!/usr/bin/env bash
# Build the static image on asym-k1 and import it into k3s containerd.
# imagePullPolicy is Never, so a build on another machine does not land on the node.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "${here}/../../.." && pwd)"
sha="$(git -C "${root}" rev-parse --short HEAD)"
image_latest="${MIRMICODE_IMAGE_LATEST:-mirmicode.local/web:latest}"
image_sha="${MIRMICODE_IMAGE:-mirmicode.local/web:${sha}}"
dockerfile="${here}/Dockerfile"

import_tar() {
  local tar="$1"
  if ! command -v k3s >/dev/null 2>&1; then
    echo "Image built. k3s is not on PATH; import ${tar} on asym-k1 with: k3s ctr images import ${tar}" >&2
    return 0
  fi
  if k3s ctr images import "${tar}"; then
    return 0
  fi
  echo "k3s ctr import failed; retrying with sudo." >&2
  sudo k3s ctr images import "${tar}"
}

if command -v docker >/dev/null 2>&1; then
  docker build -f "${dockerfile}" -t "${image_latest}" -t "${image_sha}" "${root}"
  tar="$(mktemp --suffix=.tar /tmp/mirmicode-image.XXXXXX)"
  docker save -o "${tar}" "${image_latest}" "${image_sha}"
  import_tar "${tar}"
  rm -f "${tar}"
elif command -v nerdctl >/dev/null 2>&1; then
  nerdctl --namespace k8s.io build -f "${dockerfile}" -t "${image_latest}" -t "${image_sha}" "${root}"
else
  echo "build-image.sh needs docker or nerdctl on asym-k1." >&2
  exit 1
fi

echo "Built ${image_sha}"
echo "Apply: MIRMICODE_APPLY=1 MIRMICODE_IMAGE=${image_sha} ${here}/apply.sh"
