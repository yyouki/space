#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cat <<'EOF'
Codespaces OS Lab — OS options

1) Windows 11 VM (experimental; requires working KVM and a persistent disk)
2) macOS VM (not supported in this Linux Codespace)
3) Googlebook OS (device-specific; no supported generic VM image is provided here)
4) Show limitations
EOF
read -r -p "Choose [1-4]: " choice

case "$choice" in
  1) exec bash "$ROOT/scripts/start-windows.sh" ;;
  2)
    echo "macOS is not started or downloaded. This Codespace is a Linux host without Apple's supported virtualization stack."
    echo "Use Apple-supported macOS virtualization on compatible Apple hardware instead."
    exit 2
    ;;
  3)
    echo "Googlebook OS is designed for Googlebook hardware; this repository does not have a supported generic VM installer."
    echo "This option will not download an unofficial image or pretend to boot it."
    exit 2
    ;;
  4) exec bash "$ROOT/scripts/show-limitations.sh" ;;
  *) echo "Invalid choice." >&2; exit 2 ;;
esac
