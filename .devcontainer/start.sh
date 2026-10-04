#!/bin/bash
cd /workspaces/Codespaces || cd "$(dirname "$0")/.."

# 1. HAPUS SAMPAH BAWAAN CODESPACES (Biar disk punya ruang kosong 25+ GB!)
echo "Mengosongkan ruang server Codespaces..."
sudo rm -rf /opt/conda /usr/share/dotnet /usr/local/share/powershell /usr/local/lib/android /tmp/* 2>/dev/null || true
docker system prune -af 2>/dev/null || true

mkdir -p storage

# 2. Jalankan Windows 11 (Tiny11)
if [ "$(docker ps -q -f name=windows)" ]; then
    echo "Windows 11 sudah berjalan."
elif [ "$(docker ps -aq -f name=windows)" ]; then
    echo "Membangunkan Windows 11..."
    docker start windows
else
    echo "Menginstall Windows 11 (Tiny11)..."
    docker run -d \
      --name windows \
      --restart always \
      --stop-timeout 60 \
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

# 3. Setup Tailscale (Jalur Cepat P2P ke HP)
if ! command -v tailscale &> /dev/null; then
    curl -fsSL https://tailscale.com/install.sh | sh
fi

sudo pkill -f tailscaled 2>/dev/null || true
sudo tailscaled --tun=userspace-networking &
sleep 2

sudo tailscale up --accept-routes
