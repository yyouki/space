#!/bin/bash
cd /workspaces/Codespaces || cd "$(dirname "$0")/.."

mkdir -p storage

# 1. Cek status kontainer Windows
if [ "$(docker ps -q -f name=windows)" ]; then
    echo "Windows sudah aktif berjalan."
elif [ "$(docker ps -aq -f name=windows)" ]; then
    echo "Membangunkan kontainer Windows yang tertidur..."
    docker start windows
else
    echo "Membuat kontainer Windows 11 baru..."
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

# 2. Jalankan Localtonet jika belum aktif
if ! pgrep -f localtonet > /dev/null; then
    if [ ! -f ./localtonet ]; then
        curl -sSL https://localtonet.com/download/localtonet-linux-x64.zip -o localtonet.zip
        unzip -o localtonet.zip > /dev/null 2>&1
        chmod +x localtonet
        rm -f localtonet.zip
    fi
    nohup ./localtonet authtoken MClz8jZrby3Gw4mYeh6foSav75RLUtEHD > /dev/null 2>&1 &
fi
