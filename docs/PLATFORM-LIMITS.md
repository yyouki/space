# Batasan platform dan pilihan OS

## Windows

Windows adalah satu-satunya guest OS yang dikonfigurasi oleh repo ini, melalui [dockur/windows](https://github.com/dockur/windows). Ini bersifat eksperimental di Codespaces. Proyek upstream memerlukan Linux host dengan akses KVM. Jalankan `scripts/preflight.sh`; jika `/dev/kvm` tidak ada, jangan lanjutkan atau menganggap software emulation akan terasa seperti PC normal.

Disk tamu disimpan di `storage/data.img`, di dalam workspace yang di-mount ke `/storage`. Script startup hanya memakai disk yang sudah ada. Pembuatan disk baru membutuhkan `scripts/init-windows.sh` dan konfirmasi eksplisit.

## macOS

Tidak ada installer atau VM macOS pada repo ini. Environment Codespaces adalah Linux dan tidak menyediakan stack virtualisasi Apple yang didukung. Jalankan macOS VM melalui dokumentasi Apple pada hardware yang kompatibel; repo ini tidak mengunduh image tak resmi, mem-bypass aktivasi, atau mengubah lisensi.

## Googlebook OS

Googlebook OS adalah OS untuk perangkat Googlebook, bukan ISO generik yang didukung repo ini untuk dijalankan di Codespaces. Opsi menu hanya menjelaskan statusnya; tidak mengunduh atau mengeksekusi image tidak resmi. Detail dukungan perangkat/VM harus menunggu dokumentasi resmi yang sesuai.

## Persistence

- Stop/start Codespace dan rebuild container biasanya mempertahankan data di workspace.
- Penghapusan Codespace/storage dapat menghilangkan disk.
- GitHub Codespaces tidak menyediakan jaminan universal bahwa sebuah script akan berjalan sebelum setiap penghentian, timeout, atau penghapusan eksternal.
- Untuk backup yang bersih, jalankan `scripts/stop-windows.sh`. Script menghentikan container terlebih dahulu, lalu mengunggah backup jika Google Cloud Storage telah dikonfigurasi.
- Jika Codespace berhenti langsung melalui UI/timeout tanpa menjalankan script tersebut, backup terbaru mungkin tidak mencakup perubahan terakhir.

## Google Cloud Storage

Backup diunggah sebagai arsip gzip dengan nama unik dan file checksum SHA-256. Disk lokal tidak dihapus setelah upload. Restore selalu memvalidasi checksum dan menolak menimpa `storage/data.img` yang sudah ada.

Cloud Storage bukan otomatis gratis. Google Cloud mencantumkan kuota Always Free terbatas, termasuk 5 GB-months hanya untuk region tertentu; VM image dapat melebihi kuota itu. Periksa harga dan konfigurasi billing sebelum membuat bucket atau mengunggah backup.

## AI tools dan akun

`scripts/install-ai-tools.ps1` mencoba memasang Cursor dan aplikasi ChatGPT yang menyediakan Codex di Windows; untuk Antigravity, script membuka halaman resmi agar installer Windows saat ini diunduh langsung dari vendor. Login dilakukan manual. Repo tidak menyimpan password/API keys, membuat akun Google, atau memberi langganan berbayar secara otomatis.
