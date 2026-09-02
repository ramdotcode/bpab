// Laporan (read-only) — meniru 3 file Excel bulanan:
//  1. Meteran        : form baca meteran periode pemakaian berjalan
//  2. Belum Bayar    : semua tagihan belum lunas (1 baris/tagihan)
//  3. Sudah Bayar    : register periode + info pembayaran + TOTAL
//
// Semua fungsi menerima "Bulan Laporan" (bulan kerja petugas) lalu menghitung
// offset periode pemakaiannya sendiri. Alur bulanan BPAB: pada Bulan Laporan X,
// petugas MEMBACA meteran pemakaian bulan X, dan MENAGIH pemakaian bulan X-1.
import { query } from './db.js';
import { labelBulan } from './targets.js';

export function prevMonth(tahun, bulan) {
  let y = parseInt(tahun, 10);
  let m = parseInt(bulan, 10) - 1;
  if (m < 1) { m = 12; y -= 1; }
  return { tahun: String(y), bulan: String(m).padStart(2, '0') };
}

// 0 / null / '' -> null (biar tampil kosong seperti di Excel contoh)
export const blankZero = (v) => {
  const n = Number(v);
  return (v === null || v === undefined || v === '' || n === 0) ? null : n;
};

export const caraBayarText = (jenis, cara) => {
  if (jenis === 'C') return 'Cash / Tunai';
  if (jenis === 'T') return 'Transfer';
  if (jenis === 'D') return 'Deposit';
  return cara ? String(cara) : '';
};

export const SELECT_PELANGGAN = `
  p.kode_pelanggan AS kode, p.keterangan AS nama,
  COALESCE(rt.nama_rt, '') AS rt, COALESCE(r.alamat_lengkap, '') AS alamat`;
export const JOIN_ALAMAT = `
  LEFT JOIN tra_rumah r ON r.id_rw = p.id_rw AND r.kode = p.kode_rumah
  LEFT JOIN ref_rt rt ON rt.id_rw = p.id_rw AND rt.kode = r.kode_rt`;

// ---------- 1. METERAN (pemakaian = Bulan Laporan) ----------
export async function laporanMeteran({ tahun, bulan }) {
  const rows = await query(
    `SELECT ${SELECT_PELANGGAN},
            t.meteran_awal AS awal, t.meteran_akhir AS akhir,
            COALESCE(t.keterangan, '') AS catatan
       FROM tra_pelanggan_bpab p ${JOIN_ALAMAT}
       LEFT JOIN tra_pelanggan_bpab_tagihan t
         ON t.kode_pelanggan = p.kode_pelanggan AND t.tahun = ? AND t.bulan = ?
      WHERE p.stat_aktif = 'Y'
      ORDER BY p.kode_pelanggan`,
    [tahun, bulan]
  );
  const data = rows.map((r, i) => ({
    no: i + 1, kode: r.kode, nama: r.nama, rt: r.rt, alamat: r.alamat,
    awal: blankZero(r.awal), akhir: blankZero(r.akhir), catatan: r.catatan || '',
  }));
  return {
    tipe: 'meteran',
    judul: `Pemakaian ${labelBulan(bulan, tahun)}`,
    periode: { tahun, bulan, label: labelBulan(bulan, tahun) },
    kolom: ['No', 'Kode', 'Nama Pelanggan', 'RT', 'Alamat Rumah', 'Awal', 'Akhir', 'Catatan'],
    rows: data,
  };
}

// ---------- 2. BELUM BAYAR (tagihan belum lunas s/d pemakaian Bulan Laporan - 1) ----------
export async function laporanBelumBayar({ tahun, bulan }) {
  const u = prevMonth(tahun, bulan);           // batas pemakaian yang sudah jatuh tempo
  const cap = `${u.tahun}${u.bulan}`;          // fixed-width -> aman dibanding string
  const rows = await query(
    `SELECT t.tahun, t.bulan, ${SELECT_PELANGGAN},
            t.meteran_awal AS awal, t.meteran_akhir AS akhir,
            t.pemakaian AS selisih, t.total_tagihan AS total
       FROM tra_pelanggan_bpab_tagihan t
       JOIN tra_pelanggan_bpab p ON p.kode_pelanggan = t.kode_pelanggan ${JOIN_ALAMAT}
      WHERE t.status_bayar = 'N' AND t.total_tagihan > 0 AND p.stat_aktif = 'Y'
        AND CONCAT(t.tahun, t.bulan) <= ?
      ORDER BY p.kode_pelanggan, t.tahun, t.bulan`,
    [cap]
  );
  let totalSemua = 0;
  const data = rows.map((r, i) => {
    totalSemua += Number(r.total) || 0;
    return {
      no: i + 1, periode: labelBulan(r.bulan, r.tahun).toUpperCase(),
      kode: r.kode, nama: r.nama, rt: r.rt, alamat: r.alamat,
      awal: blankZero(r.awal), akhir: blankZero(r.akhir),
      selisih: blankZero(r.selisih), total: Number(r.total) || 0,
    };
  });
  return {
    tipe: 'belum-bayar',
    judul: `Belum bayar sampai ${labelBulan(bulan, tahun)}`,
    periode: { tahun, bulan, label: labelBulan(bulan, tahun) },
    kolom: ['No', 'Periode', 'Kode', 'Nama Pelanggan', 'RT', 'Alamat Rumah', 'Awal', 'Akhir', 'Selisih', 'Total'],
    rows: data,
    total: totalSemua,
  };
}

// ---------- 3. SUDAH BAYAR (register pemakaian Bulan Laporan - 1 + pembayaran) ----------
export async function laporanSudahBayar({ tahun, bulan }) {
  const u = prevMonth(tahun, bulan);           // pemakaian yang ditagih bulan ini
  const rows = await query(
    `SELECT ${SELECT_PELANGGAN},
            t.meteran_awal AS awal, t.meteran_akhir AS akhir, t.pemakaian,
            t.status_bayar, t.tanggal_bayar, t.jumlah_pembayaran AS pembayaran,
            t.jenis_bayar, t.cara_bayar
       FROM tra_pelanggan_bpab p ${JOIN_ALAMAT}
       LEFT JOIN tra_pelanggan_bpab_tagihan t
         ON t.kode_pelanggan = p.kode_pelanggan AND t.tahun = ? AND t.bulan = ?
      WHERE p.stat_aktif = 'Y'
      ORDER BY p.kode_pelanggan`,
    [u.tahun, u.bulan]
  );
  let totalBayar = 0;
  const data = rows.map((r, i) => {
    const lunas = r.status_bayar === 'Y';
    if (lunas) totalBayar += Number(r.pembayaran) || 0;
    let tgl = r.tanggal_bayar;
    if (tgl instanceof Date) tgl = tgl.toISOString().slice(0, 10);
    return {
      no: i + 1, kode: r.kode, nama: r.nama, rt: r.rt, alamat: r.alamat,
      awal: blankZero(r.awal), akhir: blankZero(r.akhir), pemakaian: blankZero(r.pemakaian),
      tgl_bayar: lunas ? (tgl || '') : '',
      pembayaran: lunas ? (Number(r.pembayaran) || 0) : null,
      cara: lunas ? caraBayarText(r.jenis_bayar, r.cara_bayar) : '',
    };
  });
  return {
    tipe: 'sudah-bayar',
    judul: `Data ${labelBulan(bulan, tahun)} (Pemakaian ${labelBulan(u.bulan, u.tahun)})`,
    periode: { tahun, bulan, label: labelBulan(bulan, tahun), pemakaian: labelBulan(u.bulan, u.tahun) },
    kolom: ['No', 'Kode', 'Nama Pelanggan', 'RT', 'Alamat Rumah', 'Awal', 'Akhir', 'Pemakaian', 'Tgl Bayar', 'Pembayaran', 'Cara Bayar'],
    rows: data,
    total: totalBayar,
  };
}
