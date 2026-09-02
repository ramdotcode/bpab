// Halaman depan: ringkasan. Ini Server Component — datanya diambil langsung
// dari lib/ tanpa lewat HTTP, jadi tidak ada bolak-balik jaringan.
import Link from 'next/link';
import { listPelanggan } from '@/lib/customers';
import { daftarMeteran } from '@/lib/meter';
import { periodeDefault, labelBulan } from '@/lib/targets';
import { StatCard, Panel, ProgressBar, Badge, PageHeader } from '@/components/ui';
import { rupiah } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function Beranda() {
  const p = periodeDefault();
  const label = labelBulan(p.bulan, p.tahun);

  let pelanggan = [];
  let meteran = null;
  let galat = null;
  try {
    [pelanggan, meteran] = await Promise.all([
      listPelanggan({}),
      daftarMeteran({ tahun: p.tahun, bulan: p.bulan }),
    ]);
  } catch (e) {
    galat = e.message;
  }

  if (galat) {
    return (
      <>
        <PageHeader title="Beranda" desc={`Periode ${label}`} />
        <div className="p-7">
          <Panel className="border-red/30 p-6">
            <h2 className="mb-2 font-semibold text-red">Gagal terhubung ke database</h2>
            <p className="text-sm text-dim">{galat}</p>
            <p className="mt-3 text-sm text-dim">
              Periksa <code className="font-mono text-ink">.env.local</code> dan koneksi internet.
            </p>
          </Panel>
        </div>
      </>
    );
  }

  const nunggak = pelanggan.filter((x) => x.rp_tunggak > 0);
  const totalTunggak = nunggak.reduce((s, x) => s + x.rp_tunggak, 0);
  const tanpaHp = pelanggan.filter((x) => !x.no_hp).length;
  const R = meteran.ringkasan;
  const persen = R.total ? Math.round((R.terisi / R.total) * 100) : 0;

  return (
    <>
      <PageHeader title="Beranda" desc={`Ringkasan periode ${label}`} />

      <div className="flex-1 overflow-y-auto p-7">
        <div className="flex flex-wrap gap-4">
          <StatCard label="Pelanggan Aktif" value={pelanggan.length}
            sub={tanpaHp ? `${tanpaHp} tanpa no HP` : 'semua punya no HP'} />
          <StatCard label="Menunggak" value={nunggak.length} tone="red" sub={rupiah(totalTunggak)} />
          <StatCard label={`Meteran ${label}`} value={`${R.terisi}/${R.total}`} tone="green"
            sub={`${R.kosong} belum diisi`} />
          <StatCard label="Progres Pencatatan" value={`${persen}%`} tone="primary"
            sub={R.flat ? `${R.flat} tarif flat dilewati` : null} />
        </div>

        <Panel className="mt-6 p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">Pencatatan meteran {label}</h2>
            <Badge tone={persen === 100 ? 'green' : 'amber'}>{persen}% selesai</Badge>
          </div>
          <ProgressBar value={persen} />
          <p className="mt-3 text-sm text-dim">
            {R.kosong > 0
              ? <>Masih <b className="text-ink">{R.kosong}</b> pelanggan belum dicatat meterannya.</>
              : <>Semua meteran periode ini sudah dicatat.</>}
          </p>
        </Panel>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Tautan href="/meteran" judul="✍️ Input Meteran"
            desc={`Isi ${R.kosong} meteran yang belum dicatat`} />
          <Tautan href="/broadcast?mode=tagihan-singkat" judul="📤 Broadcast WA"
            desc="Kirim pengingat foto meteran atau tagihan" />
          <Tautan href="/pelanggan" judul="👥 Data Pelanggan"
            desc="Cari pelanggan & lihat riwayatnya" />
          <Tautan href="/laporan?tipe=meteran" judul="📊 Laporan"
            desc="Meteran, belum bayar, sudah bayar" />
        </div>

        {nunggak.length > 0 && (
          <Panel className="mt-6">
            <div className="border-b border-line px-5 py-3.5">
              <h2 className="text-sm font-semibold">Tunggakan terbesar</h2>
            </div>
            <div className="divide-y divide-line">
              {[...nunggak].sort((a, b) => b.rp_tunggak - a.rp_tunggak).slice(0, 5).map((x) => (
                <Link key={x.kode} href={`/pelanggan/${x.kode}`}
                  className="flex items-center justify-between gap-4 px-5 py-3 transition-colors hover:bg-raised">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{x.nama || 'Tanpa Nama'}</div>
                    <div className="truncate text-xs text-dim">{x.rt} · {x.alamat}</div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-sm font-bold text-red tnum">{rupiah(x.rp_tunggak)}</div>
                    <div className="text-xs text-dim">{x.n_tunggak} tagihan</div>
                  </div>
                </Link>
              ))}
            </div>
          </Panel>
        )}
      </div>
    </>
  );
}

function Tautan({ href, judul, desc }) {
  return (
    <Link href={href}
      className="rounded-xl border border-line bg-surface p-4 transition-colors hover:border-dim hover:bg-raised">
      <div className="text-sm font-semibold">{judul}</div>
      <div className="mt-1 text-xs leading-snug text-dim">{desc}</div>
    </Link>
  );
}
