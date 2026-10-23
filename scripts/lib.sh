#!/usr/bin/env bash
# Shared helpers for the Codespaces OS Lab scripts.
set -Eeuo pipefail

SPACE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WINDOWS_CONTAINER="${WINDOWS_CONTAINER:-windows}"
WINDOWS_DISK="$SPACE_ROOT/storage/data.img"

space_load_env() {
  if [[ -f "$SPACE_ROOT/.env" ]]; then
    set -a
    # shellcheck disable=SC1091
    . "$SPACE_ROOT/.env"
    set +a
  fi
}

space_require_docker() {
  command -v docker >/dev/null 2>&1 || {
    echo "ERROR: Docker CLI is unavailable in this Codespace." >&2
    return 1
  }
  docker info >/dev/null 2>&1 || {
    echo "ERROR: Docker daemon is unavailable or inaccessible." >&2
    return 1
  }
}

space_disk_exists() {
  [[ -s "$WINDOWS_DISK" && ! -L "$WINDOWS_DISK" ]]
}

space_container_exists() {
  docker inspect "$WINDOWS_CONTAINER" >/dev/null 2>&1
}

space_container_running() {
  [[ "$(docker inspect -f '{{.State.Running}}' "$WINDOWS_CONTAINER" 2>/dev/null || true)" == "true" ]]
}

space_existing_disk_size_gb() {
  local bytes
  bytes="$(stat -c '%s' "$WINDOWS_DISK")"
  # Recreate the container with the existing raw image's logical capacity.
  echo "$(( (bytes + 1073741823) / 1073741824 ))G"
}

space_run_container() {
  local disk_size="$1"
  docker run -d     --name "$WINDOWS_CONTAINER"     --stop-timeout 120     -p 8006:8006     -p 3389:3389/tcp     -p 3389:3389/udp     -e "VERSION=${WINDOWS_VERSION:-11}"     -e "RAM_SIZE=${WINDOWS_RAM_SIZE:-4G}"     -e "CPU_CORES=${WINDOWS_CPU_CORES:-2}"     -e "DISK_SIZE=$disk_size"     -e "DISK_FMT=raw"     -e "DISK_CACHE=none"     -e "KVM=Y"     -v "$SPACE_ROOT/storage:/storage"     -v "$SPACE_ROOT/scripts:/data:ro"     --device=/dev/kvm     --device=/dev/net/tun     --cap-add NET_ADMIN     dockurr/windows
}
