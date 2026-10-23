#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$ROOT/scripts/lib.sh"
space_load_env

space_require_docker

if space_container_exists && space_container_running; then
  echo "Stopping Windows gracefully (up to 120 seconds)..."
  docker stop --time 120 "$WINDOWS_CONTAINER"
else
  echo "Windows container is already stopped or missing."
fi

if [[ -z "${BACKUP_BUCKET:-}" ]]; then
  echo "VM stopped, but no cloud backup was uploaded: BACKUP_BUCKET is not configured."
  echo "Configure Google Cloud Storage and run ./scripts/backup-windows.sh, or set BACKUP_BUCKET to back up on this stop command."
  exit 0
fi

echo "Uploading a clean-state backup to Google Cloud Storage..."
bash "$ROOT/scripts/backup-windows.sh"
