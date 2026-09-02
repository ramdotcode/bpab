# Web BPAB RW 18 — versi Next.js

Aplikasi lokal untuk mengelola pelanggan air BPAB RW 18: input meteran, data &
riwayat pelanggan, laporan bulanan, dan broadcast WhatsApp. Data diambil langsung
dari database MySQL hosting.

Versi ini adalah **penerus** dari `Web BPAB Pribadi` (Express + HTML biasa).
Seluruh logika server dipakai ulang apa adanya di `lib/`; yang ditulis ulang hanya
tampilannya (React + Tailwind).

## Menjalankan

```bash
npm install          # sekali di awal
npm run dev          # mode pengembangan  -> http://localhost:3000
```

Untuk pemakaian sehari-hari (lebih stabil & cepat):

```bash
npm run build
npm start            # -> http://localhost:3000
```

Ganti port bila 3000 terpakai: `PORT=3010 npm start`

## Konfigurasi — `.env.local`

```
DB_HOST, DB_PORT, DB_USER, DB_PASS, DB_NAME   koneksi database
WHACENTER_DEVICE_ID, WHACENTER_BASE           kirim WhatsApp
PERIODE_TAHUN, PERIODE_BULAN                  override periode (kosong = bulan berjalan)
USER_INPUT_ID                                 nilai kolom user_input (default 10)
IZINKAN_TULIS_METERAN=false                   jadikan input meteran simulasi saja
IZINKAN_TAMBAH_PELANGGAN=false                jadikan tambah pelanggan simulasi saja
```

File ini tidak ikut ke git. Kredensial tidak pernah dikirim ke browser.

## Halaman

| Rute | Isi |
|------|-----|
| `/` | Ringkasan: pelanggan aktif, tunggakan, progres meteran, tunggakan terbesar |
| `/meteran` | **Input meteran** — hitung otomatis, Enter untuk simpan & lanjut baris berikut |
| `/pelanggan` | Daftar + cari (nama/kode/HP/alamat) + filter RT & penunggak |
| `/pelanggan/[kode]` | Kartu pelanggan: profil, ringkasan, riwayat tagihan/pembayaran/deposit |
| `/pelanggan/baru` | **Tambah pelanggan** — rumah → pelanggan → baris tagihan (satu transaksi) |
| `/laporan` | 3 laporan bulanan + Download Excel |
| `/broadcast` | Kirim WA: foto meteran, tagihan detail, tagihan singkat |

## Struktur

```
lib/             logika server — dipakai ulang dari versi Express, tidak diubah
  db.js          koneksi MySQL: query() SELECT-only, updateMeteran(), insertTransaksi()
  meter.js       aturan input meteran
  newcustomer.js aturan tambah pelanggan
  reports.js     3 laporan bulanan
  customers.js   daftar & detail pelanggan
  targets.js     target broadcast + helper periode
  messages.js    template pesan WhatsApp
  api.js         pembantu respons route
  format.js      format angka & tanggal
app/api/         13 route handler (pembungkus tipis di atas lib/)
app/             halaman
components/      ui.jsx (tombol, tabel, badge, dll), Sidebar, Modal, Toast
hooks/useApi.js  pembantu fetch
```

Halaman `/` dan `/pelanggan/[kode]` adalah **Server Component** — memanggil `lib/`
langsung tanpa lewat HTTP. Halaman interaktif memakai route `/api/*`.

## Aturan penting (jangan diubah tanpa alasan)

- **Database sebagian besar read-only.** `query()` menolak apa pun selain SELECT.
  Hanya dua operasi tulis yang diizinkan: mengisi meteran (5 kolom) dan menambah
  pelanggan (3 tabel, satu transaksi). Kolom pembayaran, deposit, dan kwitansi
  tidak bisa disentuh dari aplikasi ini.
- **Rumus tagihan** (terverifikasi 950/950 baris terhadap data asli):
  `pemakaian = akhir − awal`, `total = MAX(pemakaian, 6) × tarif` — minimal 6 m³.
- **Offset periode:** pada Bulan Laporan X, petugas membaca meteran pemakaian
  bulan X dan menagih pemakaian bulan X−1.
- **Input meteran tidak membuat baris periode berikutnya** — itu tugas proses
  "buka periode" di aplikasi lama. Dibuktikan lewat diff snapshot seluruh database.
- **`id_rw` diambil dari `ref_setting_bpab`**, bukan `profile_rw` (di sana ada 3 RW
  aktif; yang benar 40534018).
- **Kolom wajib** saat menambah pelanggan: `kode_pelanggan_manual` dan `nik`
  (NOT NULL tanpa default — penyebab error "cannot be null" bila dilewat).
- **Pelanggan 0100014 (Polsek)** bertarif flat Rp500.000 (`jenis_langganan='2'`);
  meterannya tidak dibaca dan rumus tagihan tidak berlaku.
- Kolom tanggal dibaca sebagai string (`dateStrings: true`) supaya tidak mundur
  sehari akibat timezone WIB.
