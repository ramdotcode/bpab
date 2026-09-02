'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { apiGet } from '@/hooks/useApi';
import GrafikPemakaian from '@/components/GrafikPemakaian';
import {
  PageHeader, Panel, Table, Th, Td, Tr, EmptyState, StatCard,
  Input, Select, Field, Button, Badge, Spinner,
} from '@/components/ui';
import { angka, rupiah, tanggal, BULAN } from '@/lib/format';

const RENTANG = [
  { id: '12', label: '12 bulan terakhir' },
  { id: '24', label: '24 bulan terakhir' },
  { id: 'all', label: 'Semua periode' },
];

export default function HalamanPemakaian() {
  return (
    <Suspense fallback={<div className="p-7 text-dim"><Spinner className="mr-2 align-middle" />Memuat...</div>}>
      <IsiPemakaian />
    </Suspense>
  );
}

function IsiPemakaian() {
  const router = useRouter();
  const sp = useSearchParams();
  const kodeUrl = sp.get('kode') || '';

  const [cari, setCari] = useState('');
  const [hasil, setHasil] = useState([]);
  const [mencari, setMencari] = useState(false);
  const [detail, setDetail] = useState(null);
  const [memuat, setMemuat] = useState(Boolean(kodeUrl));
  const [galat, setGalat] = useState(null);
  const [rentang, setRentang] = useState('12');

  // ---- pencarian pelanggan ----
  useEffect(() => {
    const q = cari.trim();
    if (q.length < 2) { setHasil([]); return; }
    const t = setTimeout(async () => {
      setMencari(true);
      try {
        const j = await apiGet('/api/pelanggan?q=' + encodeURIComponent(q));
        setHasil(j.pelanggan.slice(0, 8));
      } catch { setHasil([]); }
      finally { setMencari(false); }
    }, 280);
    return () => clearTimeout(t);
  }, [cari]);

  // ---- muat detail pelanggan terpilih ----
  useEffect(() => {
    if (!kodeUrl) { setDetail(null); return; }
    (async () => {
      setMemuat(true);
      setGalat(null);
      try {
        setDetail((await apiGet(`/api/pelanggan/${encodeURIComponent(kodeUrl)}`)).detail);
        setCari('');
        setHasil([]);
      } catch (e) {
        setGalat(e.message);
        setDetail(null);
      } finally {
        setMemuat(false);
      }
    })();
  }, [kodeUrl]);

  const pilih = (kode) => router.push(`/pemakaian?kode=${encodeURIComponent(kode)}`);

  // ---- susun data untuk grafik & tabel (urut lama -> baru) ----
  const { baris, dataGrafik, ringkas } = useMemo(() => {
    if (!detail) return { baris: [], dataGrafik: [], ringkas: null };

    // hanya periode yang meterannya sudah dibaca
    const sudahDibaca = [...detail.tagihan]
      .filter((t) => t.akhir !== null && t.akhir !== undefined)
      .reverse();

    const dipotong = rentang === 'all' ? sudahDibaca : sudahDibaca.slice(-Number(rentang));

    const rows = dipotong.map((t, i, arr) => {
      const pemakaian = Number(t.pemakaian) || 0;
      const sebelum = i > 0 ? (Number(arr[i - 1].pemakaian) || 0) : null;
      return {
        ...t,
        kunci: `${t.tahun}${t.bulan}`,
        pemakaian,
        selisih: sebelum === null ? null : pemakaian - sebelum,
        labelPendek: `${BULAN[Number(t.bulan)].slice(0, 3)} ${String(t.tahun).slice(2)}`,
        label: t.periode,
        meter: `Meteran ${angka(t.awal) || 0} → ${angka(t.akhir) || 0}`,
        tagihanTeks: t.total ? `Tagihan ${rupiah(t.total)}` : 'Belum ditagih',
      };
    });

    const pakai = rows.map((r) => r.pemakaian);
    const stat = pakai.length ? {
      rata: Math.round(pakai.reduce((a, b) => a + b, 0) / pakai.length),
      maks: Math.max(...pakai),
      min: Math.min(...pakai),
      total: pakai.reduce((a, b) => a + b, 0),
      totalTagihan: rows.reduce((s, r) => s + (Number(r.total) || 0), 0),
      periode: pakai.length,
      tertinggi: rows.find((r) => r.pemakaian === Math.max(...pakai))?.periode,
    } : null;

    return { baris: rows, dataGrafik: rows, ringkas: stat };
  }, [detail, rentang]);

  const p = detail?.profil;

  return (
    <>
      <PageHeader
        title="Pemakaian per Bulan"
        desc={p ? `${p.nama} · ${p.kode} · ${p.alamat}` : 'Pilih pelanggan untuk melihat tren pemakaian airnya'}
      >
        {p && (
          <Link href={`/pelanggan/${p.kode}`}>
            <Button variant="outline">Kartu pelanggan →</Button>
          </Link>
        )}
      </PageHeader>

      {/* Pemilih pelanggan + rentang — satu baris di atas grafik */}
      <div className="flex flex-wrap items-end gap-3 border-b border-line bg-surface px-7 py-4">
        <Field label="Cari pelanggan" className="relative min-w-64 flex-1 max-w-md"
          hint="Ketik minimal 2 huruf — bisa ID, nama, atau alamat.">
          <Input type="search" value={cari} onChange={(e) => setCari(e.target.value)}
            placeholder="ID / nama / alamat..." autoComplete="off" />

          {(hasil.length > 0 || mencari) && (
            <div className="absolute top-full left-0 z-20 mt-1 w-full overflow-hidden rounded-xl border border-line bg-surface shadow-2xl">
              {mencari && <div className="px-3 py-2.5 text-xs text-dim"><Spinner className="mr-2 align-middle" />mencari...</div>}
              {hasil.map((h) => (
                <button key={h.kode} onClick={() => pilih(h.kode)}
                  className="block w-full cursor-pointer px-3 py-2.5 text-left transition-colors hover:bg-raised">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[0.7rem] text-dim">{h.kode}</span>
                    <span className="truncate text-sm font-semibold">{h.nama || 'Tanpa Nama'}</span>
                  </div>
                  <div className="truncate text-xs text-dim">{h.rt} · {h.alamat}</div>
                </button>
              ))}
            </div>
          )}
        </Field>

        <Field label="Rentang">
          <Select value={rentang} onChange={(e) => setRentang(e.target.value)} className="w-48">
            {RENTANG.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </Select>
        </Field>

        {ringkas && <Badge tone="primary" className="mb-2.5">{ringkas.periode} periode tercatat</Badge>}
      </div>

      <div className="flex-1 overflow-y-auto p-7">
        {galat && <Panel className="border-red/30 p-4"><p className="text-sm text-red">{galat}</p></Panel>}

        {memuat && <p className="text-sm text-dim"><Spinner className="mr-2 align-middle" />Memuat data pemakaian...</p>}

        {!memuat && !detail && !galat && (
          <Panel className="p-10 text-center">
            <h2 className="text-base font-semibold">Belum ada pelanggan dipilih</h2>
            <p className="mt-1.5 text-sm text-dim">
              Cari lewat kotak di atas — bisa pakai ID pelanggan, nama, atau alamat.
            </p>
          </Panel>
        )}

        {!memuat && detail && (
          <>
            {/* Ringkasan */}
            {ringkas && (
              <div className="mb-6 flex flex-wrap gap-4">
                <StatCard label="Rata-rata Pemakaian" value={`${ringkas.rata} m³`}
                  sub={`dari ${ringkas.periode} periode`} />
                <StatCard label="Tertinggi" value={`${ringkas.maks} m³`} tone="red"
                  sub={ringkas.tertinggi} />
                <StatCard label="Terendah" value={`${ringkas.min} m³`} tone="primary" />
                <StatCard label="Total Pemakaian" value={`${angka(ringkas.total)} m³`} tone="green"
                  sub={`tagihan ${rupiah(ringkas.totalTagihan)}`} />
              </div>
            )}

            {/* Grafik */}
            <Panel className="mb-6 p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">
                  Pemakaian air per bulan <span className="font-normal text-dim">(m³)</span>
                </h2>
                <span className="text-xs text-dim">Arahkan kursor ke batang untuk rinciannya</span>
              </div>
              <GrafikPemakaian data={dataGrafik} />
            </Panel>

            {/* Tabel rinci */}
            <Panel>
              <div className="border-b border-line px-5 py-3.5">
                <h2 className="text-sm font-semibold">Rincian per periode</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr>
                      <Th className="w-36">Periode</Th>
                      <Th className="w-24" align="right">Awal</Th>
                      <Th className="w-24" align="right">Akhir</Th>
                      <Th className="w-28" align="right">Pemakaian</Th>
                      <Th className="w-32" align="right">Naik / Turun</Th>
                      <Th className="w-32" align="right">Tagihan</Th>
                      <Th className="w-32">Status</Th>
                      <Th>Tgl Bayar</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {baris.length === 0 && (
                      <EmptyState colSpan={8} title="Belum ada periode yang meterannya tercatat" />
                    )}
                    {[...baris].reverse().map((t) => (
                      <Tr key={t.kunci}>
                        <Td className="font-semibold">{t.periode}</Td>
                        <Td align="right" className="font-mono text-xs">{angka(t.awal)}</Td>
                        <Td align="right" className="font-mono text-xs">{angka(t.akhir)}</Td>
                        <Td align="right" className="font-semibold">{t.pemakaian} m³</Td>
                        <Td align="right">
                          {t.selisih === null ? <span className="text-dim">—</span>
                            : t.selisih === 0 ? <span className="text-dim">sama</span>
                              : (
                                <span className={t.selisih > 0 ? 'text-amber' : 'text-primary'}>
                                  {t.selisih > 0 ? '▲' : '▼'} {Math.abs(t.selisih)} m³
                                </span>
                              )}
                        </Td>
                        <Td align="right">{t.total ? angka(t.total) : <span className="text-dim">—</span>}</Td>
                        <Td>
                          {t.lunas ? <Badge tone="green">Lunas</Badge>
                            : t.total > 0 ? <Badge tone="red">Belum bayar</Badge>
                              : <Badge>Belum ditagih</Badge>}
                        </Td>
                        <Td className="text-xs text-dim">{tanggal(t.tgl_bayar) || '—'}</Td>
                      </Tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          </>
        )}
      </div>
    </>
  );
}
