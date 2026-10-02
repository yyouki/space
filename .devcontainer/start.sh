#!/bin/bash
cd /workspaces/Codespaces || cd "$(dirname "$0")/.."

mkdir -p storage

# 1. Logika Cerdas: Auto-Resume jika Windows sudah ada
if [ "$(docker ps -q -f name=windows)" ]; then
    echo "Windows sudah aktif berjalan."
elif [ "$(docker ps -aq -f name=windows)" ]; then
    echo "Membangunkan Windows dari mode tidur..."
    docker start windows
else
    echo "Membuat Windows Tiny10 baru (Full Otomatis)..."
    docker run -d \
      --name windows \
      --restart always \
      --stop-timeout 60 \
      -p 8006:8006 \
      -p 3389:3389 \
      -e VERSION='tiny10' \
      -e RAM_SIZE='4G' \
      -e DISK_SIZE='20G' \
      -e DISK_CACHE='writethrough' \
      -v "$(pwd)/storage:/storage" \
      --device=/dev/kvm \
      --device=/dev/net/tun \
      --cap-add NET_ADMIN \
      dockurr/windows
fi

# 2. Pasang Tailscale (Jalur P2P Super Kencang Anti-Lag)
if ! command -v tailscale &> /dev/null; then
    echo "Menginstall Tailscale..."
    curl -fsSL https://tailscale.com/install.sh | sh
fi

# Jalankan daemon Tailscale
sudo pkill -f tailscaled 2>/dev/null || true
sudo tailscaled --tun=userspace-networking &
sleep 2

# Hubungkan ke Tailscale
sudo tailscale up --accept-routes
