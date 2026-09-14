// Laporan (read-only) — meniru 3 file Excel bulanan:
//  1. Meteran        : form baca meteran periode pemakaian berjalan
//  2. Belum Bayar    : semua tagihan belum lunas (1 baris/tagihan)
//  3. Sudah Bayar    : register periode + info pembayaran + status tepat waktu/terlambat
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
// "Sudah bayar" = dibayar TEPAT WAKTU, yaitu tanggal_bayar jatuh di Bulan Laporan.
// Tagihan yang dilunasi belakangan tetap tampil dengan keterangan, tapi tidak ikut
// TOTAL — uangnya tercatat sebagai tunggakan di Pemasukan bulan pembayarannya.
// Dengan begitu TOTAL di sini = kategori "Bulan ini" di laporan Pemasukan.
export const STATUS_BAYAR = {
  'tepat-waktu': 'Tepat waktu',
  'terlambat': 'Terlambat',
  'lebih-awal': 'Lebih awal',
  'belum': 'Belum bayar',
  'lain': 'Lunas',
};

export async function laporanSudahBayar({ tahun, bulan }) {
  const u = prevMonth(tahun, bulan);           // pemakaian yang ditagih bulan ini
  const n = nextMonth(tahun, bulan);
  const awal = `${tahun}-${bulan}-01`;
  const batas = `${n.tahun}-${n.bulan}-01`;
  // Pelanggan nonaktif tetap dimuat kalau tagihannya lunas, supaya TOTAL sama
  // dengan Pemasukan (yang menghitung semua uang masuk).
  const rows = await query(
    `SELECT ${SELECT_PELANGGAN},
            t.meteran_awal AS awal, t.meteran_akhir AS akhir, t.pemakaian,
            t.total_tagihan AS total,
            t.status_bayar, t.tanggal_bayar, t.jumlah_pembayaran AS pembayaran,
            t.jenis_bayar, t.cara_bayar
       FROM tra_pelanggan_bpab p ${JOIN_ALAMAT}
       LEFT JOIN tra_pelanggan_bpab_tagihan t
         ON t.kode_pelanggan = p.kode_pelanggan AND t.tahun = ? AND t.bulan = ?
      WHERE p.stat_aktif = 'Y' OR t.status_bayar = 'Y'
      ORDER BY p.kode_pelanggan`,
    [u.tahun, u.bulan]
  );

  const ringkasan = Object.fromEntries(Object.keys(STATUS_BAYAR).map((k) => [k, { n: 0, rp: 0 }]));
  const data = rows.map((r, i) => {
    const lunas = r.status_bayar === 'Y';
    const tgl = String(r.tanggal_bayar || '').slice(0, 10);
    const bulanBayar = tgl ? labelBulan(tgl.slice(5, 7), tgl.slice(0, 4)) : '';
    const rp = Number(r.pembayaran) || 0;

    let status = 'belum';
    let keterangan = '';
    if (!lunas) {
      if (r.total === null || r.total === undefined) keterangan = 'Tagihan belum dibuat';
    } else if (!tgl || tgl < '1900') {
      status = 'lain';
      keterangan = 'Lunas, tanggal bayar kosong';
    } else if (tgl >= batas) {
      status = 'terlambat';
      keterangan = `Dibayar ${bulanBayar} — masuk tunggakan di Pemasukan ${bulanBayar}`;
    } else if (tgl < awal) {
      status = 'lebih-awal';
      keterangan = `Dibayar ${bulanBayar} (di muka)`;
    } else {
      status = 'tepat-waktu';
    }
    ringkasan[status].n += 1;
    ringkasan[status].rp += lunas ? rp : (Number(r.total) || 0);

    const tepat = status === 'tepat-waktu';
    return {
      no: i + 1, kode: r.kode, nama: r.nama, rt: r.rt, alamat: r.alamat,
      awal: blankZero(r.awal), akhir: blankZero(r.akhir), pemakaian: blankZero(r.pemakaian),
      tagihan: blankZero(r.total),
      tgl_bayar: lunas ? tgl : '',
      pembayaran: tepat ? rp : null,
      cara: lunas ? caraBayarText(r.jenis_bayar, r.cara_bayar) : '',
      status, status_label: STATUS_BAYAR[status], keterangan,
    };
  });
  return {
    tipe: 'sudah-bayar',
    judul: `Data ${labelBulan(bulan, tahun)} (Pemakaian ${labelBulan(u.bulan, u.tahun)})`,
    periode: { tahun, bulan, label: labelBulan(bulan, tahun), pemakaian: labelBulan(u.bulan, u.tahun) },
    kolom: ['No', 'Kode', 'Nama Pelanggan', 'RT', 'Alamat Rumah', 'Awal', 'Akhir', 'Pemakaian',
            'Tagihan', 'Tgl Bayar', 'Pembayaran', 'Cara Bayar', 'Status', 'Keterangan'],
    rows: data,
    total: ringkasan['tepat-waktu'].rp,
    ringkasan,
  };
}

// ---------- 4. PEMASUKAN (kas masuk menurut TANGGAL BAYAR dalam Bulan Laporan) ----------
// Berbeda dari "Sudah Bayar" yang berpatokan pada periode tagihan, laporan ini
// berpatokan pada kapan uang diterima. Setiap tagihan lunas yang tanggal_bayar-nya
// jatuh di Bulan Laporan dihitung, lalu dipilah menurut periode tagihannya:
//   bulan-ini : tagihan pemakaian Bulan Laporan - 1 (yang memang ditagih bulan ini)
//   tunggakan : tagihan periode yang lebih lama (bayar bulan ini untuk bulan lalu)
//   di-muka   : tagihan periode yang belum jatuh tempo (dibayar lebih awal)
export function nextMonth(tahun, bulan) {
  let y = parseInt(tahun, 10);
  let m = parseInt(bulan, 10) + 1;
  if (m > 12) { m = 1; y += 1; }
  return { tahun: String(y), bulan: String(m).padStart(2, '0') };
}

export const KATEGORI_PEMASUKAN = {
  'bulan-ini': 'Bulan ini',
  'tunggakan': 'Tunggakan',
  'di-muka': 'Di muka',
};

export function kategoriPemasukan(periodeTagihan, periodeDitagih) {
  if (periodeTagihan === periodeDitagih) return 'bulan-ini';
  return periodeTagihan < periodeDitagih ? 'tunggakan' : 'di-muka';
}

export async function laporanPemasukan({ tahun, bulan }) {
  const u = prevMonth(tahun, bulan);           // periode yang ditagih bulan ini
  const n = nextMonth(tahun, bulan);
  const awal = `${tahun}-${bulan}-01`;
  const batas = `${n.tahun}-${n.bulan}-01`;    // eksklusif — aman untuk DATE maupun DATETIME
  const ditagih = `${u.tahun}${u.bulan}`;

  const rows = await query(
    `SELECT t.tahun, t.bulan, ${SELECT_PELANGGAN},
            t.total_tagihan AS total, t.jumlah_pembayaran AS pembayaran, t.denda,
            t.tanggal_bayar, t.jenis_bayar, t.cara_bayar,
            COALESCE(t.no_kwitansi, '') AS kwitansi
       FROM tra_pelanggan_bpab_tagihan t
       JOIN tra_pelanggan_bpab p ON p.kode_pelanggan = t.kode_pelanggan ${JOIN_ALAMAT}
      WHERE t.status_bayar = 'Y'
        AND t.tanggal_bayar >= ? AND t.tanggal_bayar < ?
      ORDER BY t.tanggal_bayar, p.kode_pelanggan, t.tahun, t.bulan`,
    [awal, batas]
  );

  const ringkasan = {
    total: 0, denda: 0,
    'bulan-ini': { n: 0, rp: 0 },
    'tunggakan': { n: 0, rp: 0 },
    'di-muka': { n: 0, rp: 0 },
  };
  const data = rows.map((r, i) => {
    const kat = kategoriPemasukan(`${r.tahun}${r.bulan}`, ditagih);
    const rp = Number(r.pembayaran) || 0;
    ringkasan.total += rp;
    ringkasan.denda += Number(r.denda) || 0;
    ringkasan[kat].n += 1;
    ringkasan[kat].rp += rp;
    return {
      no: i + 1,
      tgl_bayar: String(r.tanggal_bayar || '').slice(0, 10),
      kode: r.kode, nama: r.nama, rt: r.rt,
      periode: labelBulan(r.bulan, r.tahun), periode_kode: `${r.tahun}${r.bulan}`,
      kategori: kat, kategori_label: KATEGORI_PEMASUKAN[kat],
      total: Number(r.total) || 0, pembayaran: rp,
      cara: caraBayarText(r.jenis_bayar, r.cara_bayar), kwitansi: r.kwitansi,
    };
  });

  return {
    tipe: 'pemasukan',
    judul: `Pemasukan ${labelBulan(bulan, tahun)}`,
    periode: { tahun, bulan, label: labelBulan(bulan, tahun), pemakaian: labelBulan(u.bulan, u.tahun) },
    kolom: ['No', 'Tgl Bayar', 'Kode', 'Nama Pelanggan', 'RT', 'Periode Tagihan', 'Kategori',
            'Tagihan', 'Pembayaran', 'Cara Bayar', 'Kwitansi'],
    rows: data,
    total: ringkasan.total,
    ringkasan,
  };
}

// ---------- 5. BAYAR TUNGGAKAN (dibayar di Bulan Laporan untuk periode sebelum X-1) ----------
// "Sudah Bayar" hanya memuat periode X-1, dan saat periode yang lebih lama dulu
// dilaporkan, pelanggannya belum bayar. Akibatnya pelanggan yang melunasi 2 bulan
// atau lebih sekaligus tidak pernah tercatat di Excel bulanan mana pun. Laporan ini
// menampung tagihan-tagihan itu: tanggal_bayar di Bulan Laporan, periode < X-1.
// Pelengkap "Sudah Bayar": keduanya dijumlah = semua tagihan lunas bulan ini
// (kecuali yang dibayar di muka).
export async function laporanBayarTunggakan({ tahun, bulan }) {
  const u = prevMonth(tahun, bulan);           // periode yang ditagih bulan ini
  const n = nextMonth(tahun, bulan);
  const rows = await query(
    `SELECT t.tahun, t.bulan, ${SELECT_PELANGGAN},
            t.meteran_awal AS awal, t.meteran_akhir AS akhir, t.pemakaian,
            t.total_tagihan AS total, t.jumlah_pembayaran AS pembayaran, t.denda,
            t.tanggal_bayar, t.jenis_bayar, t.cara_bayar,
            COALESCE(t.no_kwitansi, '') AS kwitansi
       FROM tra_pelanggan_bpab_tagihan t
       JOIN tra_pelanggan_bpab p ON p.kode_pelanggan = t.kode_pelanggan ${JOIN_ALAMAT}
      WHERE t.status_bayar = 'Y'
        AND t.tanggal_bayar >= ? AND t.tanggal_bayar < ?
        AND CONCAT(t.tahun, t.bulan) < ?
      ORDER BY p.kode_pelanggan, t.tahun, t.bulan`,
    [`${tahun}-${bulan}-01`, `${n.tahun}-${n.bulan}-01`, `${u.tahun}${u.bulan}`]
  );

  const ringkasan = { total: 0, denda: 0, tagihan: rows.length, pelanggan: 0, perPeriode: [] };
  const perPeriode = new Map();
  const pelanggan = new Set();
  const data = rows.map((r, i) => {
    const rp = Number(r.pembayaran) || 0;
    const kodePeriode = `${r.tahun}${r.bulan}`;
    ringkasan.total += rp;
    ringkasan.denda += Number(r.denda) || 0;
    pelanggan.add(r.kode);
    const p = perPeriode.get(kodePeriode) || { periode: labelBulan(r.bulan, r.tahun), periode_kode: kodePeriode, n: 0, rp: 0 };
    p.n += 1;
    p.rp += rp;
    perPeriode.set(kodePeriode, p);
    return {
      no: i + 1,
      tgl_bayar: String(r.tanggal_bayar || '').slice(0, 10),
      kode: r.kode, nama: r.nama, rt: r.rt, alamat: r.alamat,
      periode: labelBulan(r.bulan, r.tahun), periode_kode: kodePeriode,
      awal: blankZero(r.awal), akhir: blankZero(r.akhir), pemakaian: blankZero(r.pemakaian),
      total: Number(r.total) || 0, pembayaran: rp,
      cara: caraBayarText(r.jenis_bayar, r.cara_bayar), kwitansi: r.kwitansi,
    };
  });
  ringkasan.pelanggan = pelanggan.size;
  ringkasan.perPeriode = [...perPeriode.values()].sort((a, b) => a.periode_kode.localeCompare(b.periode_kode));

  return {
    tipe: 'bayar-tunggakan',
    judul: `Bayar Tunggakan ${labelBulan(bulan, tahun)}`,
    periode: { tahun, bulan, label: labelBulan(bulan, tahun), pemakaian: labelBulan(u.bulan, u.tahun) },
    kolom: ['No', 'Tgl Bayar', 'Kode', 'Nama Pelanggan', 'RT', 'Alamat Rumah', 'Periode Tagihan',
            'Awal', 'Akhir', 'Pemakaian', 'Tagihan', 'Pembayaran', 'Cara Bayar', 'Kwitansi'],
    rows: data,
    total: ringkasan.total,
    ringkasan,
  };
}
