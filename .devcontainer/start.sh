#!/bin/bash
cd "$(dirname "$0")/.."

# 1. Bersihkan sampah bawaan Codespaces (Bebaskan ~10 GB)
sudo rm -rf /opt/conda /usr/share/dotnet /usr/local/share/powershell /usr/local/lib/android /tmp/* 2>/dev/null || true
docker system prune -f 2>/dev/null || true

mkdir -p storage

# 2. Hentikan kontainer lama jika ada
docker rm -f windows 2>/dev/null || true

# 3. Jalankan Windows Tiny10 dengan Format Disk Terkompresi (qcow2)
docker run -d \
  --name windows \
  --restart always \
  --stop-timeout 120 \
  -p 8006:8006 \
  -p 3389:3389 \
  -e VERSION='tiny10' \
  -e RAM_SIZE='4G' \
  -e DISK_SIZE='16G' \
  -e DISK_FMT='qcow2' \
  -e DISK_CACHE='writethrough' \
  -v "$(pwd)/storage:/storage" \
  --device=/dev/kvm \
  --device=/dev/net/tun \
  --cap-add NET_ADMIN \
  dockurr/windows

# 4. Jalankan Tailscale
if ! command -v tailscale &> /dev/null; then
    curl -fsSL https://tailscale.com/install.sh | sh
fi

sudo pkill -f tailscaled 2>/dev/null || true
sudo tailscaled --tun=userspace-networking &
sleep 2

sudo tailscale up --accept-routes
