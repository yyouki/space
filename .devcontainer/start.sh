#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Lifecycle startup is non-destructive: it may reuse an existing VM but never
# initializes a new Windows disk.
if ! bash "$ROOT/scripts/start-windows.sh" --lifecycle; then
  echo
  echo "WARNING: Windows VM was not started. Review the message above."
  echo "This Codespace remains available; no OS disk was created or replaced."
fi
