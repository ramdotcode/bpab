// Ambil & susun data target dari database (read-only) menjadi bentuk yang
// dipakai template pesan di frontend.
import { query } from './db.js';

const BULAN = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

export function labelBulan(bulan, tahun) {
  const n = parseInt(bulan, 10);
  const nama = BULAN[n] || String(bulan);
  return tahun ? `${nama} ${tahun}` : nama;
}

// Normalisasi nomor -> format +62 (sama seperti versi HTML lama).
export function normWa(raw) {
  let wa = (raw || '').toString().trim().replace(/[^0-9+]/g, '');
  if (!wa) return '';
  if (wa.startsWith('0')) wa = '+62' + wa.slice(1);
  else if (wa.startsWith('8')) wa = '+62' + wa;
  else if (wa.startsWith('62')) wa = '+' + wa;
  else if (!wa.startsWith('+')) wa = '+' + wa;
  return wa;
}

// Periode berjalan default (bisa dioverride lewat query / .env).
export function periodeDefault() {
  const now = new Date();
  const tahun = process.env.PERIODE_TAHUN || String(now.getFullYear());
  const bulan = process.env.PERIODE_BULAN || String(now.getMonth() + 1).padStart(2, '0');
  return { tahun, bulan: bulan.padStart(2, '0') };
}

// ============ FOTO METERAN: pelanggan yg belum input meteran periode ini ============
export async function targetFotoMeteran({ tahun, bulan }) {
  const rows = await query(
    `SELECT p.no_hp, p.keterangan AS nama, t.kode_pelanggan AS kode,
            COALESCE(r.alamat_lengkap, '') AS alamat
       FROM tra_pelanggan_bpab_tagihan t
       JOIN tra_pelanggan_bpab p ON p.kode_pelanggan = t.kode_pelanggan
       LEFT JOIN tra_rumah r ON r.id_rw = p.id_rw AND r.kode = p.kode_rumah
      WHERE t.tahun = ? AND t.bulan = ?
        AND (t.meteran_akhir IS NULL OR t.meteran_akhir = 0)
        AND p.stat_aktif = 'Y'
        AND TRIM(COALESCE(p.no_hp, '')) <> ''
      ORDER BY t.kode_pelanggan`,
    [tahun, bulan]
  );

  // Gabung per nomor HP (satu warga bisa punya beberapa kode pelanggan)
  const map = new Map();
  for (const r of rows) {
    const wa = normWa(r.no_hp);
    if (!wa) continue;
    if (!map.has(wa)) {
      map.set(wa, { wa, nama: r.nama || '', ids: [], alamats: [], items: [] });
    }
    const g = map.get(wa);
    if (r.kode && !g.ids.includes(r.kode)) g.ids.push(r.kode);
    if (r.alamat && !g.alamats.includes(r.alamat)) g.alamats.push(r.alamat);
  }
  // Urut menurut kode pelanggan terkecil. Satu target bisa memuat beberapa kode
  // (nomor HP yang sama), jadi kode terkecil dipakai sebagai penentu urutan.
  return [...map.values()]
    .map((g) => ({ ...g, ids: [...g.ids].sort() }))
    .sort((a, b) => (a.ids[0] || '').localeCompare(b.ids[0] || ''))
    .map((g, i) => ({
      id: `tgt-${i}`,
      wa: g.wa,
      nama: g.nama,
      customId: g.ids.join(', '),
      alamat: g.alamats.join(', '),
      items: [],
      status: 'pending',
      customMessage: '',
    }));
}

// ============ TAGIHAN: tagihan belum bayar, digabung per nomor HP ============
export async function targetTagihan() {
  const rows = await query(
    `SELECT p.no_hp, p.keterangan AS nama, t.kode_pelanggan AS kode,
            COALESCE(r.alamat_lengkap, '') AS alamat,
            p.saldo_deposit AS deposit,
            t.tahun, t.bulan,
            t.meteran_awal AS meterLalu, t.meteran_akhir AS meterKini,
            t.pemakaian, t.total_tagihan AS tagihan,
            COALESCE(t.keterangan, '') AS keterangan
       FROM tra_pelanggan_bpab_tagihan t
       JOIN tra_pelanggan_bpab p ON p.kode_pelanggan = t.kode_pelanggan
       LEFT JOIN tra_rumah r ON r.id_rw = p.id_rw AND r.kode = p.kode_rumah
      WHERE t.status_bayar = 'N' AND t.total_tagihan > 0 AND p.stat_aktif = 'Y'
        AND TRIM(COALESCE(p.no_hp, '')) <> ''
      ORDER BY p.no_hp, t.kode_pelanggan, t.tahun, t.bulan`
  );

  const map = new Map();
  for (const r of rows) {
    const wa = normWa(r.no_hp);
    if (!wa) continue;
    if (!map.has(wa)) {
      map.set(wa, { wa, nama: r.nama || '', ids: new Set(), alamats: new Set(), items: [] });
    }
    const g = map.get(wa);
    g.ids.add(r.kode);
    if (r.alamat) g.alamats.add(r.alamat);
    g.items.push({
      kode: r.kode,
      alamat: r.alamat || '',
      deposit: Number(r.deposit) || 0,
      bulan: labelBulan(r.bulan, r.tahun),
      tagihan: Number(r.tagihan) || 0,
      meterLalu: r.meterLalu,
      meterKini: r.meterKini,
      pemakaian: r.pemakaian,
      keterangan: r.keterangan || '',
    });
  }

  // Urut menurut kode pelanggan terkecil (lihat catatan di targetFotoMeteran).
  return [...map.values()]
    .map((g) => ({ ...g, ids: [...g.ids].sort() }))
    .sort((a, b) => (a.ids[0] || '').localeCompare(b.ids[0] || ''))
    .map((g, i) => ({
      id: `tgt-${i}`,
      wa: g.wa,
      nama: g.nama,
      customId: g.ids.join(', '),
      alamat: [...g.alamats].join(', '),
      items: g.items,
      status: 'pending',
      customMessage: '',
    }));
}
