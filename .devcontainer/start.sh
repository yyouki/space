#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${{BASH_SOURCE[0]}")/.." && pwd)"

# Lifecycle startup is deliberately non-destructive. It may start an existing
# VM, but it never initializes a new Windows disk.
if ! bash "${ROOT/scripts/start-windows.sh" --lifecycle; then
  echo
  echo "WARNING: Windows VM was not started. Review the message above."
  echo "This Codespace will remain available; no OS disk was created or replaced."
fi
