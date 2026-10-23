#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$ROOT/scripts/lib.sh"
space_load_env

if [[ -z "${BACKUP_BUCKET:-}" ]]; then
  echo "ERROR: set BACKUP_BUCKET in .env or the environment first." >&2
  exit 2
fi
command -v gcloud >/dev/null 2>&1 || {
  echo "ERROR: Google Cloud CLI (gcloud) is not installed." >&2
  exit 2
}
gcloud auth list --filter=status:ACTIVE --format='value(account)' | grep -q . || {
  echo "ERROR: authenticate first with 'gcloud auth login'." >&2
  exit 2
}
space_disk_exists || {
  echo "ERROR: storage/data.img is missing or empty; no backup created." >&2
  exit 2
}
if space_container_running; then
  echo "ERROR: Windows is still running. Stop the VM before backing up its disk." >&2
  exit 2
fi

tmp_dir="$(mktemp -d "${TMPDIR:-/tmp}/space-windows-backup.XXXXXX")"
trap 'rm -rf -- "$tmp_dir"' EXIT
disk_allocated="$(du -B1 "$WINDOWS_DISK" | awk '{print $1}')"
tmp_available="$(df -B1 "$tmp_dir" | awk 'NR==2 {print $4}')"
if [[ ! "$disk_allocated" =~ ^[0-9]+$ || ! "$tmp_available" =~ ^[0-9]+$ ]] || (( tmp_available < disk_allocated + 104857600 )); then
  echo "ERROR: temporary filesystem lacks safe headroom for a compressed backup." >&2
  echo "Available: $tmp_available bytes; disk blocks allocated: $disk_allocated bytes." >&2
  exit 2
fi

timestamp="$(date -u +%Y%m%dT%H%M%SZ)-$$"
bucket="${BACKUP_BUCKET#gs://}"
bucket="${bucket%/}"
prefix="${BACKUP_PREFIX:-space-vm/windows}"
prefix="${prefix#/}"
prefix="${prefix%/}"
object="gs://$bucket/$prefix/windows-$timestamp.img.gz"
archive="$tmp_dir/windows.img.gz"
sha_file="$tmp_dir/windows.img.gz.sha256"

echo "Compressing the stopped disk with gzip -1. This reads the full logical disk and may take time/CPU."
gzip -1 -c "$WINDOWS_DISK" > "$archive"
sha256sum "$archive" | awk '{print $1}' > "$sha_file"

echo "Uploading unique backup object: $object"
gcloud storage cp "$archive" "$object"
gcloud storage cp "$sha_file" "$object.sha256"

remote_size="$(gcloud storage objects describe "$object" --format='value(size)' | tr -d '\r')"
local_size="$(stat -c '%s' "$archive")"
if [[ "$remote_size" != "$local_size" ]]; then
  echo "ERROR: uploaded object size does not match. Local disk remains untouched; treat remote object as incomplete." >&2
  exit 2
fi

echo "Backup verified by object size."
echo "Object: $object"
echo "SHA-256 manifest: $object.sha256"
echo "Local storage/data.img was not deleted or modified."
