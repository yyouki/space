#!/usr/bin/env bash
set -Eeuo pipefail
cat <<'EOF'
Platform limitations

- GitHub Codespaces is a Linux development container, not a general-purpose multi-OS cloud-PC service.
- Windows requires KVM in this setup. If /dev/kvm is absent, startup stops; there is no silent slow-emulation fallback.
- The repository can preserve a Windows disk in storage/data.img across ordinary Codespaces stop/start and container rebuilds, as long as the workspace still exists.
- Deleting the Codespace or losing its storage can delete the disk. Cloud backup is disaster recovery, not an absolute guarantee.
- Codespaces cannot reliably run a pre-stop script on every external Stop/timeout/delete event. Use scripts/stop-windows.sh to stop Windows and trigger a clean backup.
- macOS is not supported in this Linux Codespace setup. Do not use unofficial/pirated images or bypass platform licensing.
- Googlebook OS is tied to Googlebook hardware; this repository has no supported generic VM installer.
- Google Cloud Storage has usage limits and may cost money. Read the pricing page before uploading large backups.
- RDP availability depends on Codespaces networking/port forwarding and has not been verified here.
EOF
