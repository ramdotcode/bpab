'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Badge } from './ui';

const MENU = [
  {
    id: 'meteran', judul: '✍️ Input Meteran',
    item: [{ href: '/meteran', label: 'Isi Meteran Bulan Ini' }],
  },
  {
    id: 'broadcast', judul: '📤 Broadcast WhatsApp',
    item: [
      { href: '/broadcast?mode=foto-meteran', label: '📸 Foto Meteran', cocok: '/broadcast' },
      { href: '/broadcast?mode=tagihan-detail', label: '💰 Bayar (Detail)', cocok: '/broadcast' },
      { href: '/broadcast?mode=tagihan-singkat', label: '⏳ Bayar (Singkat)', cocok: '/broadcast' },
    ],
  },
  {
    id: 'pelanggan', judul: '👥 Data Pelanggan',
    item: [
      { href: '/pelanggan', label: 'Semua Pelanggan' },
      { href: '/pemakaian', label: '📈 Pemakaian per Bulan' },
      { href: '/pelanggan/baru', label: '➕ Tambah Pelanggan' },
    ],
  },
  {
    id: 'laporan', judul: '📊 Laporan',
    item: [
      { href: '/laporan?tipe=meteran', label: '📋 Meteran', cocok: '/laporan' },
      { href: '/laporan?tipe=belum-bayar', label: '🔴 Belum Bayar', cocok: '/laporan' },
      { href: '/laporan?tipe=sudah-bayar', label: '🟢 Sudah Bayar', cocok: '/laporan' },
      { href: '/laporan?tipe=pemasukan', label: '💵 Pemasukan', cocok: '/laporan' },
    ],
  },
];

function grupAktif(pathname) {
  if (pathname.startsWith('/meteran')) return 'meteran';
  if (pathname.startsWith('/broadcast')) return 'broadcast';
  if (pathname.startsWith('/pelanggan') || pathname.startsWith('/pemakaian')) return 'pelanggan';
  if (pathname.startsWith('/laporan')) return 'laporan';
  return null;
}

export default function Sidebar({ children }) {
  const pathname = usePathname();
  const [terbuka, setTerbuka] = useState(() => grupAktif(pathname));

  // Grup yang sesuai halaman aktif otomatis terbuka saat pindah halaman.
  useEffect(() => {
    const g = grupAktif(pathname);
    if (g) setTerbuka(g);
  }, [pathname]);

  // Halaman login berdiri sendiri, tanpa sidebar.
  if (pathname === '/login') return null;

  return (
    <aside className="flex w-[290px] shrink-0 flex-col gap-1 overflow-y-auto border-r border-line bg-surface p-5">
      <Link href="/" className="mb-5 flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-green to-emerald-400 shadow-lg shadow-green/25">
          <svg viewBox="0 0 24 24" className="size-5 fill-white">
            <path d="M12 2 2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
          </svg>
        </span>
        <span className="text-lg font-extrabold tracking-tight">
          BPAB <span className="text-green">RW 18</span>
        </span>
      </Link>

      <nav className="flex flex-col gap-2">
        {MENU.map((grup) => {
          const buka = terbuka === grup.id;
          return (
            <div key={grup.id} className="overflow-hidden rounded-xl border border-line bg-bg">
              <button
                onClick={() => setTerbuka(buka ? null : grup.id)}
                className={`flex w-full cursor-pointer items-center justify-between px-3.5 py-3
                  text-[0.72rem] font-bold uppercase tracking-wide transition-colors
                  hover:bg-raised ${buka ? 'text-green' : 'text-ink'}`}
              >
                <span>{grup.judul}</span>
                <svg viewBox="0 0 24 24"
                  className={`size-4 shrink-0 text-dim transition-transform duration-200 ${buka ? 'rotate-180' : ''}`}
                  fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>

              <div className={`grid transition-all duration-200 ${buka ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                <div className="overflow-hidden">
                  <div className="flex flex-col gap-1 px-2 pb-2.5">
                    {grup.item.map((it) => {
                      const aktif = it.cocok
                        ? pathname === it.cocok
                        : pathname === it.href;
                      return (
                        <Link
                          key={it.href}
                          href={it.href}
                          className={`flex items-center gap-2 rounded-lg px-3 py-2 text-[0.82rem] font-semibold transition-colors
                            ${aktif
                              ? 'bg-green/10 text-green'
                              : 'text-dim hover:bg-raised hover:text-ink'}`}
                        >
                          <span className={`size-1.5 shrink-0 rounded-full bg-current ${aktif ? '' : 'opacity-35'}`} />
                          {it.label}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </nav>

      {/* Bagian bawah khusus per halaman */}
      {children && <div className="mt-4 flex flex-col gap-4">{children}</div>}

      <div className="mt-auto flex flex-col gap-2 pt-5">
        <StatusDevice />
        <TombolKeluar />
      </div>
    </aside>
  );
}

// Indikator koneksi WhatsApp — klik untuk cek ulang.
function StatusDevice() {
  const [status, setStatus] = useState({ keadaan: 'belum', teks: 'Device belum dicek' });

  const cek = async () => {
    setStatus({ keadaan: 'cek', teks: 'Mengecek...' });
    try {
      const r = await fetch('/api/wa/status', { cache: 'no-store' });
      const j = await r.json();
      const d = j.data || {};
      if (j.ok && d.status === 'CONNECTED') {
        setStatus({ keadaan: 'ok', teks: d.nama ? `Terhubung: ${d.nama}` : 'Terhubung' });
      } else {
        setStatus({ keadaan: 'gagal', teks: 'Tidak terhubung' });
      }
    } catch {
      setStatus({ keadaan: 'gagal', teks: 'Error koneksi' });
    }
  };

  useEffect(() => { cek(); }, []);

  const warna = { ok: 'bg-green shadow-[0_0_8px] shadow-green', gagal: 'bg-red', cek: 'bg-amber', belum: 'bg-dim' };
  return (
    <button onClick={cek}
      className="flex w-full cursor-pointer items-center justify-between rounded-lg border border-line bg-bg px-3.5 py-2.5 text-left transition-colors hover:border-dim">
      <span className="text-xs font-semibold text-dim">{status.teks}</span>
      <span className={`size-2.5 shrink-0 rounded-full ${warna[status.keadaan]}`} />
    </button>
  );
}

// Hapus cookie sesi lalu kembali ke halaman login.
function TombolKeluar() {
  const [sibuk, setSibuk] = useState(false);
  const keluar = async () => {
    setSibuk(true);
    try { await fetch('/api/auth/logout', { method: 'POST' }); } catch {}
    window.location.replace('/login');
  };
  return (
    <button onClick={keluar} disabled={sibuk}
      className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-line px-3.5 py-2 text-xs font-semibold text-dim transition-colors hover:border-red/40 hover:bg-red/10 hover:text-red disabled:opacity-50">
      <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
      </svg>
      {sibuk ? 'Keluar...' : 'Keluar'}
    </button>
  );
}
