// Kartu detail pelanggan — Server Component, data diambil langsung dari lib.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { detailPelanggan } from '@/lib/customers';
import { StatCard, Panel, Badge, PageHeader, Button } from '@/components/ui';
import { rupiah, tanggal } from '@/lib/format';
import TabRiwayat from './TabRiwayat';
import EditNoHp from './EditNoHp';

export const dynamic = 'force-dynamic';

export default async function KartuPelanggan({ params }) {
  const { kode } = await params;
  const d = await detailPelanggan(kode);
  if (!d) notFound();

  const { profil: p, ringkasan: r } = d;

  return (
    <>
      <PageHeader title={p.nama || 'Tanpa Nama'} desc={`${p.rt} · ${p.alamat}`}>
        <Link href={`/pemakaian?kode=${p.kode}`}>
          <Button variant="primary">📈 Tren pemakaian</Button>
        </Link>
        <Link href="/pelanggan"><Button variant="outline">← Daftar pelanggan</Button></Link>
      </PageHeader>

      <div className="flex-1 overflow-y-auto">
        {/* Profil */}
        <div className="border-b border-line bg-surface px-7 py-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="font-mono">{p.kode}</Badge>
            <Badge tone={p.aktif ? 'green' : 'red'}>{p.aktif ? 'Aktif' : 'Tidak Aktif'}</Badge>
            {p.jenis_langganan && <Badge tone="primary">{p.jenis_langganan}</Badge>}
          </div>

          <dl className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
            <Info k="Alamat" v={p.alamat} />
            <Info k="Penghuni" v={p.penghuni} />
            <EditNoHp kode={p.kode} noHp={p.no_hp} />
            <Info k="Tarif" v={`${rupiah(p.tarif)}${p.jenis_langganan === 'Rumah Tangga' ? ' / m³' : ' / bulan'}`} />
            <Info k="Terdaftar Sejak" v={tanggal(p.tanggal_daftar)} />
            <Info k="Pembayaran Terakhir" v={tanggal(r.bayar_terakhir) || 'Belum pernah'} />
          </dl>
        </div>

        {/* Ringkasan angka */}
        <div className="flex flex-wrap gap-4 border-b border-line bg-surface px-7 py-5">
          <StatCard label={`Tunggakan (${r.n_tunggak} tagihan)`} value={rupiah(r.rp_tunggak)} tone="red" />
          <StatCard label="Total Sudah Dibayar" value={rupiah(r.total_dibayar)} tone="green" />
          <StatCard label="Saldo Deposit" value={rupiah(p.deposit)} tone="primary" />
          <StatCard label="Rata-rata Pemakaian" value={`${r.rata_pemakaian} m³`}
            sub={r.pemakaian_terakhir ? `terakhir ${r.pemakaian_terakhir} m³` : null} />
        </div>

        <TabRiwayat tagihan={d.tagihan} bayar={d.bayar} deposit={d.deposit} />
      </div>
    </>
  );
}

function Info({ k, v, mono, merah }) {
  return (
    <div>
      <dt className="text-[0.68rem] font-semibold uppercase tracking-wide text-dim">{k}</dt>
      <dd className={`mt-0.5 text-sm break-words ${mono ? 'font-mono' : ''} ${merah ? 'text-red' : ''}`}>
        {v || '—'}
      </dd>
    </div>
  );
}
