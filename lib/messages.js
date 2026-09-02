// Template pesan — port persis dari file HTML lama.
// Setiap "mode" punya: label, sumber data (endpoint API), dan cara membentuk pesan.

function greeting() {
  const jam = new Date().getHours();
  if (jam >= 4 && jam < 11) return 'Selamat Pagi';
  if (jam >= 11 && jam < 15) return 'Selamat Siang';
  if (jam >= 15 && jam < 18) return 'Selamat Sore';
  return 'Selamat Malam';
}

export const rupiah = (n) => (parseInt(n) || 0).toLocaleString('en-US');

// ---------- 1. FOTO METERAN (template editable dengan variabel) ----------
export const TEMPLATE_FOTO_METERAN =
`Kepada Pelanggan {id} Yth. {nama} dengan alamat {alamat}

Pencatatan Meteran Air Bulan ini dapat dilakukan secara mandiri mulai hari ini tanggal 25 s.d tanggal 30 dengan cara sbb:

* Memfoto meteran dengan jelas menggunakan handphone
* Pastikan meteran air terbaca jelas saat difoto
* Kirim foto meteran ke WA 0822-4535-7565 dengan melampirkan ID Pelanggan anda ({id})

Terima Kasih.

( Pesan ini dikirim otomatis oleh sistem informasi pelanggan PAB )`;

export function msgFotoMeteran(t, template) {
  return (template || TEMPLATE_FOTO_METERAN)
    .replace(/\{nama\}/gi, t.nama || 'Pelanggan')
    .replace(/\{id\}/gi, t.customId || 'ID_Pelanggan')
    .replace(/\{alamat\}/gi, t.alamat || 'Alamat_Pelanggan')
    .replace(/\{no_hp\}/gi, t.wa || 'Nomor_HP')
    .trim();
}

// ---------- 2. TAGIHAN DETAIL ----------
export function msgTagihanDetail(t) {
  let totalTagihan = 0, totalDeposit = 0;
  const groupByKode = {};
  t.items.forEach((it) => { (groupByKode[it.kode] ||= []).push(it); });

  let detailStr = '';
  for (const kode in groupByKode) {
    const houseItems = groupByKode[kode];
    detailStr += `Kode Pelanggan : ${kode}\nAlamat : ${houseItems[0].alamat}\n\n`;
    totalDeposit += parseInt(houseItems[0].deposit) || 0;
    houseItems.forEach((it) => {
      totalTagihan += parseInt(it.tagihan) || 0;
      let title = `> Tagihan Pemakaian Air ${String(it.bulan).toUpperCase()}`;
      if ((it.keterangan || '').toUpperCase().includes('GANTI METERAN')) {
        title = `> (Ganti Meteran Baru ${String(it.bulan).toUpperCase()})`;
      }
      detailStr += `${title}\n`;
      detailStr += `> Meteran : ${it.meterLalu} s.d ${it.meterKini}\n`;
      detailStr += `> Pemakaian : ${it.pemakaian}m3\n`;
      detailStr += `> Tagihan : Rp. ${rupiah(it.tagihan)},-\n\n`;
    });
  }
  const finalBill = totalTagihan - totalDeposit;

  return `${greeting()} Yth. ${t.nama} 🙏

Berikut tagihan pemakaian Air Artesis PAB RW 18 :

${detailStr.trim()}

Total Tagihan : Rp. ${rupiah(totalTagihan)},-
Deposit : Rp. ${rupiah(totalDeposit)},-
Sehingga Total yang harus dibayar : Rp. ${rupiah(finalBill)},-

Lakukan Pembayaran sebelum tanggal 20 setiap bulannya

Cara pembayaran :
1. Tunai/Cash melalui Channel Pembayaran Gasibu Park di Jalan Mendut Raya M-78 RT 01 (Rumah Bpk/Ibu Agung Murdowo). Setiap tanggal 2 (Dua) s/d 20 (Dua Puluh), Hari Senin-Jum\`at (Tanggal Merah Libur) Pk. 08.00-13.00

2. Transfer Bank :
- BCA No. 7495446000 a.n. RUDY T / ASEP R

Konfirmasi bukti transfer ke WA 0822-4535-7565 dengan melampirkan alamat rumah yang dibayarkan

Terima kasih 😊
- PAB RW 18

Cat :
- Apabila terdapat ketidaksesuaian data diatas, harap menghubungi no WA 0822-4535-7565
- Pesan ini dikirim otomatis oleh sistem informasi pelanggan PAB`;
}

// ---------- 3. TAGIHAN SINGKAT ----------
export function msgTagihanSingkat(t) {
  let totalTagihan = 0, totalDeposit = 0;
  const semuaBulan = [];
  const seen = new Set();
  t.items.forEach((it) => {
    totalTagihan += parseInt(it.tagihan) || 0;
    if (!seen.has(it.kode)) { totalDeposit += parseInt(it.deposit) || 0; seen.add(it.kode); }
    if (it.bulan && !(it.keterangan || '').toUpperCase().includes('GANTI METERAN')) {
      semuaBulan.push(String(it.bulan).toUpperCase());
    }
  });
  const finalBill = totalTagihan - totalDeposit;
  const b1 = semuaBulan[0] || '';
  const b2 = semuaBulan[semuaBulan.length - 1] || '';
  const periodeStr = b1 === b2 ? b1 : `${b1} - ${b2}`;

  return `${greeting()} Yth. ${t.nama} 🙏

Kami belum menerima bukti pembayaran tagihan air untuk periode ${periodeStr} senilai Rp. ${rupiah(finalBill)},-

Jika sudah transfer, mohon kirimkan bukti pembayarannya ke WA ini ya, agar kami bisa segera memproses konfirmasinya.

Terima kasih 😊
- PAB RW 18`;
}

// ---------- Konfigurasi mode ----------
export const MODES = {
  'foto-meteran': {
    label: '📸 Pengingat Foto Meteran',
    endpoint: '/api/targets/foto-meteran',
    editable: true,
    template: TEMPLATE_FOTO_METERAN,
    build: (t, tpl) => msgFotoMeteran(t, tpl),
    desc: 'Pelanggan yang belum input meteran pada periode berjalan.',
  },
  'tagihan-detail': {
    label: '💰 Pengingat Bayar (Detail)',
    endpoint: '/api/targets/tagihan',
    editable: false,
    build: (t) => msgTagihanDetail(t),
    desc: 'Pelanggan dengan tagihan belum lunas — rincian per bulan & meteran.',
  },
  'tagihan-singkat': {
    label: '⏳ Pengingat Bayar (Singkat)',
    endpoint: '/api/targets/tagihan',
    editable: false,
    build: (t) => msgTagihanSingkat(t),
    desc: 'Pengingat singkat total tunggakan untuk pelanggan belum bayar.',
  },
};
