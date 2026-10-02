#!/bin/bash
cd /workspaces/Codespaces || cd "$(dirname "$0")/.."

# 1. HAPUS SAMPAH BAWAAN CODESPACES (Membebaskan 8 - 10 GB ruang disk!)
echo "Membebaskan ruang disk server Codespaces..."
sudo rm -rf /opt/conda /usr/share/dotnet /usr/local/share/powershell /usr/local/lib/android 2>/dev/null || true
docker system prune -f 2>/dev/null || true

mkdir -p storage

# 2. Jalankan Windows 11 (Tiny11) dengan Auto-Save
if [ "$(docker ps -q -f name=windows)" ]; then
    echo "Windows 11 sudah berjalan."
elif [ "$(docker ps -aq -f name=windows)" ]; then
    echo "Membangunkan Windows 11..."
    docker start windows
else
    echo "Membuat Windows 11 (Tiny11) baru..."
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

# 3. Setup Tailscale (Koneksi P2P Anti-Delay untuk HP)
if ! command -v tailscale &> /dev/null; then
    echo "Menginstall Tailscale..."
    curl -fsSL https://tailscale.com/install.sh | sh
fi

sudo pkill -f tailscaled 2>/dev/null || true
sudo tailscaled --tun=userspace-networking &
sleep 2

sudo tailscale up --accept-routes
