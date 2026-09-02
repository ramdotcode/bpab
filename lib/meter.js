// Input meteran — satu-satunya fitur yang menulis ke database.
// Perilakunya meniru aplikasi lama, hasil pembuktian diff snapshot 30 Jul 2026:
// hanya UPDATE 5 kolom pada baris yang SUDAH ADA; tidak pernah membuat baris
// periode berikutnya (itu tugas proses "buka periode" di aplikasi lama).
import { query, updateMeteran, updateMeteranAwal } from './db.js';
import { labelBulan } from './targets.js';
import { SELECT_PELANGGAN, JOIN_ALAMAT, prevMonth } from './reports.js';

const USER_INPUT = process.env.USER_INPUT_ID || '10';
const IZIN_TULIS = process.env.IZINKAN_TULIS_METERAN !== 'false'; // default: boleh

// Pelanggan tarif flat (mis. Polsek): meteran tidak dibaca, tagihan tetap.
const isFlat = (jenis) => String(jenis) === '2';

// Ditandai bila pemakaiannya nol selama sebanyak ini bulan berturut-turut.
const BATAS_DIAM = 3;

let minimalCache = null;
async function minimalPemakaian() {
  if (minimalCache !== null) return minimalCache;
  const r = await query(
    `SELECT minimal_pemakaian FROM ref_setting_bpab WHERE stat_aktif='Y'
      ORDER BY tanggal_awal DESC LIMIT 1`
  );
  minimalCache = Number(r[0]?.minimal_pemakaian) || 6;
  return minimalCache;
}

// Formula terverifikasi 950/950 baris.
export function hitung({ awal, akhir, tarif, minimal }) {
  const pemakaian = Number(akhir) - Number(awal);
  const total = Math.max(pemakaian, minimal) * Number(tarif);
  return { pemakaian, total };
}

// Geser periode ke belakang n bulan — untuk batas "setahun terakhir".
function bulanKeBelakang(tahun, bulan, n) {
  let y = parseInt(tahun, 10);
  let m = parseInt(bulan, 10) - n;
  while (m < 1) { m += 12; y -= 1; }
  return { tahun: String(y), bulan: String(m).padStart(2, '0') };
}

function nextMonth(tahun, bulan) {
  let y = parseInt(tahun, 10);
  let m = parseInt(bulan, 10) + 1;
  if (m > 12) { m = 1; y += 1; }
  return { tahun: String(y), bulan: String(m).padStart(2, '0') };
}

// Setelah meteran akhir periode ini berubah, baris periode BERIKUTNYA bisa jadi
// tidak nyambung lagi (awalnya masih memakai angka lama). Fungsi ini melaporkannya
// supaya penggunanya ditawari memperbaiki — bukan diam-diam ikut diubah.
async function cekLanjutan({ kode, tahun, bulan, akhirBaru }) {
  const nx = nextMonth(tahun, bulan);
  const r = await query(
    `SELECT meteran_awal AS awal, meteran_akhir AS akhir, status_bayar
       FROM tra_pelanggan_bpab_tagihan
      WHERE kode_pelanggan = ? AND tahun = ? AND bulan = ? AND urutan = 1
      LIMIT 1`,
    [kode, nx.tahun, nx.bulan]
  );
  if (r.length === 0) return null;                       // periode berikutnya belum dibuka
  const awal = Number(r[0].awal) || 0;
  if (awal === Number(akhirBaru)) return null;           // sudah nyambung
  return {
    tahun: nx.tahun, bulan: nx.bulan,
    periode: labelBulan(nx.bulan, nx.tahun),
    awal_sekarang: awal,
    awal_seharusnya: Number(akhirBaru),
    lunas: r[0].status_bayar === 'Y',
    bisa_dikoreksi: r[0].status_bayar !== 'Y',
  };
}

// ---------- Daftar baris meteran untuk satu periode ----------
export async function daftarMeteran({ tahun, bulan, hanyaKosong = false }) {
  const sb = prevMonth(tahun, bulan);          // periode sebelumnya, untuk cek rantai meteran
  const b12 = bulanKeBelakang(tahun, bulan, 12); // batas bawah "setahun terakhir"
  const kunciBawah = `${b12.tahun}${b12.bulan}`;
  const kunciSekarang = `${tahun}${bulan}`;

  const rows = await query(
    `SELECT ${SELECT_PELANGGAN}, p.no_hp, p.jenis_langganan,
            t.urutan, t.meteran_awal AS awal, t.meteran_akhir AS akhir,
            t.pemakaian, t.tarif, t.total_tagihan AS total,
            t.status_bayar, t.ganti_meteran, t.tanggal_input, t.user_input,
            pv.meteran_akhir AS akhir_sebelum,
            -- rata-rata pemakaian 12 bulan terakhir, hanya periode yang meterannya
            -- benar-benar sudah dibaca (yang belum dibaca tidak dihitung sebagai 0)
            (SELECT AVG(h.pemakaian) FROM tra_pelanggan_bpab_tagihan h
              WHERE h.kode_pelanggan = t.kode_pelanggan AND h.urutan = 1
                AND h.meteran_akhir > 0
                AND CONCAT(h.tahun, h.bulan) >= ? AND CONCAT(h.tahun, h.bulan) < ?
            ) AS rata12,
            (SELECT COUNT(*) FROM tra_pelanggan_bpab_tagihan h
              WHERE h.kode_pelanggan = t.kode_pelanggan AND h.urutan = 1
                AND h.meteran_akhir > 0
                AND CONCAT(h.tahun, h.bulan) >= ? AND CONCAT(h.tahun, h.bulan) < ?
            ) AS n12
       FROM tra_pelanggan_bpab_tagihan t
       JOIN tra_pelanggan_bpab p ON p.kode_pelanggan = t.kode_pelanggan ${JOIN_ALAMAT}
       LEFT JOIN tra_pelanggan_bpab_tagihan pv
         ON pv.kode_pelanggan = t.kode_pelanggan
        AND pv.tahun = ? AND pv.bulan = ? AND pv.urutan = 1
      WHERE t.tahun = ? AND t.bulan = ? AND p.stat_aktif = 'Y'
      ORDER BY t.kode_pelanggan, t.urutan`,
    [kunciBawah, kunciSekarang, kunciBawah, kunciSekarang, sb.tahun, sb.bulan, tahun, bulan]
  );

  // Riwayat setahun terakhir untuk menghitung berapa bulan berturut-turut
  // pemakaiannya nol (meteran tidak bergerak). MariaDB 10.1 tidak punya window
  // function, jadi urutannya dihitung di sini.
  const riwayat = await query(
    `SELECT h.kode_pelanggan AS kode, h.pemakaian
       FROM tra_pelanggan_bpab_tagihan h
       JOIN tra_pelanggan_bpab p ON p.kode_pelanggan = h.kode_pelanggan
      WHERE h.urutan = 1 AND h.meteran_akhir > 0 AND p.stat_aktif = 'Y'
        AND CONCAT(h.tahun, h.bulan) >= ? AND CONCAT(h.tahun, h.bulan) < ?
      ORDER BY h.kode_pelanggan, h.tahun DESC, h.bulan DESC`,
    [kunciBawah, kunciSekarang]
  );
  // kode -> jumlah bulan nol berturut-turut, dihitung dari bulan terbaru.
  // Baris sudah urut terbaru->terlama per pelanggan; berhenti begitu ketemu
  // pemakaian bukan nol.
  const diamPerKode = new Map();
  const berhenti = new Set();
  for (const h of riwayat) {
    if (berhenti.has(h.kode)) continue;
    if ((Number(h.pemakaian) || 0) === 0) {
      diamPerKode.set(h.kode, (diamPerKode.get(h.kode) || 0) + 1);
    } else {
      berhenti.add(h.kode);
    }
  }
  const bulanDiam = (kode) => diamPerKode.get(kode) || 0;

  const minimal = await minimalPemakaian();
  let data = rows.map((r) => {
    const awal = Number(r.awal) || 0;
    const adaSebelum = r.akhir_sebelum !== null && r.akhir_sebelum !== undefined;
    const akhirSebelum = adaSebelum ? Number(r.akhir_sebelum) : null;
    return {
      kode: r.kode, nama: r.nama || '', rt: r.rt || '', alamat: r.alamat || '',
      urutan: Number(r.urutan) || 1,
      awal,
      akhir: Number(r.akhir) || 0,
      pemakaian: Number(r.pemakaian) || 0,
      tarif: Number(r.tarif) || 0,
      total: Number(r.total) || 0,
      terisi: Number(r.akhir) > 0,
      lunas: r.status_bayar === 'Y',
      flat: isFlat(r.jenis_langganan),
      ganti_meteran: r.ganti_meteran === 'Y',
      tanggal_input: r.tanggal_input || '',
      // Rantai meteran: awal periode ini seharusnya = akhir periode sebelumnya.
      // Kalau beda, biasanya karena ganti meteran yang belum ikut memperbarui
      // baris periode ini (lihat koreksiMeteranAwal).
      akhir_sebelum: akhirSebelum,
      rantai_putus: adaSebelum && awal !== akhirSebelum,
      // Bahan untuk tombol "isi otomatis": rata-rata pemakaian setahun terakhir.
      rata12: r.rata12 === null || r.rata12 === undefined ? null : Math.round(Number(r.rata12)),
      n12: Number(r.n12) || 0,
      // Berapa bulan terakhir berturut-turut pemakaiannya nol (meteran tidak
      // bergerak) — bisa berarti meteran macet, rumah kosong, atau tidak dibaca.
      bulan_diam: bulanDiam(r.kode),
    };
  });

  if (hanyaKosong) data = data.filter((d) => !d.terisi && !d.flat);

  const bisaDiisi = data.filter((d) => !d.flat);
  return {
    periode: { tahun, bulan, label: labelBulan(bulan, tahun) },
    minimal, izin_tulis: IZIN_TULIS,
    batas_diam: BATAS_DIAM,
    ringkasan: {
      total: bisaDiisi.length,
      terisi: bisaDiisi.filter((d) => d.terisi).length,
      kosong: bisaDiisi.filter((d) => !d.terisi).length,
      flat: data.filter((d) => d.flat).length,
      rantai_putus: bisaDiisi.filter((d) => d.rantai_putus && !d.lunas).length,
      diam: bisaDiisi.filter((d) => d.bulan_diam >= BATAS_DIAM).length,
    },
    rows: data,
  };
}

// ---------- Simpan satu meteran ----------
// simulasi=true -> hitung & tampilkan SQL saja, tidak menulis apa pun.
export async function simpanMeteran({ kode, tahun, bulan, urutan = 1, akhir, simulasi = false, izinkanUbah = false }) {
  const nilaiAkhir = Number(akhir);
  if (!kode || !tahun || !bulan) throw new Error('kode, tahun, dan bulan wajib diisi.');
  if (!Number.isFinite(nilaiAkhir)) throw new Error('Angka meteran tidak valid.');
  if (nilaiAkhir < 0) throw new Error('Angka meteran tidak boleh negatif.');
  if (!Number.isInteger(nilaiAkhir)) throw new Error('Angka meteran harus bilangan bulat.');

  const rows = await query(
    `SELECT t.meteran_awal AS awal, t.meteran_akhir AS akhir, t.tarif,
            t.status_bayar, p.keterangan AS nama, p.jenis_langganan
       FROM tra_pelanggan_bpab_tagihan t
       JOIN tra_pelanggan_bpab p ON p.kode_pelanggan = t.kode_pelanggan
      WHERE t.kode_pelanggan = ? AND t.tahun = ? AND t.bulan = ? AND t.urutan = ?
      LIMIT 1`,
    [kode, tahun, bulan, urutan]
  );
  if (rows.length === 0) {
    throw new Error(`Baris tagihan ${labelBulan(bulan, tahun)} untuk ${kode} tidak ada. ` +
      'Periode ini belum dibuka di aplikasi lama — web ini tidak membuat baris baru.');
  }
  const r = rows[0];

  if (isFlat(r.jenis_langganan)) {
    throw new Error(`${r.nama} berlangganan tarif flat (Rp ${Number(r.tarif).toLocaleString('id-ID')}/bulan) — ` +
      'meterannya tidak dibaca, jadi tidak bisa diisi dari sini.');
  }
  if (r.status_bayar === 'Y') {
    throw new Error(`Tagihan ${labelBulan(bulan, tahun)} untuk ${r.nama} sudah LUNAS — ` +
      'tidak boleh diubah dari web ini. Perbaiki di aplikasi lama bila perlu.');
  }
  const awal = Number(r.awal) || 0;
  if (nilaiAkhir < awal) {
    throw new Error(`Angka meteran (${nilaiAkhir}) lebih kecil dari meteran awal (${awal}). ` +
      'Kalau meterannya baru diganti, pakai tombol "Koreksi meteran awal" pada baris ini dulu.');
  }
  const sudahTerisi = Number(r.akhir) > 0;
  if (sudahTerisi && !izinkanUbah) {
    throw new Error(`Meteran ${labelBulan(bulan, tahun)} untuk ${r.nama} sudah diisi (${r.akhir}). ` +
      'Centang "izinkan ubah" bila memang mau dikoreksi.');
  }

  const minimal = await minimalPemakaian();
  const { pemakaian, total } = hitung({ awal, akhir: nilaiAkhir, tarif: r.tarif, minimal });

  const sql =
    `UPDATE tra_pelanggan_bpab_tagihan
        SET meteran_akhir = ?, pemakaian = ?, total_tagihan = ?, user_input = ?, tanggal_input = NOW()
      WHERE kode_pelanggan = ? AND tahun = ? AND bulan = ? AND urutan = ? AND meteran_awal = ?`;
  const params = [nilaiAkhir, pemakaian, total, USER_INPUT, kode, tahun, bulan, urutan, awal];

  const hasil = {
    kode, nama: r.nama, periode: labelBulan(bulan, tahun),
    awal, akhir: nilaiAkhir, pemakaian, tarif: Number(r.tarif), total,
    minimal, kena_minimal: pemakaian < minimal,
    sebelumnya: sudahTerisi ? { akhir: Number(r.akhir) } : null,
    sql: sql.replace(/\s+/g, ' ').trim(), params,
  };

  if (simulasi) return { ...hasil, ditulis: false, simulasi: true };
  if (!IZIN_TULIS) {
    return { ...hasil, ditulis: false, simulasi: true, catatan: 'IZINKAN_TULIS_METERAN=false di .env — hanya simulasi.' };
  }

  // meteran_awal ikut di WHERE sebagai pengaman: kalau baris sudah berubah
  // oleh petugas lain, update tidak akan kena.
  const affected = await updateMeteran(sql, params);
  if (affected === 0) {
    throw new Error('Tidak ada baris yang berubah — kemungkinan data baru saja diubah orang lain. Muat ulang dulu.');
  }
  const lanjutan = await cekLanjutan({ kode, tahun, bulan, akhirBaru: nilaiAkhir });
  return { ...hasil, ditulis: true, simulasi: false, perlu_koreksi_lanjutan: lanjutan };
}

// ---------- Koreksi meteran AWAL (kasus ganti meteran) ----------
// Kasus nyata: meteran diganti di periode N, baris periode N+1 sudah dibuat
// lebih dulu memakai angka meteran LAMA, lalu tidak ikut diperbarui. Akibatnya
// pemakaian jadi minus dan tidak bisa diinput.
//
// Aturan ketat:
//  - hanya bila rantai memang putus (awal != akhir periode sebelumnya)
//  - hanya bila tagihan BELUM lunas
//  - nilai penggantinya TIDAK bebas: wajib = akhir periode sebelumnya
export async function koreksiMeteranAwal({ kode, tahun, bulan, urutan = 1, simulasi = false }) {
  if (!kode || !tahun || !bulan) throw new Error('kode, tahun, dan bulan wajib diisi.');
  const sb = prevMonth(tahun, bulan);

  const rows = await query(
    `SELECT t.meteran_awal AS awal, t.meteran_akhir AS akhir, t.tarif, t.status_bayar,
            p.keterangan AS nama, p.jenis_langganan,
            pv.meteran_akhir AS akhir_sebelum
       FROM tra_pelanggan_bpab_tagihan t
       JOIN tra_pelanggan_bpab p ON p.kode_pelanggan = t.kode_pelanggan
       LEFT JOIN tra_pelanggan_bpab_tagihan pv
         ON pv.kode_pelanggan = t.kode_pelanggan
        AND pv.tahun = ? AND pv.bulan = ? AND pv.urutan = 1
      WHERE t.kode_pelanggan = ? AND t.tahun = ? AND t.bulan = ? AND t.urutan = ?
      LIMIT 1`,
    [sb.tahun, sb.bulan, kode, tahun, bulan, urutan]
  );
  if (rows.length === 0) {
    throw new Error(`Baris tagihan ${labelBulan(bulan, tahun)} untuk ${kode} tidak ada.`);
  }
  const r = rows[0];

  if (isFlat(r.jenis_langganan)) {
    throw new Error(`${r.nama} bertarif flat — meterannya tidak dibaca.`);
  }
  if (r.status_bayar === 'Y') {
    throw new Error(`Tagihan ${labelBulan(bulan, tahun)} untuk ${r.nama} sudah LUNAS — ` +
      'tidak boleh dikoreksi dari web ini.');
  }
  if (r.akhir_sebelum === null || r.akhir_sebelum === undefined) {
    throw new Error(`Tidak ada baris ${labelBulan(sb.bulan, sb.tahun)} untuk ${r.nama}, ` +
      'jadi tidak ada acuan untuk mengoreksi meteran awal.');
  }

  const awalLama = Number(r.awal) || 0;
  const awalBaru = Number(r.akhir_sebelum);
  if (awalLama === awalBaru) {
    throw new Error(`Meteran awal ${r.nama} sudah benar (${awalBaru}) — tidak ada yang perlu dikoreksi.`);
  }

  // Hitung ulang bila meteran akhir sudah terisi
  const minimal = await minimalPemakaian();
  const akhir = Number(r.akhir) || 0;
  let pemakaian = 0;
  let total = 0;
  if (akhir > 0) {
    if (akhir < awalBaru) {
      throw new Error(`Meteran akhir yang sudah tercatat (${akhir}) lebih kecil dari ` +
        `meteran awal yang benar (${awalBaru}). Perbaiki angka akhirnya dulu.`);
    }
    ({ pemakaian, total } = hitung({ awal: awalBaru, akhir, tarif: r.tarif, minimal }));
  }

  const sql =
    `UPDATE tra_pelanggan_bpab_tagihan
        SET meteran_awal = ?, pemakaian = ?, total_tagihan = ?, user_input = ?, tanggal_input = NOW()
      WHERE kode_pelanggan = ? AND tahun = ? AND bulan = ? AND urutan = ?
        AND status_bayar = 'N' AND meteran_awal = ?`;
  const params = [awalBaru, pemakaian, total, USER_INPUT, kode, tahun, bulan, urutan, awalLama];

  const hasil = {
    kode, nama: r.nama, periode: labelBulan(bulan, tahun),
    periode_sebelum: labelBulan(sb.bulan, sb.tahun),
    awal_lama: awalLama, awal_baru: awalBaru,
    akhir, pemakaian, total, ada_akhir: akhir > 0,
    sql: sql.replace(/\s+/g, ' ').trim(), params,
  };

  if (simulasi || !IZIN_TULIS) {
    return { ...hasil, ditulis: false, simulasi: true };
  }

  const affected = await updateMeteranAwal(sql, params);
  if (affected === 0) {
    throw new Error('Tidak ada baris yang berubah — data mungkin baru diubah orang lain. Muat ulang dulu.');
  }
  // Kalau akhirnya sudah terisi, periode berikutnya juga bisa ikut tidak nyambung.
  const lanjutan = akhir > 0
    ? await cekLanjutan({ kode, tahun, bulan, akhirBaru: akhir })
    : null;
  return { ...hasil, ditulis: true, simulasi: false, perlu_koreksi_lanjutan: lanjutan };
}
