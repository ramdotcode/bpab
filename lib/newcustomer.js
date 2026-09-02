// Tambah pelanggan baru: tra_rumah (bila perlu) -> tra_pelanggan_bpab -> baris
// tagihan periode berjalan. Ketiganya dalam satu transaksi.
//
// Aplikasi lama TIDAK punya fitur ini (user biasanya insert manual di database),
// jadi nilai kolom di sini diturunkan dari pola 156 data yang sudah ada:
//   kode_pelanggan_manual = kode_pelanggan   (156/156)
//   no_urut               = 3 digit terakhir (153/156)
//   nik                   = ''               (156/156)  <- NOT NULL, wajib diisi!
//   tarif / jenis         = 5000 / '1'       (155/156)
//   rumah.keterangan      = nama_penghuni    (156/156)
import { query, insertTransaksi, pratinjauInsert } from './db.js';
import { labelBulan, periodeDefault } from './targets.js';

const USER_INPUT = process.env.USER_INPUT_ID || '10';
const IZIN_TAMBAH = process.env.IZINKAN_TAMBAH_PELANGGAN !== 'false';

// PENTING: jangan ambil dari profile_rw — tabel itu memuat 3 RW aktif (07, 18, 21),
// sedangkan seluruh data BPAB ini memakai RW 18 (40534018). Salah id_rw = data
// nyantol dan tidak muncul di query mana pun. Jadi ambil dari data BPAB sendiri.
async function idRW() {
  const s = await query(`SELECT id_rw FROM ref_setting_bpab WHERE stat_aktif='Y' LIMIT 1`);
  if (s[0]?.id_rw) return s[0].id_rw;
  const p = await query(
    `SELECT id_rw, COUNT(*) AS n FROM tra_pelanggan_bpab
      GROUP BY id_rw ORDER BY n DESC LIMIT 1`
  );
  return p[0]?.id_rw;
}

// Datetime lokal 'YYYY-MM-DD HH:mm:ss' — hindari pergeseran timezone.
function sekarang() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ` +
         `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// ---------- Data pendukung form ----------
export async function dataForm() {
  const [rt, rumah, urutan, rw] = await Promise.all([
    query(`SELECT kode, nama_rt FROM ref_rt WHERE stat_aktif='Y' ORDER BY kode`),
    query(
      `SELECT r.kode, r.kode_rt, r.alamat_lengkap, r.nama_penghuni,
              p.kode_pelanggan AS dipakai_oleh, p.keterangan AS nama_pelanggan
         FROM tra_rumah r
         LEFT JOIN tra_pelanggan_bpab p
           ON p.id_rw = r.id_rw AND p.kode_rumah = r.kode AND p.stat_aktif = 'Y'
        WHERE r.stat_aktif = 'Y' ORDER BY r.kode_rt, r.kode`
    ),
    query(`SELECT MAX(CAST(RIGHT(kode_pelanggan,3) AS UNSIGNED)) AS maks FROM tra_pelanggan_bpab`),
    query(`SELECT nama_rw, kota FROM profile_rw WHERE stat_aktif='Y' LIMIT 1`),
  ]);
  const p = periodeDefault();
  return {
    rt, rumah,
    urutan_berikut: (Number(urutan[0]?.maks) || 0) + 1,
    periode: { ...p, label: labelBulan(p.bulan, p.tahun) },
    rw: rw[0] || null,
    izin_tambah: IZIN_TAMBAH,
  };
}

// kode_pelanggan = RT(2) + nomor rumah(2) + urutan(3)
export function susunKode({ kodeRt, kodeRumah, urutan }) {
  const rt = String(kodeRt || '').replace(/\D/g, '').slice(-2).padStart(2, '0');
  const noRumah = String(kodeRumah || '').replace(/\D/g, '');
  const rumah2 = noRumah.slice(-2).padStart(2, '0');
  const urut3 = String(urutan || '').replace(/\D/g, '').padStart(3, '0').slice(-3);
  return rt + rumah2 + urut3;
}

export async function saranKode({ kodeRt, kodeRumah }) {
  const r = await query(
    `SELECT MAX(CAST(RIGHT(kode_pelanggan,3) AS UNSIGNED)) AS maks FROM tra_pelanggan_bpab`
  );
  const urutan = (Number(r[0]?.maks) || 0) + 1;
  return { kode: susunKode({ kodeRt, kodeRumah, urutan }), urutan };
}

// ---------- Simpan ----------
export async function tambahPelanggan(input) {
  const {
    kodeRumah, rumahBaru = false, kodeRt, alamat, namaPenghuni,
    nama, noHp = '', nik = '', tarif = 5000, jenisLangganan = '1',
    jenisBangunan = 'R', tanggalDaftar,
    kodePelanggan, buatTagihan = true, tahun, bulan,
    simulasi = false,
  } = input || {};

  const bersih = (v) => String(v ?? '').trim();
  if (!bersih(nama)) throw new Error('Nama pelanggan wajib diisi.');
  if (!bersih(kodeRumah)) throw new Error('Kode rumah wajib diisi.');
  if (!bersih(kodeRt)) throw new Error('RT wajib dipilih.');
  const tarifNum = Number(tarif);
  if (!Number.isFinite(tarifNum) || tarifNum <= 0) throw new Error('Tarif tidak valid.');

  const rw = await idRW();
  if (!rw) throw new Error('id_rw tidak ditemukan di database.');

  const kodeRumahBersih = bersih(kodeRumah);
  const per = periodeDefault();
  const th = bersih(tahun) || per.tahun;
  const bl = (bersih(bulan) || per.bulan).padStart(2, '0');

  // ---- cek rumah ----
  const rumahAda = await query(
    `SELECT kode, kode_rt, alamat_lengkap FROM tra_rumah WHERE id_rw=? AND kode=? LIMIT 1`,
    [rw, kodeRumahBersih]
  );
  if (rumahBaru && rumahAda.length > 0) {
    throw new Error(`Kode rumah "${kodeRumahBersih}" sudah ada. Pilih rumah yang ada, atau pakai kode lain.`);
  }
  if (!rumahBaru && rumahAda.length === 0) {
    throw new Error(`Rumah "${kodeRumahBersih}" belum ada di data. Centang "buat rumah baru" bila ini rumah baru.`);
  }
  if (!rumahBaru) {
    const dipakai = await query(
      `SELECT kode_pelanggan, keterangan FROM tra_pelanggan_bpab
        WHERE id_rw=? AND kode_rumah=? AND stat_aktif='Y' LIMIT 1`,
      [rw, kodeRumahBersih]
    );
    if (dipakai.length > 0) {
      throw new Error(`Rumah ${kodeRumahBersih} masih dipakai pelanggan aktif ` +
        `${dipakai[0].keterangan} (${dipakai[0].kode_pelanggan}). Hentikan dulu yang lama di aplikasi lama.`);
    }
  }

  // ---- tentukan kode pelanggan ----
  let kode = bersih(kodePelanggan);
  if (!kode) kode = (await saranKode({ kodeRt, kodeRumah: kodeRumahBersih })).kode;
  if (!/^\d{5,15}$/.test(kode)) throw new Error(`Kode pelanggan "${kode}" tidak valid (harus angka).`);

  const bentrok = await query(
    `SELECT kode_pelanggan, keterangan FROM tra_pelanggan_bpab WHERE kode_pelanggan=? LIMIT 1`,
    [kode]
  );
  if (bentrok.length > 0) {
    throw new Error(`Kode pelanggan ${kode} sudah dipakai oleh ${bentrok[0].keterangan}.`);
  }

  if (buatTagihan) {
    const adaTagihan = await query(
      `SELECT 1 AS ada FROM tra_pelanggan_bpab_tagihan
        WHERE kode_pelanggan=? AND tahun=? AND bulan=? AND urutan=1 LIMIT 1`,
      [kode, th, bl]
    );
    if (adaTagihan.length > 0) {
      throw new Error(`Baris tagihan ${labelBulan(bl, th)} untuk ${kode} sudah ada.`);
    }
  }

  const noUrut = Number(kode.slice(-3)) || 0;
  const penghuni = bersih(namaPenghuni) || bersih(nama);
  const alamatFinal = bersih(alamat) || rumahAda[0]?.alamat_lengkap || '';
  const tglDaftar = bersih(tanggalDaftar) || sekarang().slice(0, 10); // tanggal lokal
  const jenis = bersih(jenisLangganan) || '1';

  // ---- susun daftar INSERT ----
  const daftar = [];
  if (rumahBaru) {
    daftar.push({
      tabel: 'tra_rumah',
      data: {
        id_rw: rw, kode: kodeRumahBersih,
        keterangan: penghuni, nama_penghuni: penghuni,
        kode_rt: bersih(kodeRt), alamat_lengkap: alamatFinal,
        telp_rumah: '', jenis_bangunan: bersih(jenisBangunan) || 'R',
        jumlah_penghuni: 0, stat_aktif: 'Y',
        user_input: USER_INPUT, tanggal_input: sekarang(),
      },
    });
  }
  daftar.push({
    tabel: 'tra_pelanggan_bpab',
    data: {
      id_rw: rw, kode_pelanggan: kode, kode_rumah: kodeRumahBersih,
      kode_pelanggan_manual: kode,   // WAJIB (NOT NULL tanpa default)
      no_urut: noUrut,
      nik: bersih(nik),              // WAJIB (NOT NULL tanpa default)
      no_hp: bersih(noHp), keterangan: bersih(nama),
      jenis_langganan: jenis,
      tanggal_daftar: tglDaftar, tarif: tarifNum, saldo_deposit: 0,
      stat_aktif: 'Y', user_input: USER_INPUT, tanggal_input: sekarang(),
    },
  });
  if (buatTagihan) {
    daftar.push({
      tabel: 'tra_pelanggan_bpab_tagihan',
      data: {
        kode_pelanggan: kode, tahun: th, bulan: bl, urutan: 1,
        meteran_awal: 0, meteran_akhir: 0, pemakaian: 0,
        tarif: tarifNum,
        // pelanggan tarif flat langsung bertagihan; lainnya 0 sampai meteran diisi
        total_tagihan: jenis === '2' ? tarifNum : 0,
        status_bayar: 'N', jenis_bayar: 'C', ganti_meteran: 'N', stat_aktif: 'Y',
        user_input: '', tanggal_input: null,
      },
    });
  }

  const ringkas = {
    kode_pelanggan: kode, nama: bersih(nama), kode_rumah: kodeRumahBersih,
    rumah_baru: Boolean(rumahBaru), kode_rt: bersih(kodeRt), alamat: alamatFinal,
    penghuni, no_hp: bersih(noHp), tarif: tarifNum, jenis_langganan: jenis,
    tanggal_daftar: tglDaftar, no_urut: noUrut,
    tagihan: buatTagihan ? { periode: labelBulan(bl, th), tahun: th, bulan: bl } : null,
    tabel_disentuh: daftar.map((d) => d.tabel),
  };

  if (simulasi || !IZIN_TAMBAH) {
    return {
      ...ringkas, ditulis: false, simulasi: true,
      pratinjau: pratinjauInsert(daftar),
      catatan: IZIN_TAMBAH ? undefined : 'IZINKAN_TAMBAH_PELANGGAN=false di .env — hanya simulasi.',
    };
  }

  const hasil = await insertTransaksi(daftar);
  return { ...ringkas, ditulis: true, simulasi: false, hasil };
}
