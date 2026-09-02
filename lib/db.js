// Modul database — READ ONLY.
// Semua query lewat helper query() yang menolak apa pun selain SELECT.
import mysql from 'mysql2/promise';

function buatPool() {
  const p = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 5,
  charset: 'utf8mb4',
  connectTimeout: 15000,
  // Koneksi ke DB lewat internet: kalau menganggur lama, jaringan/firewall bisa
  // memutusnya diam-diam sehingga pemakaian berikutnya kena "read ETIMEDOUT".
  // Keepalive menjaga koneksi tetap hidup; idleTimeout mendaur ulang yang basi.
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
  idleTimeout: 60000,
  maxIdle: 2,
  // Kolom DATE/DATETIME dikembalikan apa adanya sebagai string 'YYYY-MM-DD'.
  // Tanpa ini, driver membuat objek Date waktu lokal (WIB +7) sehingga tanggal
  // bisa mundur 1 hari saat diformat. Tanggal di DB tidak punya timezone.
  dateStrings: true,
  });

  // Koneksi yang terputus saat menganggur memancarkan event 'error'. Tanpa
  // penampung ini, Node menganggapnya fatal dan proses mati.
  p.on('error', (e) => {
    console.error('[db] koneksi bermasalah (akan dibuat ulang otomatis):', e?.code || e?.message);
  });
  return p;
}

// Di Next.js modul bisa dievaluasi ulang saat hot-reload; tanpa cache global,
// setiap reload membuat pool baru dan koneksi lama menumpuk.
const pool = globalThis.__bpabPool ?? (globalThis.__bpabPool = buatPool());

// Penjaga read-only: hanya izinkan 1 statement SELECT / SHOW / DESCRIBE.
function assertReadOnly(sql) {
  const clean = sql.trim().replace(/;+\s*$/, ''); // buang titik koma di akhir
  if (/;/.test(clean)) {
    throw new Error('Query ditolak: multi-statement tidak diizinkan (read-only).');
  }
  if (!/^\s*(select|show|describe|desc)\b/i.test(clean)) {
    throw new Error('Query ditolak: hanya SELECT yang diizinkan (mode read-only).');
  }
  return clean;
}

export async function query(sql, params = []) {
  const safe = assertReadOnly(sql);
  const [rows] = await pool.query(safe, params);
  return rows;
}

// ===================== JALUR TULIS (sangat dibatasi) =====================
// Satu-satunya operasi tulis yang diizinkan: mengisi meteran pada tabel tagihan.
// Kolom pembayaran, deposit, kwitansi, dan status mustahil tersentuh dari sini.
const TULIS_TABEL = 'tra_pelanggan_bpab_tagihan';
const TULIS_KOLOM = ['meteran_akhir', 'pemakaian', 'total_tagihan', 'user_input', 'tanggal_input'];
const TULIS_WAJIB_WHERE = ['kode_pelanggan', 'tahun', 'bulan', 'urutan'];

function assertUpdateMeteran(sql) {
  const clean = sql.trim().replace(/;+\s*$/, '');
  if (/;/.test(clean)) {
    throw new Error('Query ditolak: multi-statement tidak diizinkan.');
  }
  if (!new RegExp(`^update\\s+\`?${TULIS_TABEL}\`?\\s+set\\b`, 'i').test(clean)) {
    throw new Error(`Query ditolak: hanya UPDATE ${TULIS_TABEL} yang diizinkan.`);
  }
  const m = /\bset\b(.*?)\bwhere\b(.*)$/is.exec(clean);
  if (!m) throw new Error('Query ditolak: UPDATE wajib memakai WHERE.');
  const [, bagianSet, bagianWhere] = m;

  const kolom = [...bagianSet.matchAll(/([a-z_]+)\s*=/gi)].map((x) => x[1].toLowerCase());
  const terlarang = kolom.filter((k) => !TULIS_KOLOM.includes(k));
  if (terlarang.length) {
    throw new Error('Query ditolak: kolom tidak diizinkan diubah: ' + terlarang.join(', '));
  }
  for (const k of TULIS_WAJIB_WHERE) {
    if (!new RegExp(`\\b${k}\\s*=`, 'i').test(bagianWhere)) {
      throw new Error(`Query ditolak: WHERE wajib memuat ${k}.`);
    }
  }
  return clean;
}

// Mengembalikan jumlah baris yang benar-benar berubah.
export async function updateMeteran(sql, params = []) {
  const safe = assertUpdateMeteran(sql);
  const [hasil] = await pool.query(safe, params);
  return hasil.affectedRows;
}

// ---------- Koreksi meteran AWAL (kasus ganti meteran) ----------
// Jalur terpisah karena mengubah meteran_awal lebih sensitif: ia menggeser
// dasar perhitungan pemakaian. Syaratnya lebih ketat — WHERE wajib memuat
// status_bayar supaya baris yang sudah lunas mustahil tersentuh.
const TULIS_KOLOM_AWAL = ['meteran_awal', 'pemakaian', 'total_tagihan', 'user_input', 'tanggal_input'];

function assertKoreksiAwal(sql) {
  const clean = sql.trim().replace(/;+\s*$/, '');
  if (/;/.test(clean)) throw new Error('Query ditolak: multi-statement tidak diizinkan.');
  if (!new RegExp(`^update\\s+\`?${TULIS_TABEL}\`?\\s+set\\b`, 'i').test(clean)) {
    throw new Error(`Query ditolak: hanya UPDATE ${TULIS_TABEL} yang diizinkan.`);
  }
  const m = /\bset\b(.*?)\bwhere\b(.*)$/is.exec(clean);
  if (!m) throw new Error('Query ditolak: UPDATE wajib memakai WHERE.');
  const [, bagianSet, bagianWhere] = m;

  const kolom = [...bagianSet.matchAll(/([a-z_]+)\s*=/gi)].map((x) => x[1].toLowerCase());
  const terlarang = kolom.filter((k) => !TULIS_KOLOM_AWAL.includes(k));
  if (terlarang.length) {
    throw new Error('Query ditolak: kolom tidak diizinkan diubah: ' + terlarang.join(', '));
  }
  for (const k of [...TULIS_WAJIB_WHERE, 'status_bayar']) {
    if (!new RegExp(`\\b${k}\\s*=`, 'i').test(bagianWhere)) {
      throw new Error(`Query ditolak: WHERE wajib memuat ${k}.`);
    }
  }
  return clean;
}

export async function updateMeteranAwal(sql, params = []) {
  const safe = assertKoreksiAwal(sql);
  const [hasil] = await pool.query(safe, params);
  return hasil.affectedRows;
}

// ---------- INSERT terkendali (untuk tambah pelanggan baru) ----------
// SQL dibangun di sini dari whitelist; pemanggil hanya mengirim objek data.
// Tabel/kolom di luar daftar ini mustahil tersentuh.
const INSERT_IZIN = {
  tra_rumah: ['id_rw', 'kode', 'keterangan', 'nama_penghuni', 'kode_rt', 'alamat_lengkap',
    'telp_rumah', 'jenis_bangunan', 'jumlah_penghuni', 'stat_aktif', 'user_input', 'tanggal_input'],
  tra_pelanggan_bpab: ['id_rw', 'kode_pelanggan', 'kode_rumah', 'kode_pelanggan_manual', 'no_urut',
    'nik', 'no_hp', 'keterangan', 'jenis_langganan', 'tanggal_daftar', 'tarif', 'saldo_deposit',
    'stat_aktif', 'user_input', 'tanggal_input'],
  tra_pelanggan_bpab_tagihan: ['kode_pelanggan', 'tahun', 'bulan', 'urutan', 'meteran_awal',
    'meteran_akhir', 'pemakaian', 'tarif', 'total_tagihan', 'status_bayar', 'jenis_bayar',
    'ganti_meteran', 'stat_aktif', 'user_input', 'tanggal_input'],
};

function bangunInsert(tabel, data) {
  const izin = INSERT_IZIN[tabel];
  if (!izin) throw new Error(`INSERT ditolak: tabel ${tabel} tidak diizinkan.`);
  const kolom = Object.keys(data);
  const terlarang = kolom.filter((k) => !izin.includes(k));
  if (terlarang.length) {
    throw new Error(`INSERT ditolak: kolom tidak diizinkan: ${terlarang.join(', ')}`);
  }
  if (kolom.length === 0) throw new Error('INSERT ditolak: tidak ada data.');
  const sql = `INSERT INTO \`${tabel}\` (${kolom.map((k) => `\`${k}\``).join(', ')}) ` +
    `VALUES (${kolom.map(() => '?').join(', ')})`;
  return { sql, params: kolom.map((k) => data[k]) };
}

// Simulasi: kembalikan SQL yang akan dijalankan, tanpa menulis.
export function pratinjauInsert(daftar) {
  return daftar.map(({ tabel, data }) => {
    const { sql, params } = bangunInsert(tabel, data);
    return { tabel, sql, params };
  });
}

// Jalankan beberapa INSERT dalam SATU transaksi (InnoDB) — kalau ada yang
// gagal, semuanya dibatalkan sehingga tidak ada data setengah jadi.
export async function insertTransaksi(daftar) {
  const siap = daftar.map(({ tabel, data }) => ({ tabel, ...bangunInsert(tabel, data) }));
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const hasil = [];
    for (const { tabel, sql, params } of siap) {
      const [r] = await conn.query(sql, params);
      hasil.push({ tabel, affectedRows: r.affectedRows });
    }
    await conn.commit();
    return hasil;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

// ---------- UPDATE no HP pelanggan ----------
// Jalur tulis sempit: satu-satunya kolom profil pelanggan yang boleh diubah
// dari aplikasi. SQL dibangun di sini — pemanggil hanya mengirim nilai, jadi
// kolom lain (tarif, deposit, status) mustahil tersentuh. tanggal_input sengaja
// tidak disentuh supaya jejak input awal pelanggan tetap utuh.
export async function updateNoHpPelanggan(kode, noHp) {
  if (!kode) throw new Error('UPDATE ditolak: kode pelanggan wajib ada.');
  const [hasil] = await pool.query(
    'UPDATE `tra_pelanggan_bpab` SET `no_hp` = ? WHERE `kode_pelanggan` = ?',
    [noHp, kode]
  );
  return hasil.affectedRows;
}

export async function ping() {
  const rows = await query('SELECT 1 AS ok');
  return rows[0]?.ok === 1;
}

export default pool;
