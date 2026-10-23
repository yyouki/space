#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${{BASH_SOURCE[0]}")/.." && pwd)"
source "${ROOT/scripts/lib.sh"
space_load_env

if (( $# != 1 )); then
  echo "Usage: ${0 gs://BUCKET/PREFIX/windows-TIMESTAMP.img.gz" >&2
  exit 2
fi
object="$1"
[[ "$object" == gs://* && "$object" == *.img.gz ]] || {
  echo "ERROR: provide an exact gs://.../windows-TIMESTAMP.img.gz object URI." >&2
  exit 2
}
command -v gcloud >/dev/null 2>&1 || { echo "ERROR: install Google Cloud CLI first." >&2; exit 2; }
gcloud auth list --filter=status:ACTIVE --format='value(account)' | grep -q . || {
  echo "ERROR: authenticate first with 'gcloud auth login'." >&2; exit 2;
}
if space_container_running; then
  echo "ERROR: stop Windows before restoring." >&2
  exit 2
fi
if [[ -e "$WINDOWS_DISK" || -L "$WINDOWS_DISK" ]]; then
  echo "ERROR: storage/data.img already exists. Restore refuses to overwrite any existing disk." >&2
  echo "Move the existing disk to a separately backed-up location only after verifying a backup, then retry." >&2
  exit 2
fi

mkdir -p "$ROOT/storage"
tmp_dir="$(mktemp -d "${{TMPDIR:-/tmp}/space-windows-restore.XXXXXX")"
restore_tmp="$ROOT/storage/data.img.restore.$$"
cleanup() {
  rm -rf -- "$tmp_dir"
  [[ ! -e "$restore_tmp" ]] || rm -f -- "$restore_tmp"
}
trap cleanup EXIT

archive="$tmp_dir/$(basename "$object")"
sha_file="$tmp_dir/manifest.sha256"
gcloud storage cp "$object" "$archive"
gcloud storage cp "${object.sha256" "$sha_file"

expected="$(tr -d '[:space:]' < "$sha_file")"
actual="$(sha256sum "$archive" | awk '{print $1}')"
[[ "$expected" =~ ^[a-fA-F0-9]{64}$ && "$expected" == "$actual" ]] || {
  echo "ERROR: SHA-256 verification failed; primary disk was not written." >&2
  exit 2
}
gzip -t "$archive"

echo "Archive hash and gzip integrity passed. Restoring to a temporary file..."
gzip -dc "$archive" | dd of="$restore_tmp" conv=sparse status=progress
[[ -s "$restore_tmp" ]] || { echo "ERROR: restored disk is empty." >&2; exit 2; }

# Never overwrite the destination, even if another process creates it mid-restore.
if [[ -e "$WINDOWS_DISK" || -L "$WINDOWS_DISK" ]]; then
  echo "ERROR: storage/data.img appeared during restore; refusing to replace it." >&2
  exit 2
fi
mv -n -- "$restore_tmp" "$WINDOWS_DISK"
if [[ -e "$restore_tmp" ]]; then
  echo "ERROR: could not atomically place restored disk; destination may now exist." >&2
  exit 2
fi

echo "Restore complete. The VM has NOT been started automatically."
echo "Run ./scripts/start-windows.sh after reviewing available disk space and network conditions."
