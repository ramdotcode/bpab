'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { apiGet } from '@/hooks/useApi';
import {
  PageHeader, Table, Th, Td, Tr, EmptyState, Input, Select,
  Checkbox, Field, Badge, Button, Spinner, Panel,
} from '@/components/ui';
import { angka, rupiah, tanggal } from '@/lib/format';

export default function DaftarPelanggan() {
  const router = useRouter();
  const [rows, setRows] = useState([]);
  const [rt, setRt] = useState([]);
  const [memuat, setMemuat] = useState(true);
  const [galat, setGalat] = useState(null);

  const [cari, setCari] = useState('');
  const [filterRt, setFilterRt] = useState('');
  const [hanyaNunggak, setHanyaNunggak] = useState(false);

  useEffect(() => {
    apiGet('/api/rt').then((j) => setRt(j.rt)).catch(() => {});
  }, []);

  // Pencarian & filter dikerjakan di server (ikut memeriksa alamat).
  useEffect(() => {
    const t = setTimeout(async () => {
      setMemuat(true);
      setGalat(null);
      try {
        const p = new URLSearchParams();
        if (cari.trim()) p.set('q', cari.trim());
        if (filterRt) p.set('rt', filterRt);
        if (hanyaNunggak) p.set('nunggak', '1');
        const j = await apiGet('/api/pelanggan?' + p);
        setRows(j.pelanggan);
      } catch (e) {
        setGalat(e.message);
      } finally {
        setMemuat(false);
      }
    }, cari ? 300 : 0);
    return () => clearTimeout(t);
  }, [cari, filterRt, hanyaNunggak]);

  const ringkas = useMemo(() => ({
    nunggak: rows.filter((x) => x.rp_tunggak > 0).length,
    rpNunggak: rows.reduce((s, x) => s + x.rp_tunggak, 0),
    tanpaHp: rows.filter((x) => !x.no_hp).length,
  }), [rows]);

  return (
    <>
      <PageHeader title="Data Pelanggan" desc={`${rows.length} pelanggan aktif`}>
        <Button variant="green" onClick={() => router.push('/pelanggan/baru')}>➕ Tambah Pelanggan</Button>
      </PageHeader>

      <div className="flex flex-wrap items-end gap-3 border-b border-line bg-surface px-7 py-4">
        <Field label="Cari" className="min-w-56 flex-1 max-w-md">
          <Input type="search" value={cari} onChange={(e) => setCari(e.target.value)}
            placeholder="Nama, kode, no HP, atau alamat..." />
        </Field>
        <Field label="RT">
          <Select value={filterRt} onChange={(e) => setFilterRt(e.target.value)} className="w-36">
            <option value="">Semua RT</option>
            {rt.map((x) => <option key={x} value={x}>{x}</option>)}
          </Select>
        </Field>
        <div className="pb-2.5">
          <Checkbox label="Hanya penunggak" checked={hanyaNunggak}
            onChange={(e) => setHanyaNunggak(e.target.checked)} />
        </div>
        <div className="ml-auto flex flex-wrap gap-2 pb-2">
          <Badge tone="red">{ringkas.nunggak} menunggak · {rupiah(ringkas.rpNunggak)}</Badge>
          {ringkas.tanpaHp > 0 && <Badge tone="amber">{ringkas.tanpaHp} tanpa no HP</Badge>}
        </div>
      </div>

      <div className="flex flex-1 flex-col overflow-hidden p-7 pt-5">
        {galat && (
          <Panel className="mb-4 border-red/30 p-4"><p className="text-sm text-red">{galat}</p></Panel>
        )}

        <Table>
          <thead>
            <tr>
              <Th className="w-12">No</Th>
              <Th className="w-24">Kode</Th>
              <Th>Nama Pelanggan</Th>
              <Th className="w-20">RT</Th>
              <Th>Alamat</Th>
              <Th className="w-32">No HP</Th>
              <Th className="w-32" align="right">Tunggakan</Th>
              <Th className="w-24" align="right">Deposit</Th>
              <Th className="w-28">Bayar Terakhir</Th>
              <Th className="w-14">Tren</Th>
            </tr>
          </thead>
          <tbody>
            {memuat && (
              <tr><td colSpan={10} className="px-6 py-16 text-center text-dim">
                <Spinner className="mr-2 align-middle" /> Memuat...
              </td></tr>
            )}

            {!memuat && rows.length === 0 && (
              <EmptyState colSpan={10} title="Tidak ada hasil">
                Coba ubah kata pencarian atau filternya.
              </EmptyState>
            )}

            {!memuat && rows.map((p, i) => (
              <Tr key={p.kode} onClick={() => router.push(`/pelanggan/${p.kode}`)}>
                <Td className="text-dim tnum">{i + 1}</Td>
                <Td className="font-mono text-xs">{p.kode}</Td>
                <Td className="font-semibold">{p.nama || <i className="font-normal text-dim">Tanpa Nama</i>}</Td>
                <Td className="text-xs text-dim">{p.rt}</Td>
                <Td className="text-xs text-dim">{p.alamat}</Td>
                <Td className="font-mono text-xs">
                  {p.no_hp || <span className="text-red">—</span>}
                </Td>
                <Td align="right">
                  {p.rp_tunggak > 0 ? (
                    <>
                      <div className="font-semibold text-red">{angka(p.rp_tunggak)}</div>
                      <div className="text-[0.68rem] text-dim">{p.n_tunggak} bln</div>
                    </>
                  ) : <span className="text-green">Lunas</span>}
                </Td>
                <Td align="right" className={p.deposit > 0 ? 'text-primary' : 'text-dim'}>
                  {angka(p.deposit) || '0'}
                </Td>
                <Td className="text-xs text-dim">{tanggal(p.bayar_terakhir) || '—'}</Td>
                <Td>
                  <a
                    href={`/pemakaian?kode=${encodeURIComponent(p.kode)}`}
                    onClick={(e) => e.stopPropagation()}
                    title={`Lihat tren pemakaian ${p.nama}`}
                    className="rounded-md border border-line px-2 py-1.5 text-xs text-dim transition-colors hover:border-primary hover:text-primary"
                  >
                    📈
                  </a>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>

        <p className="mt-3 text-xs text-dim">Klik baris untuk melihat kartu &amp; riwayat pelanggan.</p>
      </div>
    </>
  );
}
