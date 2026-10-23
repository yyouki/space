# Codespaces OS Lab

Eksperimen Windows VM yang mengutamakan disk persisten, startup non-destruktif, dan backup Google Cloud Storage.

> **Status:** Windows VM hanya berfungsi bila Codespace benar-benar menyediakan Docker, `/dev/kvm`, `/dev/net/tun`, memori, dan disk yang cukup. Project ini tidak dapat menjamin Codespaces akan menyediakan semua itu atau menjamin RDP dapat dijangkau.

## Apa yang diperbaiki

- Startup biasa tidak menjalankan `docker rm -f`, tidak membuat ulang disk, dan tidak menginstal ulang Windows.
- `storage/data.img` menjadi disk tamu persisten dan dikecualikan dari Git.
- Jika disk hilang, startup berhenti dengan pesan; instalasi awal hanya dilakukan lewat `scripts/init-windows.sh` dengan konfirmasi.
- Jika container hilang tetapi disk valid masih ada, script boleh membuat ulang container mengitari disk tersebut.
- Tidak ada fallback diam-diam ke QEMU TCG bila KVM tidak tersedia.
- `scripts/stop-windows.sh` menghentikan Windows lalu menjalankan backup GCS jika telah dikonfigurasi.
- Restore memeriksa SHA-256 dan menolak menimpa disk yang sudah ada.
- Menu OS menjelaskan status Windows, macOS, dan Googlebook OS tanpa mengklaim semua guest OS bisa berjalan di Linux Codespaces.

## Memulai

1. Salin konfigurasi contoh:

   ```bash
   cp .env.example .env
   ```

2. Jalankan pemeriksaan:

   ```bash
   ./scripts/preflight.sh
   ```

   Jika pemeriksaan gagal, jangan memulai VM. Khususnya, jika `/dev/kvm` tidak ada, Codespace ini bukan host yang sesuai untuk jalur Windows VM ini.

3. Untuk instalasi Windows pertama kali saja:

   ```bash
   ./scripts/init-windows.sh
   ```

   Script meminta mengetik `CREATE WINDOWS`. Instalasi pertama dapat mengunduh komponen Windows dan memerlukan beberapa GB disk serta waktu. Repo tidak memuat atau membagikan lisensi Windows.

4. Untuk penggunaan normal, restart, atau setelah container metadata hilang:

   ```bash
   ./scripts/start-windows.sh
   ```

   Script menggunakan disk yang sudah ada. Jika disk tidak ditemukan atau kosong, script berhenti dan tidak memasang OS baru.

5. Untuk menghentikan Windows dan mencoba backup otomatis ke GCS:

   ```bash
   ./scripts/stop-windows.sh
   ```

## Backup Google Cloud Storage

Google Cloud Storage memerlukan bucket dan autentikasi Google Cloud yang valid. Konfigurasikan `BACKUP_BUCKET` dan optional `BACKUP_PREFIX` di `.env`, lalu login di terminal Codespace:

```bash
gcloud auth login
./scripts/stop-windows.sh
```

Jika Windows dihentikan dengan script tersebut, `backup-windows.sh` membuat arsip gzip dari disk yang sudah berhenti, mengunggah object bernama unik, dan mengunggah checksum. Script tidak membuat bucket, tidak mengaktifkan billing, dan tidak menghapus backup lama. Untuk backup manual, pastikan Windows/container sudah berhenti, lalu jalankan:

```bash
./scripts/backup-windows.sh
```

Untuk restore setelah kehilangan disk lokal, berikan URI object backup yang tepat:

```bash
./scripts/restore-windows.sh gs://YOUR_BUCKET/space-vm/windows/windows-TIMESTAMP.img.gz
```

Restore menolak berjalan jika `storage/data.img` sudah ada. Backup disk besar dapat memerlukan waktu, CPU, storage sementara, bandwidth, dan biaya Cloud Storage. Selalu cek harga/kuota serta sisa disk sebelum menjalankan.

**Batas penting:** Codespaces tidak menjamin menjalankan backup hook sebelum setiap stop/timeout/delete dari UI. Untuk menangkap perubahan terakhir, gunakan `scripts/stop-windows.sh` sebelum menghentikan Codespace. Jika Codespace/storage dihapus, data lokal bisa hilang; hanya backup cloud yang telah berhasil diunggah yang dapat dipakai untuk recovery.

## Menu OS

```bash
./scripts/select-os.sh
```

- **Windows:** dapat dicoba jika preflight lulus.
- **macOS:** tidak tersedia di Linux Codespaces; project tidak mengunduh image tidak resmi atau mem-bypass lisensi.
- **Googlebook OS:** ditujukan untuk perangkat Googlebook dan tidak tersedia sebagai guest VM generik yang didukung di repo ini.

Detail: [Batasan platform](docs/PLATFORM-LIMITS.md).

## AI developer tools di Windows

Setelah Windows menyala, buka folder share `\\host.lan\Data` di dalam Windows. Jalankan PowerShell sebagai user Windows, lalu:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
& '\\host.lan\Data\install-ai-tools.ps1'
```

Script mencoba memasang Cursor dan aplikasi ChatGPT (Codex tersedia di dalamnya); Antigravity dibuka melalui halaman download resminya untuk pemasangan manual. Setiap tool dapat meminta login dan memiliki batas pemakaian/langganan masing-masing.

Repo ini tidak membuat akun Google, tidak mengakali kelayakan usia/region, dan tidak memberikan Google AI Pro secara otomatis. Promosi dan subscription harus diklaim oleh pemegang akun yang memenuhi syarat melalui Google; perangkat/promo tertentu dapat mensyaratkan pembelian.

## Catatan keamanan

- Jangan commit `.env`, service-account JSON, token, atau password.
- Jangan commit file VM.
- Tidak ada auto-rebuild, auto-format disk, atau auto-restore ke atas disk yang sudah ada.
- Jangan menganggap port 3389 bisa diakses hanya karena Codespaces meneruskan port; uji konektivitas dari jaringan aktual.
