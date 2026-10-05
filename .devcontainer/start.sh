#!/bin/bash
cd "$(dirname "$0")/.."

mkdir -p storage

# 1. Bersihkan kontainer lama di memori Docker
docker rm -f windows 2>/dev/null || true

# 2. Jalankan Windows Tiny10
docker run -d \
  --name windows \
  --restart always \
  --stop-timeout 120 \
  -p 8006:8006 \
  -p 3389:3389 \
  -e VERSION='tiny10' \
  -e RAM_SIZE='4G' \
  -e DISK_SIZE='18G' \
  -e DISK_CACHE='writethrough' \
  -v "$(pwd)/storage:/storage" \
  --device=/dev/kvm \
  --device=/dev/net/tun \
  --cap-add NET_ADMIN \
  dockurr/windows

# 3. Jalankan Tailscale
if ! command -v tailscale &> /dev/null; then
    curl -fsSL https://tailscale.com/install.sh | sh
fi

sudo pkill -f tailscaled 2>/dev/null || true
sudo tailscaled --tun=userspace-networking &
sleep 2

sudo tailscale up --accept-routes
