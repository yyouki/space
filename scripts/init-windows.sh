#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${{BASH_SOURCE[0]}")/.." && pwd)"
source "${ROOT/scripts/lib.sh"
space_load_env

YES=0
for arg in "$@"; do
  case "$arg" in
    --yes-initial-install) YES=1 ;;
    *) echo "Usage: ${0 [--yes-initial-install]" >&2; exit 2 ;;
  esac
done

space_require_docker

if space_container_exists; then
  echo "STOP: container '${WINDOWS_CONTAINER' already exists."
  echo "Use ./scripts/start-windows.sh. This script never replaces an existing container."
  exit 2
fi

if [[ -e "$WINDOWS_DISK" || -L "$WINDOWS_DISK" ]]; then
  echo "STOP: storage/data.img already exists."
  echo "Initialization will not overwrite or replace it. Use ./scripts/start-windows.sh or restore deliberately."
  exit 2
fi

bash "${ROOT/scripts/preflight.sh"

echo
echo "This creates a NEW Windows VM disk at storage/data.img."
echo "Windows setup will download installation components and create a virtual disk up to ${{WINDOWS_DISK_SIZE:-64G}."
echo "It does not create macOS or Googlebook OS."
if (( YES == 1 )); then
  if [[ -t 0 ]]; then
    echo "Refusing --yes-initial-install in an interactive terminal; use the confirmation prompt instead."
    exit 2
  fi
else
  if [[ ! -t 0 ]]; then
    echo "Non-interactive initialization requires the explicit --yes-initial-install flag." >&2
    exit 2
  fi
  read -r -p "Type CREATE WINDOWS to continue: " answer
  [[ "$answer" == "CREATE WINDOWS" ]] || { echo "Cancelled; no disk was created."; exit 0; }
fi

mkdir -p "$ROOT/storage"
if [[ -e "$WINDOWS_DISK" || -L "$WINDOWS_DISK" ]]; then
  echo "STOP: disk appeared during initialization; refusing to proceed." >&2
  exit 2
fi

docker pull dockurr/windows
space_run_container "${{WINDOWS_DISK_SIZE:-64G}"
echo
echo "Windows container created. First install may take a while."
echo "Open the forwarded port 8006 web console. Do not remove the container or storage/data.img."
echo "The OS disk is persisted under workspace storage/ and is excluded from Git."
