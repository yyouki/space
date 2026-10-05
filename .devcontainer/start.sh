#!/bin/bash
cd /workspaces/Codespaces || cd "$(dirname "$0")/.."

mkdir -p storage

# 1. Bersihkan sisa kontainer lama di memori
docker rm -f windows 2>/dev/null || true

# 2. Jalankan Windows Tiny10 (Aman di Disk 18G & Bebas Update Aplikasi)
docker run -d \
  --name windows \
  --restart always \
  --stop-timeout 120 \
  -p 8006:8006 \
  -p 3389:3389 \
  -e RAM_SIZE='4G' \
  -e DISK_SIZE='18G' \
  -e DISK_CACHE='writethrough' \
  -v "$(pwd)/storage:/storage" \
  --device=/dev/kvm \
  --device=/dev/net/tun \
  --cap-add NET_ADMIN \
  dockurr/windows

# 3. Jalankan Tailscale (Jalur P2P Anti-Delay)
if ! command -v tailscale &> /dev/null; then
    curl -fsSL https://tailscale.com/install.sh | sh
fi

sudo pkill -f tailscaled 2>/dev/null || true
sudo tailscaled --tun=userspace-networking &
sleep 2

sudo tailscale up --accept-routes
