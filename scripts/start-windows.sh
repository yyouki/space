#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${{BASH_SOURCE[0]}")/.." && pwd)"
source "${ROOT/scripts/lib.sh"
space_load_env

LIFECYCLE=0
for arg in "$@"; do
  case "$arg" in
    --lifecycle) LIFECYCLE=1 ;;
    *) echo "Usage: ${0 [--lifecycle]" >&2; exit 2 ;;
  esac
done

space_require_docker

if ! space_disk_exists; then
  echo "Windows disk missing or empty at storage/data.img."
  echo "Normal startup will NOT download or reinstall Windows."
  echo "Use ./scripts/init-windows.sh only for an intentional first install, or restore a backup."
  (( LIFECYCLE == 1 )) && exit 0
  exit 2
fi

if space_container_exists && space_container_running; then
  echo "Windows container is already running; reusing it."
  exit 0
fi

bash "${ROOT/scripts/preflight.sh"

if space_container_exists; then
  echo "Starting the existing stopped Windows container and its existing disk."
  docker start "$WINDOWS_CONTAINER"
else
  disk_size="$(space_existing_disk_size_gb)"
  echo "Container metadata is missing; recreating only the container around the existing disk ($disk_size)."
  echo "The disk itself will not be created, deleted, or intentionally resized."
  space_run_container "$disk_size"
fi

echo "VM start requested. Check port 8006 for the web console."
echo "RDP on port 3389 is only usable if Codespaces/network forwarding permits raw RDP traffic."
