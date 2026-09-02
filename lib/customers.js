// Data pelanggan: daftar + kartu detail beserta seluruh riwayat.
// Satu-satunya operasi tulis di sini: ubahNoHp (lewat jalur sempit di db.js).
import { query, updateNoHpPelanggan } from './db.js';
import { labelBulan } from './targets.js';
import { blankZero, caraBayarText, SELECT_PELANGGAN, JOIN_ALAMAT } from './reports.js';

// ---------- Daftar RT untuk filter ----------
export async function listRT() {
  const rows = await query(
    `SELECT nama_rt FROM ref_rt WHERE stat_aktif = 'Y' AND TRIM(COALESCE(nama_rt,'')) <> ''
      GROUP BY nama_rt ORDER BY nama_rt`
  );
  return rows.map((r) => r.nama_rt);
}

// ---------- Daftar pelanggan + ringkasan tunggakan ----------
export async function listPelanggan({ q = '', rt = '', nunggak = false } = {}) {
  const params = [];
  let where = `WHERE p.stat_aktif = 'Y'`;
  if (q) {
    where += ` AND (p.kode_pelanggan LIKE ? OR p.keterangan LIKE ? OR p.no_hp LIKE ?
                    OR COALESCE(r.alamat_lengkap,'') LIKE ?)`;
    const like = `%${q}%`;
    params.push(like, like, like, like);
  }
  if (rt) { where += ` AND rt.nama_rt = ?`; params.push(rt); }

  const having = nunggak ? 'HAVING rp_tunggak > 0' : '';
  const rows = await query(
    `SELECT ${SELECT_PELANGGAN}, p.no_hp, p.saldo_deposit AS deposit, p.tarif,
            COUNT(CASE WHEN t.status_bayar = 'N' AND t.total_tagihan > 0 THEN 1 END) AS n_tunggak,
            COALESCE(SUM(CASE WHEN t.status_bayar = 'N' THEN t.total_tagihan END), 0) AS rp_tunggak,
            MAX(CASE WHEN t.status_bayar = 'Y' THEN t.tanggal_bayar END) AS bayar_terakhir
       FROM tra_pelanggan_bpab p ${JOIN_ALAMAT}
       LEFT JOIN tra_pelanggan_bpab_tagihan t ON t.kode_pelanggan = p.kode_pelanggan
       ${where}
      GROUP BY p.kode_pelanggan, p.keterangan, rt.nama_rt, r.alamat_lengkap,
               p.no_hp, p.saldo_deposit, p.tarif
      ${having}
      ORDER BY p.kode_pelanggan`,
    params
  );

  return rows.map((r) => ({
    kode: r.kode, nama: r.nama || '', rt: r.rt || '', alamat: r.alamat || '',
    no_hp: r.no_hp || '', deposit: Number(r.deposit) || 0, tarif: Number(r.tarif) || 0,
    n_tunggak: Number(r.n_tunggak) || 0, rp_tunggak: Number(r.rp_tunggak) || 0,
    bayar_terakhir: r.bayar_terakhir || '',
  }));
}

// ---------- Ubah no HP pelanggan ----------
// Nomor boleh dikosongkan (menghapus nomor yang salah). Karakter selain angka
// dan + dibuang; normalisasi ke +62 tetap terjadi saat dipakai (normWa).
export async function ubahNoHp(kode, noHpMentah) {
  const kodeBersih = String(kode ?? '').trim();
  if (!kodeBersih) throw new Error('Kode pelanggan wajib ada.');

  const noHp = String(noHpMentah ?? '').trim().replace(/[^\d+]/g, '');
  if (noHp) {
    const digit = noHp.replace(/\D/g, '');
    if (digit.length < 8 || digit.length > 15) {
      throw new Error('Nomor HP tidak valid: panjangnya harus 8–15 digit.');
    }
  }

  const ada = await query(
    'SELECT kode_pelanggan FROM tra_pelanggan_bpab WHERE kode_pelanggan = ? LIMIT 1',
    [kodeBersih]
  );
  if (ada.length === 0) throw new Error('Pelanggan tidak ditemukan.');

  await updateNoHpPelanggan(kodeBersih, noHp);
  return { kode: kodeBersih, no_hp: noHp };
}

// ---------- Kartu detail satu pelanggan ----------
export async function detailPelanggan(kode) {
  const prof = await query(
    `SELECT ${SELECT_PELANGGAN}, p.no_hp, p.nik, p.tarif, p.saldo_deposit AS deposit,
            p.jenis_langganan, p.tanggal_daftar, p.stat_aktif, p.kode_rumah,
            p.kode_pelanggan_manual AS kode_manual, COALESCE(p.keterangan, '') AS ket,
            COALESCE(r.nama_penghuni, '') AS penghuni
       FROM tra_pelanggan_bpab p ${JOIN_ALAMAT}
      WHERE p.kode_pelanggan = ?
      LIMIT 1`,
    [kode]
  );
  if (prof.length === 0) return null;
  const p = prof[0];

  // Riwayat tagihan (semua periode, terbaru dulu)
  const tagihan = (await query(
    `SELECT tahun, bulan, meteran_awal AS awal, meteran_akhir AS akhir, pemakaian,
            tarif, total_tagihan AS total, status_bayar, tanggal_bayar,
            jenis_bayar, cara_bayar, jumlah_pembayaran AS dibayar, denda,
            no_kwitansi, COALESCE(keterangan, '') AS keterangan
       FROM tra_pelanggan_bpab_tagihan
      WHERE kode_pelanggan = ?
      ORDER BY tahun DESC, bulan DESC`,
    [kode]
  )).map((t) => ({
    periode: labelBulan(t.bulan, t.tahun), tahun: t.tahun, bulan: t.bulan,
    awal: blankZero(t.awal), akhir: blankZero(t.akhir), pemakaian: blankZero(t.pemakaian),
    total: Number(t.total) || 0, lunas: t.status_bayar === 'Y',
    tgl_bayar: t.tanggal_bayar || '',
    cara: t.status_bayar === 'Y' ? caraBayarText(t.jenis_bayar, t.cara_bayar) : '',
    dibayar: Number(t.dibayar) || 0, denda: Number(t.denda) || 0,
    kwitansi: t.no_kwitansi || '', keterangan: t.keterangan,
  }));

  // Riwayat pembayaran (transaksi kas)
  const bayar = (await query(
    `SELECT tanggal_bayar, jenis_bayar, cara_bayar, jumlah_pembayaran AS jumlah,
            nominal_tagihan, denda, biaya_admin, no_kwitansi,
            COALESCE(penerima_pembayaran, '') AS penerima, isi_deposit, isi_saldo,
            COALESCE(keterangan, '') AS keterangan
       FROM tra_pelanggan_bpab_bayar
      WHERE kode_pelanggan = ? AND stat_aktif = 'Y'
      ORDER BY tanggal_bayar DESC, id DESC`,
    [kode]
  )).map((b) => ({
    tanggal: b.tanggal_bayar || '', jumlah: Number(b.jumlah) || 0,
    cara: caraBayarText(b.jenis_bayar, b.cara_bayar),
    nominal_tagihan: Number(b.nominal_tagihan) || 0, denda: Number(b.denda) || 0,
    kwitansi: b.no_kwitansi || '', penerima: b.penerima,
    isi_deposit: b.isi_deposit === 'Y', isi_saldo: Number(b.isi_saldo) || 0,
    keterangan: b.keterangan,
  }));

  // Mutasi saldo deposit
  const deposit = (await query(
    `SELECT tanggal, saldo_awal, masuk, keluar, saldo_akhir, no_kwitansi,
            COALESCE(keterangan, '') AS keterangan
       FROM tra_pelanggan_bpab_deposit_mutasi
      WHERE kode_pelanggan = ? AND stat_aktif = 'Y'
      ORDER BY tanggal DESC, id DESC`,
    [kode]
  )).map((d) => ({
    tanggal: d.tanggal || '', saldo_awal: Number(d.saldo_awal) || 0,
    masuk: Number(d.masuk) || 0, keluar: Number(d.keluar) || 0,
    saldo_akhir: Number(d.saldo_akhir) || 0,
    kwitansi: d.no_kwitansi || '', keterangan: d.keterangan,
  }));

  // Ringkasan
  const belum = tagihan.filter((t) => !t.lunas && t.total > 0);
  const pakaiValid = tagihan.filter((t) => t.pemakaian);
  const ringkasan = {
    n_tagihan: tagihan.length,
    n_tunggak: belum.length,
    rp_tunggak: belum.reduce((s, t) => s + t.total, 0),
    total_dibayar: bayar.reduce((s, b) => s + b.jumlah, 0),
    rata_pemakaian: pakaiValid.length
      ? Math.round(pakaiValid.reduce((s, t) => s + Number(t.pemakaian), 0) / pakaiValid.length)
      : 0,
    pemakaian_terakhir: pakaiValid[0]?.pemakaian || 0,
    bayar_terakhir: bayar[0]?.tanggal || '',
  };

  return {
    profil: {
      kode: p.kode, kode_manual: p.kode_manual || '', nama: p.nama || '',
      rt: p.rt || '', alamat: p.alamat || '', penghuni: p.penghuni,
      no_hp: p.no_hp || '', nik: p.nik || '', tarif: Number(p.tarif) || 0,
      deposit: Number(p.deposit) || 0, tanggal_daftar: p.tanggal_daftar || '',
      aktif: p.stat_aktif === 'Y',
      jenis_langganan: p.jenis_langganan === '1' ? 'Rumah Tangga' : (p.jenis_langganan || ''),
    },
    ringkasan, tagihan, bayar, deposit,
  };
}
