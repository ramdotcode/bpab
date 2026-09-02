// Pemformatan angka & tanggal — dipakai di komponen tampilan.

export const angka = (n) =>
  (n === null || n === undefined || n === '') ? '' : Number(n).toLocaleString('id-ID');

export const rupiah = (n) => 'Rp ' + (Number(n) || 0).toLocaleString('id-ID');

const BULAN_PENDEK = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
  'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

export const BULAN = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

// 'YYYY-MM-DD' -> '3 Jun 2026'. Tanpa objek Date supaya tidak bergeser timezone.
export function tanggal(s) {
  if (!s) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s));
  if (!m) return String(s);
  return `${parseInt(m[3], 10)} ${BULAN_PENDEK[parseInt(m[2], 10)]} ${m[1]}`;
}

// Tanggal hari ini dalam waktu lokal (bukan UTC) — 'YYYY-MM-DD'
export function hariIni() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
