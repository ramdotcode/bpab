'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { apiGet } from '@/hooks/useApi';
import { useToast } from '@/components/Toast';
import {
  PageHeader, Panel, Table, Th, Td, Tr, EmptyState,
  Input, Select, Field, Button, Badge, Spinner,
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
    ['Tgl Bayar', 'tgl_bayar', 'tanggal'], ['Pembayaran', 'pembayaran', 'rp'], ['Cara Bayar', 'cara', 'teks'],
  ],
};
// Kolom tempat baris TOTAL diletakkan
const KOLOM_TOTAL = { 'belum-bayar': 'total', 'sudah-bayar': 'pembayaran' };

const JENIS = [
  { id: 'meteran', label: '📋 Meteran' },
  { id: 'belum-bayar', label: '🔴 Belum Bayar' },
  { id: 'sudah-bayar', label: '🟢 Sudah Bayar' },
];

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

  const kolom = KOLOM[tipe];

  const tampil = (row, key, jenis) => {
    const v = row[key];
    if (v === null || v === undefined || v === '') return '';
    if (jenis === 'rp') return angka(v);
    if (jenis === 'tanggal') return tanggal(v);
    if (jenis === 'int') return String(v);
    return String(v);
  };

  const unduhExcel = async () => {
    if (!lap) return;
    try {
      const XLSX = await import('xlsx');
      const aoa = [[lap.judul], kolom.map(([l]) => l)];
      for (const row of lap.rows) {
        aoa.push(kolom.map(([, key, jenis]) => {
          const v = row[key];
          if (v === null || v === undefined || v === '') return '';
          return (jenis === 'rp' || jenis === 'int') ? Number(v) : v;
        }));
      }
      const totKey = KOLOM_TOTAL[tipe];
      if (totKey && lap.total !== undefined) {
        const i = kolom.findIndex(([, k]) => k === totKey);
        const baris = kolom.map(() => '');
        if (i > 0) baris[i - 1] = 'TOTAL';
        baris[i] = Number(lap.total);
        aoa.push(baris);
      }
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws['!cols'] = kolom.map(([l]) => ({ wch: Math.max(10, l.length + 4) }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Laporan');
      XLSX.writeFile(wb, `${lap.judul.replace(/[\\/:*?"<>|]/g, '-')}.xlsx`);
      toast('File Excel diunduh', 'ok');
    } catch (e) {
      toast('Gagal membuat Excel: ' + e.message, 'gagal');
    }
  };

  return (
    <>
      <PageHeader title={lap?.judul || 'Laporan'}
        desc={lap ? `${lap.rows.length} baris${lap.total !== undefined ? ` · Total ${rupiah(lap.total)}` : ''}` : 'Memuat...'}>
        <Button variant="green" onClick={unduhExcel} disabled={!lap || memuat}>⬇ Download Excel</Button>
      </PageHeader>

      <div className="flex flex-wrap items-end gap-3 border-b border-line bg-surface px-7 py-4">
        <Field label="Jenis Laporan">
          <div className="flex gap-1.5">
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
          hint="Meteran = bulan ini; pembayaran/tunggakan = bulan sebelumnya.">
          <Select value={bulan} onChange={(e) => setBulan(e.target.value)} className="w-36">
            {BULAN.slice(1).map((b, i) => (
              <option key={b} value={String(i + 1).padStart(2, '0')}>{b}</option>
            ))}
          </Select>
          <Input type="number" value={tahun} onChange={(e) => setTahun(e.target.value)} className="w-24" />
        </Field>

        {lap?.periode?.pemakaian && (
          <Badge tone="primary" className="mb-2.5">Pemakaian {lap.periode.pemakaian}</Badge>
        )}
      </div>

      <div className="flex flex-1 flex-col overflow-hidden p-7 pt-5">
        {galat && <Panel className="mb-4 border-red/30 p-4"><p className="text-sm text-red">{galat}</p></Panel>}

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

            {!memuat && lap?.rows.length === 0 && (
              <EmptyState colSpan={kolom.length} title="Tidak ada data untuk periode ini" />
            )}

            {!memuat && lap?.rows.map((row, i) => (
              <Tr key={`${row.kode}-${row.periode || ''}-${i}`}>
                {kolom.map(([label, key, jenis]) => (
                  <Td key={label} align={jenis === 'rp' || jenis === 'int' ? 'right' : 'left'}
                    className={key === 'nama' ? 'font-semibold' : key === 'kode' ? 'font-mono text-xs' : ''}>
                    {tampil(row, key, jenis)}
                  </Td>
                ))}
              </Tr>
            ))}

            {!memuat && lap && KOLOM_TOTAL[tipe] && lap.total !== undefined && lap.rows.length > 0 && (
              <tr className="bg-raised font-bold">
                {kolom.map(([label, key], idx) => {
                  const totKey = KOLOM_TOTAL[tipe];
                  const iTot = kolom.findIndex(([, k]) => k === totKey);
                  if (key === totKey) {
                    return <Td key={label} align="right" className="text-green">{angka(lap.total)}</Td>;
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
