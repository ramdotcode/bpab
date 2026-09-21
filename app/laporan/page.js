'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { apiGet } from '@/hooks/useApi';
import { useToast } from '@/components/Toast';
import {
  PageHeader, Panel, Table, Th, Td, Tr, EmptyState,
  Input, Select, Field, Button, Badge, Spinner, StatCard,
} from '@/components/ui';
import { angka, rupiah, tanggal, BULAN } from '@/lib/format';

// Definisi kolom per jenis laporan — sekaligus dipakai untuk export Excel.
const KOLOM = {
  'meteran': [
    ['No', 'no', 'int'], ['Kode', 'kode', 'teks'], ['Nama Pelanggan', 'nama', 'teks'],
    ['RT', 'rt', 'teks'], ['Alamat Rumah', 'alamat', 'teks'],
    ['Awal', 'awal', 'int'], ['Akhir', 'akhir', 'int'], ['Catatan', 'catatan', 'teks'],
  ],
  'belum-bayar': [
    ['No', 'no', 'int'], ['Periode', 'periode', 'teks'], ['Kode', 'kode', 'teks'],
    ['Nama Pelanggan', 'nama', 'teks'], ['RT', 'rt', 'teks'], ['Alamat Rumah', 'alamat', 'teks'],
    ['Awal', 'awal', 'int'], ['Akhir', 'akhir', 'int'], ['Selisih', 'selisih', 'int'],
    ['Total', 'total', 'rp'],
  ],
  'sudah-bayar': [
    ['No', 'no', 'int'], ['Kode', 'kode', 'teks'], ['Nama Pelanggan', 'nama', 'teks'],
    ['RT', 'rt', 'teks'], ['Alamat Rumah', 'alamat', 'teks'],
    ['Awal', 'awal', 'int'], ['Akhir', 'akhir', 'int'], ['Pemakaian', 'pemakaian', 'int'],
    ['Tagihan', 'tagihan', 'rp'], ['Tgl Bayar', 'tgl_bayar', 'tanggal'], ['Pembayaran', 'pembayaran', 'rp'],
    ['Cara Bayar', 'cara', 'teks'], ['Status', 'status_label', 'status'], ['Keterangan', 'keterangan', 'teks'],
  ],
  'pemasukan': [
    ['No', 'no', 'int'], ['Tgl Bayar', 'tgl_bayar', 'tanggal'], ['Kode', 'kode', 'teks'],
    ['Nama Pelanggan', 'nama', 'teks'], ['RT', 'rt', 'teks'],
    ['Periode Tagihan', 'periode', 'teks'], ['Kategori', 'kategori_label', 'kategori'],
    ['Tagihan', 'total', 'rp'], ['Pembayaran', 'pembayaran', 'rp'],
    ['Cara Bayar', 'cara', 'teks'], ['Kwitansi', 'kwitansi', 'teks'],
  ],
  'bayar-tunggakan': [
    ['No', 'no', 'int'], ['Tgl Bayar', 'tgl_bayar', 'tanggal'], ['Kode', 'kode', 'teks'],
    ['Nama Pelanggan', 'nama', 'teks'], ['RT', 'rt', 'teks'], ['Alamat Rumah', 'alamat', 'teks'],
    ['Periode Tagihan', 'periode', 'teks'],
    ['Awal', 'awal', 'int'], ['Akhir', 'akhir', 'int'], ['Pemakaian', 'pemakaian', 'int'],
    ['Tagihan', 'total', 'rp'], ['Pembayaran', 'pembayaran', 'rp'],
    ['Cara Bayar', 'cara', 'teks'], ['Kwitansi', 'kwitansi', 'teks'],
  ],
};
// Kolom tempat baris TOTAL diletakkan
const KOLOM_TOTAL = {
  'belum-bayar': 'total', 'sudah-bayar': 'pembayaran', 'pemasukan': 'pembayaran', 'bayar-tunggakan': 'pembayaran',
};

const JENIS = [
  { id: 'meteran', label: '📋 Meteran' },
  { id: 'belum-bayar', label: '🔴 Belum Bayar' },
  { id: 'sudah-bayar', label: '🟢 Sudah Bayar' },
  { id: 'pemasukan', label: '💵 Pemasukan' },
  { id: 'bayar-tunggakan', label: '🟠 Bayar Tunggakan' },
];

const KATEGORI = [
  { id: 'semua', label: 'Semua' },
  { id: 'bulan-ini', label: 'Bulan ini', tone: 'green' },
  { id: 'tunggakan', label: 'Tunggakan', tone: 'amber' },
  { id: 'di-muka', label: 'Di muka', tone: 'primary' },
];
// Titik pemisah ribuan dipaksa lewat format (tidak tergantung setelan bahasa Excel):
// 60000 -> 60.000, 1234567 -> 1.234.567.
const FORMAT_RUPIAH = '[>=1000000]#"."###"."###;[>=1000]#"."###;0';

const TONE_KATEGORI = Object.fromEntries(KATEGORI.map((k) => [k.id, k.tone || 'netral']));

// Status pembayaran di laporan Sudah Bayar (urutan = urutan ringkasan).
const STATUS = [
  { id: 'tepat-waktu', label: 'Tepat waktu', tone: 'green' },
  { id: 'terlambat', label: 'Terlambat', tone: 'amber' },
  { id: 'belum', label: 'Belum bayar', tone: 'red' },
  { id: 'lebih-awal', label: 'Lebih awal', tone: 'primary' },
  { id: 'lain', label: 'Lunas, tgl kosong', tone: 'netral' },
];
const TONE_STATUS = Object.fromEntries(STATUS.map((s) => [s.id, s.tone]));

const HINT_BULAN = {
  'pemasukan': 'Uang yang diterima (tanggal bayar) dalam bulan ini, apa pun periode tagihannya.',
  'bayar-tunggakan': 'Dibayar bulan ini untuk tagihan bulan-bulan lama — yang tidak masuk laporan Sudah Bayar.',
  'sudah-bayar': 'Tagihan pemakaian bulan lalu. TOTAL hanya yang bayar tepat waktu (dibayar di bulan ini).',
  'default': 'Meteran = bulan ini; pembayaran/tunggakan = bulan sebelumnya.',
};

export default function HalamanLaporan() {
  return (
    <Suspense fallback={<div className="p-7 text-dim"><Spinner className="mr-2 align-middle" />Memuat...</div>}>
      <IsiLaporan />
    </Suspense>
  );
}

function IsiLaporan() {
  const router = useRouter();
  const sp = useSearchParams();
  const { toast, Toaster } = useToast();

  const tipe = KOLOM[sp.get('tipe')] ? sp.get('tipe') : 'meteran';
  const [tahun, setTahun] = useState('');
  const [bulan, setBulan] = useState('');
  const [lap, setLap] = useState(null);
  const [memuat, setMemuat] = useState(true);
  const [galat, setGalat] = useState(null);
  const [kategori, setKategori] = useState('semua');

  useEffect(() => {
    apiGet('/api/periode')
      .then((p) => { setTahun(p.tahun); setBulan(p.bulan); })
      .catch((e) => { setGalat(e.message); setMemuat(false); });
  }, []);

  useEffect(() => {
    if (!tahun || !bulan) return;
    (async () => {
      setMemuat(true);
      setGalat(null);
      try {
        setLap((await apiGet(`/api/laporan/${tipe}?tahun=${tahun}&bulan=${bulan}`)).laporan);
      } catch (e) {
        setGalat(e.message);
      } finally {
        setMemuat(false);
      }
    })();
  }, [tipe, tahun, bulan]);

  // Filter kategori hanya berlaku di laporan pemasukan; nomor urut disusun ulang.
  const baris = useMemo(() => {
    if (!lap) return [];
    if (tipe !== 'pemasukan' || kategori === 'semua') return lap.rows;
    return lap.rows.filter((r) => r.kategori === kategori).map((r, i) => ({ ...r, no: i + 1 }));
  }, [lap, tipe, kategori]);

  const kolom = KOLOM[tipe];
  const totKey = KOLOM_TOTAL[tipe];
  const total = useMemo(() => {
    if (!lap || !totKey) return undefined;
    if (tipe === 'pemasukan' && kategori !== 'semua') {
      return baris.reduce((s, r) => s + (Number(r[totKey]) || 0), 0);
    }
    return lap.total;
  }, [lap, baris, tipe, kategori, totKey]);

  const tampil = (row, key, jenis) => {
    const v = row[key];
    if (v === null || v === undefined || v === '') return '';
    if (jenis === 'rp') return angka(v);
    if (jenis === 'tanggal') return tanggal(v);
    if (jenis === 'kategori') return <Badge tone={TONE_KATEGORI[row.kategori]}>{v}</Badge>;
    if (jenis === 'status') return <Badge tone={TONE_STATUS[row.status]}>{v}</Badge>;
    return String(v);
  };

  const unduhExcel = async () => {
    if (!lap) return;
    try {
      const XLSX = await import('xlsx');
      const judul = tipe === 'pemasukan' && kategori !== 'semua'
        ? `${lap.judul} (${KATEGORI.find((k) => k.id === kategori)?.label})`
        : lap.judul;
      const aoa = [[judul], kolom.map(([l]) => l)];
      for (const row of baris) {
        aoa.push(kolom.map(([, key, jenis]) => {
          const v = row[key];
          if (v === null || v === undefined || v === '') return '';
          return (jenis === 'rp' || jenis === 'int') ? Number(v) : v;
        }));
      }
      if (totKey && total !== undefined) {
        const i = kolom.findIndex(([, k]) => k === totKey);
        const b = kolom.map(() => '');
        if (i > 0) b[i - 1] = 'TOTAL';
        b[i] = Number(total);
        aoa.push(b);
      }
      const barisRingkasan = aoa.length;   // blok ringkasan: kolom ke-5 (index 4) = Rupiah
      // Ringkasan pemasukan ikut ditulis di bawah tabel.
      if (tipe === 'pemasukan' && lap.ringkasan) {
        const R = lap.ringkasan;
        aoa.push([]);
        aoa.push(['RINGKASAN', '', '', 'Jumlah', 'Rupiah']);
        for (const k of KATEGORI.slice(1)) {
          aoa.push([k.label, '', '', R[k.id].n, R[k.id].rp]);
        }
        aoa.push(['Total pemasukan', '', '', lap.rows.length, R.total]);
      }
      // Sudah bayar: jumlah per status; TOTAL di atas hanya yang tepat waktu.
      if (tipe === 'sudah-bayar' && lap.ringkasan) {
        const R = lap.ringkasan;
        aoa.push([]);
        aoa.push(['RINGKASAN', '', '', 'Jumlah', 'Rupiah']);
        for (const s of STATUS) {
          if (R[s.id].n) aoa.push([s.id === 'belum' ? 'Belum bayar (sisa tagihan)' : s.label, '', '', R[s.id].n, R[s.id].rp]);
        }
      }
      // Bayar tunggakan: rincian per periode tagihan yang dilunasi.
      if (tipe === 'bayar-tunggakan' && lap.ringkasan) {
        const R = lap.ringkasan;
        aoa.push([]);
        aoa.push(['RINCIAN PER PERIODE TAGIHAN', '', '', 'Jumlah', 'Rupiah']);
        for (const p of R.perPeriode) aoa.push([p.periode, '', '', p.n, p.rp]);
        aoa.push([`Total (${R.pelanggan} pelanggan)`, '', '', R.tagihan, R.total]);
      }
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      // Format uang pakai titik ribuan, tetap berupa angka (bisa dijumlah di Excel).
      const formatUang = (r, c) => {
        const sel = ws[XLSX.utils.encode_cell({ r, c })];
        if (sel && sel.t === 'n') sel.z = FORMAT_RUPIAH;
      };
      const kolomUang = kolom.map(([, , jenis], c) => (jenis === 'rp' ? c : -1)).filter((c) => c >= 0);
      for (let r = 2; r < barisRingkasan; r++) kolomUang.forEach((c) => formatUang(r, c));
      for (let r = barisRingkasan; r < aoa.length; r++) formatUang(r, 4);
      ws['!cols'] = kolom.map(([l]) => ({ wch: Math.max(10, l.length + 4) }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Laporan');
      XLSX.writeFile(wb, `${judul.replace(/[\\/:*?"<>|]/g, '-')}.xlsx`);
      toast('File Excel diunduh', 'ok');
    } catch (e) {
      toast('Gagal membuat Excel: ' + e.message, 'gagal');
    }
  };

  const R = tipe === 'pemasukan' ? lap?.ringkasan : null;
  const T = tipe === 'bayar-tunggakan' ? lap?.ringkasan : null;
  const S = tipe === 'sudah-bayar' ? lap?.ringkasan : null;

  return (
    <>
      <PageHeader title={lap?.judul || 'Laporan'}
        desc={lap ? `${baris.length} baris${total !== undefined ? ` · Total ${rupiah(total)}` : ''}` : 'Memuat...'}>
        <Button variant="green" onClick={unduhExcel} disabled={!lap || memuat}>⬇ Download Excel</Button>
      </PageHeader>

      <div className="flex flex-wrap items-end gap-3 border-b border-line bg-surface px-7 py-4">
        <Field label="Jenis Laporan">
          <div className="flex flex-wrap gap-1.5">
            {JENIS.map((j) => (
              <Button key={j.id}
                variant={tipe === j.id ? 'primary' : 'outline'}
                className="px-3 py-2 text-xs"
                onClick={() => router.push(`/laporan?tipe=${j.id}`)}>
                {j.label}
              </Button>
            ))}
          </div>
        </Field>

        <Field label="Bulan Laporan" className="flex gap-2"
          hint={HINT_BULAN[tipe] || HINT_BULAN.default}>
          <Select value={bulan} onChange={(e) => setBulan(e.target.value)} className="w-36">
            {BULAN.slice(1).map((b, i) => (
              <option key={b} value={String(i + 1).padStart(2, '0')}>{b}</option>
            ))}
          </Select>
          <Input type="number" value={tahun} onChange={(e) => setTahun(e.target.value)} className="w-24" />
        </Field>

        {tipe === 'pemasukan' && (
          <Field label="Kategori">
            <div className="flex gap-1.5">
              {KATEGORI.map((k) => (
                <Button key={k.id}
                  variant={kategori === k.id ? 'primary' : 'outline'}
                  className="px-3 py-2 text-xs"
                  onClick={() => setKategori(k.id)}>
                  {k.label}
                </Button>
              ))}
            </div>
          </Field>
        )}

        {lap?.periode?.pemakaian && (
          <Badge tone="primary" className="mb-2.5">
            {tipe === 'pemasukan' ? 'Ditagih bulan ini: pemakaian '
              : tipe === 'bayar-tunggakan' ? 'Periode sebelum ' : 'Pemakaian '}{lap.periode.pemakaian}
          </Badge>
        )}
      </div>

      <div className="flex flex-1 flex-col overflow-hidden p-7 pt-5">
        {galat && <Panel className="mb-4 border-red/30 p-4"><p className="text-sm text-red">{galat}</p></Panel>}

        {R && !memuat && (
          <div className="mb-5 flex flex-wrap gap-4">
            <StatCard label="Total Pemasukan" value={rupiah(R.total)} tone="green"
              sub={`${lap.rows.length} pembayaran${R.denda ? ` · termasuk denda ${rupiah(R.denda)}` : ''}`} />
            <StatCard label="Untuk Bulan Ini" value={rupiah(R['bulan-ini'].rp)} tone="green"
              sub={`${R['bulan-ini'].n} tagihan periode ${lap.periode.pemakaian}`} />
            <StatCard label="Untuk Bulan Sebelumnya" value={rupiah(R['tunggakan'].rp)} tone="primary"
              sub={`${R['tunggakan'].n} tagihan tunggakan`} />
            {R['di-muka'].n > 0 && (
              <StatCard label="Dibayar Di Muka" value={rupiah(R['di-muka'].rp)} tone="dim"
                sub={`${R['di-muka'].n} tagihan belum jatuh tempo`} />
            )}
          </div>
        )}

        {S && !memuat && (
          <div className="mb-5 flex flex-wrap gap-4">
            <StatCard label="Bayar Tepat Waktu" value={rupiah(S['tepat-waktu'].rp)} tone="green"
              sub={`${S['tepat-waktu'].n} pelanggan · dibayar ${lap.periode.label}`} />
            <StatCard label="Bayar Terlambat" value={rupiah(S['terlambat'].rp)} tone="primary"
              sub={`${S['terlambat'].n} pelanggan · dibayar setelah ${lap.periode.label}`} />
            <StatCard label="Belum Bayar" value={rupiah(S['belum'].rp)} tone="red"
              sub={`${S['belum'].n} pelanggan`} />
            {S['lebih-awal'].n > 0 && (
              <StatCard label="Bayar Lebih Awal" value={rupiah(S['lebih-awal'].rp)} tone="dim"
                sub={`${S['lebih-awal'].n} pelanggan · dibayar sebelum ${lap.periode.label}`} />
            )}
          </div>
        )}

        {T && !memuat && (
          <div className="mb-5 flex flex-wrap gap-4">
            <StatCard label="Total Bayar Tunggakan" value={rupiah(T.total)} tone="green"
              sub={`${T.tagihan} tagihan · ${T.pelanggan} pelanggan${T.denda ? ` · termasuk denda ${rupiah(T.denda)}` : ''}`} />
            {T.perPeriode.map((p) => (
              <StatCard key={p.periode_kode} label={`Periode ${p.periode}`} value={rupiah(p.rp)} tone="primary"
                sub={`${p.n} tagihan`} />
            ))}
          </div>
        )}

        <Table>
          <thead>
            <tr>
              {kolom.map(([label, , jenis]) => (
                <Th key={label} align={jenis === 'rp' || jenis === 'int' ? 'right' : 'left'}>{label}</Th>
              ))}
            </tr>
          </thead>
          <tbody>
            {memuat && (
              <tr><td colSpan={kolom.length} className="px-6 py-16 text-center text-dim">
                <Spinner className="mr-2 align-middle" /> Memuat laporan...
              </td></tr>
            )}

            {!memuat && lap && baris.length === 0 && (
              <EmptyState colSpan={kolom.length} title="Tidak ada data untuk periode ini" />
            )}

            {!memuat && baris.map((row, i) => (
              <Tr key={`${row.kode}-${row.periode || ''}-${i}`}>
                {kolom.map(([label, key, jenis]) => (
                  <Td key={label} align={jenis === 'rp' || jenis === 'int' ? 'right' : 'left'}
                    className={key === 'nama' ? 'font-semibold' : key === 'kode' ? 'font-mono text-xs' : ''}>
                    {tampil(row, key, jenis)}
                  </Td>
                ))}
              </Tr>
            ))}

            {!memuat && lap && totKey && total !== undefined && baris.length > 0 && (
              <tr className="bg-raised font-bold">
                {kolom.map(([label, key], idx) => {
                  const iTot = kolom.findIndex(([, k]) => k === totKey);
                  if (key === totKey) {
                    return <Td key={label} align="right" className="text-green">{angka(total)}</Td>;
                  }
                  if (idx === iTot - 1) return <Td key={label} align="right">TOTAL</Td>;
                  return <Td key={label} />;
                })}
              </tr>
            )}
          </tbody>
        </Table>
      </div>

      <Toaster />
    </>
  );
}
