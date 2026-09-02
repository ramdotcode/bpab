'use client';
import { useState } from 'react';
import { Table, Th, Td, Tr, EmptyState, Badge } from '@/components/ui';
import { angka, tanggal } from '@/lib/format';

const TAB = [
  { id: 'tagihan', label: 'Riwayat Tagihan' },
  { id: 'bayar', label: 'Pembayaran' },
  { id: 'deposit', label: 'Mutasi Deposit' },
];

export default function TabRiwayat({ tagihan, bayar, deposit }) {
  const [aktif, setAktif] = useState('tagihan');
  const jumlah = { tagihan: tagihan.length, bayar: bayar.length, deposit: deposit.length };

  return (
    <>
      <div className="flex border-b border-line bg-surface px-7">
        {TAB.map((t) => (
          <button key={t.id} onClick={() => setAktif(t.id)}
            className={`cursor-pointer border-b-2 px-5 py-3.5 text-sm font-semibold transition-colors
              ${aktif === t.id
                ? 'border-green text-green'
                : 'border-transparent text-dim hover:text-ink'}`}>
            {t.label} ({jumlah[t.id]})
          </button>
        ))}
      </div>

      <div className="p-7">
        {aktif === 'tagihan' && <TabelTagihan rows={tagihan} />}
        {aktif === 'bayar' && <TabelBayar rows={bayar} />}
        {aktif === 'deposit' && <TabelDeposit rows={deposit} />}
      </div>
    </>
  );
}

function TabelTagihan({ rows }) {
  return (
    <Table className="flex-none">
      <thead>
        <tr>
          <Th className="w-36">Periode</Th>
          <Th className="w-24" align="right">Awal</Th>
          <Th className="w-24" align="right">Akhir</Th>
          <Th className="w-28" align="right">Pemakaian</Th>
          <Th className="w-32" align="right">Tagihan</Th>
          <Th className="w-32">Status</Th>
          <Th className="w-28">Tgl Bayar</Th>
          <Th className="w-32">Cara Bayar</Th>
          <Th>Kwitansi / Catatan</Th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 && <EmptyState colSpan={9} title="Belum ada riwayat tagihan" />}
        {rows.map((t) => (
          <Tr key={`${t.tahun}${t.bulan}`}>
            <Td className="font-semibold">{t.periode}</Td>
            <Td align="right" className="font-mono text-xs">{angka(t.awal)}</Td>
            <Td align="right" className="font-mono text-xs">{angka(t.akhir)}</Td>
            <Td align="right">{t.pemakaian ? `${t.pemakaian} m³` : ''}</Td>
            <Td align="right" className="font-semibold">{t.total ? angka(t.total) : ''}</Td>
            <Td>
              {t.lunas ? <Badge tone="green">Lunas</Badge>
                : t.total > 0 ? <Badge tone="red">Belum bayar</Badge>
                  : <Badge>Belum ditagih</Badge>}
            </Td>
            <Td className="text-xs text-dim">{tanggal(t.tgl_bayar)}</Td>
            <Td className="text-xs">{t.cara}</Td>
            <Td className="text-xs text-dim">
              <span className="font-mono">{t.kwitansi}</span>
              {t.keterangan && <div>{t.keterangan}</div>}
            </Td>
          </Tr>
        ))}
      </tbody>
    </Table>
  );
}

function TabelBayar({ rows }) {
  return (
    <Table className="flex-none">
      <thead>
        <tr>
          <Th className="w-28">Tanggal</Th>
          <Th className="w-32" align="right">Jumlah</Th>
          <Th className="w-36">Cara Bayar</Th>
          <Th className="w-24" align="right">Denda</Th>
          <Th className="w-44">No Kwitansi</Th>
          <Th>Penerima / Catatan</Th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 && <EmptyState colSpan={6} title="Belum ada riwayat pembayaran" />}
        {rows.map((b, i) => (
          <Tr key={`${b.tanggal}-${b.kwitansi}-${i}`}>
            <Td>{tanggal(b.tanggal)}</Td>
            <Td align="right" className="font-semibold text-green">{angka(b.jumlah)}</Td>
            <Td className="text-xs">
              {b.cara}
              {b.isi_deposit && <Badge tone="amber" className="ml-1.5">isi deposit</Badge>}
            </Td>
            <Td align="right" className={b.denda ? 'text-red' : 'text-dim'}>{angka(b.denda) || '0'}</Td>
            <Td className="font-mono text-[0.7rem] text-dim">{b.kwitansi}</Td>
            <Td className="text-xs">
              {b.penerima}
              {b.keterangan && <div className="text-dim">{b.keterangan}</div>}
            </Td>
          </Tr>
        ))}
      </tbody>
    </Table>
  );
}

function TabelDeposit({ rows }) {
  return (
    <Table className="flex-none">
      <thead>
        <tr>
          <Th className="w-28">Tanggal</Th>
          <Th className="w-32" align="right">Saldo Awal</Th>
          <Th className="w-28" align="right">Masuk</Th>
          <Th className="w-28" align="right">Keluar</Th>
          <Th className="w-32" align="right">Saldo Akhir</Th>
          <Th>Kwitansi / Catatan</Th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 && <EmptyState colSpan={6} title="Belum ada mutasi deposit" />}
        {rows.map((d, i) => (
          <Tr key={`${d.tanggal}-${i}`}>
            <Td>{tanggal(d.tanggal)}</Td>
            <Td align="right" className="text-dim">{angka(d.saldo_awal) || '0'}</Td>
            <Td align="right" className={d.masuk ? 'text-green' : 'text-dim'}>
              {d.masuk ? `+${angka(d.masuk)}` : '0'}
            </Td>
            <Td align="right" className={d.keluar ? 'text-red' : 'text-dim'}>
              {d.keluar ? `−${angka(d.keluar)}` : '0'}
            </Td>
            <Td align="right" className="font-semibold">{angka(d.saldo_akhir) || '0'}</Td>
            <Td className="text-xs text-dim">
              <span className="font-mono">{d.kwitansi}</span>
              {d.keterangan && <span> — {d.keterangan}</span>}
            </Td>
          </Tr>
        ))}
      </tbody>
    </Table>
  );
}
