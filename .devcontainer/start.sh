#!/bin/bash
cd /workspaces/space || cd "$(dirname "$0")/.."

mkdir -p storage

# 1. JIKA WINDOWS SUDAH BERJALAN, JANGAN DIAPA-APAKAN
if [ "$(docker ps -q -f name=windows)" ]; then
    echo "Windows sudah aktif berjalan."
# 2. JIKA KONTAINER ADA TAPI MATI, CUKUP START (HANYA 3 DETIK, TIDAK INSTALL ULANG)
elif [ "$(docker ps -aq -f name=windows)" ]; then
    echo "Membangunkan Windows tanpa install ulang..."
    docker start windows
# 3. JIKA BELUM PERNAH DIBUAT SAMA SEKALI, BARU JALANKAN INI
else
    echo "Membuat Windows..."
    docker run -d \
      --name windows \
      --restart always \
      --stop-timeout 120 \
      -p 8006:8006 \
      -p 3389:3389 \
      -e VERSION='tiny11' \
      -e RAM_SIZE='4G' \
      -e DISK_SIZE='32G' \
      -e DISK_CACHE='writethrough' \
      -v "$(pwd)/storage:/storage" \
      --device=/dev/kvm \
      --device=/dev/net/tun \
      --cap-add NET_ADMIN \
      dockurr/windows
fi

# Setup Tailscale
if ! command -v tailscale &> /dev/null; then
    curl -fsSL https://tailscale.com/install.sh | sh
fi

if ! pgrep -f tailscaled > /dev/null; then
    sudo tailscaled --tun=userspace-networking &
    sleep 2
    sudo tailscale up --accept-routes
fi
