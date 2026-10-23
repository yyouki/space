#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$ROOT/scripts/lib.sh"
space_load_env

MIN_FREE_GB="${MIN_FREE_GB:-24}"
MIN_HOST_RAM_GB="${MIN_HOST_RAM_GB:-6}"
errors=0

fail() { echo "FAIL: $*" >&2; errors=$((errors + 1)); }
pass() { echo "OK:   $*"; }
warn() { echo "WARN: $*"; }

echo "Codespaces OS Lab preflight"
echo "Workspace: $ROOT"
echo

if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  pass "Docker CLI and daemon"
else
  fail "Docker CLI/daemon unavailable"
fi

if [[ -c /dev/kvm ]]; then
  pass "/dev/kvm exists"
else
  fail "/dev/kvm is missing. Hardware acceleration is required; this project will not fall back silently to slow TCG emulation."
fi

if [[ -c /dev/net/tun ]]; then
  pass "/dev/net/tun exists"
else
  fail "/dev/net/tun is missing; the Windows container's documented device configuration is unavailable."
fi

cpu_count="$(nproc 2>/dev/null || echo 0)"
if [[ "$cpu_count" =~ ^[0-9]+$ ]] && (( cpu_count >= 2 )); then
  pass "CPU count: $cpu_count"
else
  fail "At least 2 visible CPU threads are required (detected: $cpu_count)"
fi

available_kib="$(awk '/MemAvailable:/ {print $2; exit}' /proc/meminfo 2>/dev/null || echo 0)"
required_kib="$((MIN_HOST_RAM_GB * 1024 * 1024))"
if [[ "$available_kib" =~ ^[0-9]+$ ]] && (( available_kib >= required_kib )); then
  pass "Available host memory is at least $MIN_HOST_RAM_GB GiB"
else
  fail "Less than $MIN_HOST_RAM_GB GiB memory is available; do not start a 4 GiB Windows guest on this host."
fi

free_kib="$(df -Pk "$ROOT" | awk 'NR==2 {print $4}')"
required_kib="$((MIN_FREE_GB * 1024 * 1024))"
if [[ "$free_kib" =~ ^[0-9]+$ ]] && (( free_kib >= required_kib )); then
  pass "Workspace has at least $MIN_FREE_GB GiB free"
else
  fail "Workspace has less than $MIN_FREE_GB GiB free. Windows updates and backups need additional disk headroom."
fi

mkdir -p "$ROOT/storage"
if space_disk_exists; then
  disk_bytes="$(stat -c '%s' "$WINDOWS_DISK")"
  disk_allocated="$(du -h "$WINDOWS_DISK" | awk '{print $1}')"
  pass "Persistent disk exists: logical size $(( disk_bytes / 1073741824 )) GiB; allocated blocks $disk_allocated"
else
  warn "No valid storage/data.img exists. Preflight will not create one."
fi

echo
if (( errors > 0 )); then
  echo "Preflight FAILED with $errors blocking issue(s). No VM was started."
  exit 2
fi

echo "Preflight passed. This checks local conditions only; it does not prove RDP reachability or Codespaces support guarantees."
