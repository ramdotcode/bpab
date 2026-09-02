'use client';
import { useEffect, useRef, useState } from 'react';

// Grafik batang pemakaian air per bulan.
// Satu seri -> satu warna untuk semua batang (bukan ramp per nilai).
// Warna #199e70 lolos validasi palet untuk surface gelap #1a1d27.
const WARNA = '#199e70';
const WARNA_HOVER = '#22c48b';
const SURFACE = '#1a1d27';

const TINGGI = 280;
const PAD = { atas: 26, kanan: 8, bawah: 42, kiri: 46 };

// Batas atas sumbu Y yang "bulat" supaya gridline mudah dibaca.
function batasAtas(maks) {
  if (maks <= 0) return 10;
  const langkah = maks <= 20 ? 5 : maks <= 60 ? 10 : maks <= 150 ? 25 : 50;
  return Math.ceil(maks / langkah) * langkah;
}

export default function GrafikPemakaian({ data, satuan = 'm³' }) {
  const wrapRef = useRef(null);
  const [lebar, setLebar] = useState(720);
  const [hover, setHover] = useState(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setLebar(Math.max(320, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (!data || data.length === 0) {
    return (
      <div ref={wrapRef} className="grid h-48 place-items-center text-sm text-dim">
        Belum ada data pemakaian yang tercatat.
      </div>
    );
  }

  const maks = Math.max(...data.map((d) => d.pemakaian), 0);
  const atas = batasAtas(maks);
  const plotW = lebar - PAD.kiri - PAD.kanan;
  const plotH = TINGGI - PAD.atas - PAD.bawah;

  const band = plotW / data.length;
  const lebarBatang = Math.min(24, Math.max(4, band - 2)); // sisa band = jarak antar batang
  const y = (v) => PAD.atas + plotH - (v / atas) * plotH;
  const xTengah = (i) => PAD.kiri + band * i + band / 2;

  // Gridline: 4 garis, resesif
  const garis = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(atas * f));

  // Label sumbu X dipilih supaya tidak bertumpuk. Dihitung dari kanan ke kiri
  // agar jaraknya selalu seragam DAN bulan terbaru selalu berlabel — kalau
  // dihitung dari kiri lalu bulan terakhir dipaksa tampil, keduanya bisa menempel.
  const lompat = Math.max(1, Math.ceil(data.length / Math.max(1, Math.floor(plotW / 62))));
  const labelTampil = new Set();
  for (let i = data.length - 1; i >= 0; i -= lompat) labelTampil.add(i);

  // Label langsung hanya di bulan tertinggi (selektif, bukan semua batang)
  const iMaks = data.reduce((best, d, i) => (d.pemakaian > data[best].pemakaian ? i : best), 0);

  const rataRata = data.reduce((s, d) => s + d.pemakaian, 0) / data.length;

  return (
    <div ref={wrapRef} className="relative w-full">
      <svg width={lebar} height={TINGGI} role="img"
        aria-label={`Grafik pemakaian air per bulan, ${data.length} periode, tertinggi ${maks} ${satuan}`}>
        {/* Gridline & label sumbu Y — resesif */}
        {garis.map((v) => (
          <g key={v}>
            <line x1={PAD.kiri} x2={lebar - PAD.kanan} y1={y(v)} y2={y(v)}
              stroke="#2d313f" strokeWidth="1" />
            <text x={PAD.kiri - 10} y={y(v) + 4} textAnchor="end"
              fill="#94a3b8" fontSize="10" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {v}
            </text>
          </g>
        ))}

        {/* Garis rata-rata — pembanding, bukan data utama */}
        {rataRata > 0 && (
          <>
            <line x1={PAD.kiri} x2={lebar - PAD.kanan} y1={y(rataRata)} y2={y(rataRata)}
              stroke="#94a3b8" strokeWidth="1" strokeDasharray="4 4" opacity="0.55" />
            <text x={lebar - PAD.kanan} y={y(rataRata) - 5} textAnchor="end"
              fill="#94a3b8" fontSize="9.5">
              rata-rata {rataRata.toFixed(1)}
            </text>
          </>
        )}

        {/* Batang */}
        {data.map((d, i) => {
          const tinggi = Math.max(0, (d.pemakaian / atas) * plotH);
          const xb = xTengah(i) - lebarBatang / 2;
          const aktif = hover === i;
          return (
            <g key={d.kunci}>
              {/* area sentuh lebih besar dari batang */}
              <rect x={PAD.kiri + band * i} y={PAD.atas} width={band} height={plotH}
                fill="transparent" style={{ cursor: 'pointer' }}
                onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)} />
              {tinggi > 0 ? (
                <rect
                  x={xb} y={y(d.pemakaian)} width={lebarBatang} height={tinggi}
                  rx="4" ry="4"
                  fill={aktif ? WARNA_HOVER : WARNA}
                  pointerEvents="none"
                />
              ) : (
                // pemakaian 0 — tanda tipis di baseline supaya tidak terlihat "hilang"
                <rect x={xb} y={y(0) - 2} width={lebarBatang} height="2" rx="1"
                  fill="#2d313f" pointerEvents="none" />
              )}
              {/* ujung bawah batang dibuat siku, menempel baseline */}
              {tinggi > 4 && (
                <rect x={xb} y={y(0) - 4} width={lebarBatang} height="4"
                  fill={aktif ? WARNA_HOVER : WARNA} pointerEvents="none" />
              )}
            </g>
          );
        })}

        {/* Baseline */}
        <line x1={PAD.kiri} x2={lebar - PAD.kanan} y1={y(0)} y2={y(0)}
          stroke="#2d313f" strokeWidth="1.5" />

        {/* Label langsung: hanya bulan tertinggi */}
        {maks > 0 && (
          <text x={xTengah(iMaks)} y={y(data[iMaks].pemakaian) - 8} textAnchor="middle"
            fill="#f8fafc" fontSize="10.5" fontWeight="700"
            style={{ fontVariantNumeric: 'tabular-nums' }}>
            {data[iMaks].pemakaian}
          </text>
        )}

        {/* Label sumbu X */}
        {data.map((d, i) => (
          labelTampil.has(i) ? (
            <text key={`x${d.kunci}`} x={xTengah(i)} y={TINGGI - PAD.bawah + 16}
              textAnchor="middle" fill="#94a3b8" fontSize="9.5">
              {d.labelPendek}
            </text>
          ) : null
        ))}
      </svg>

      {/* Tooltip: nilai memimpin, label mengikuti */}
      {hover !== null && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-lg border border-line bg-bg/95 px-3 py-2 shadow-xl backdrop-blur-sm"
          style={{
            left: Math.min(Math.max(xTengah(hover), 70), lebar - 70),
            top: Math.max(4, y(data[hover].pemakaian) - 74),
          }}
        >
          <div className="flex items-baseline gap-1.5">
            <span className="text-base font-bold tabular-nums" style={{ color: WARNA_HOVER }}>
              {data[hover].pemakaian}
            </span>
            <span className="text-xs text-dim">{satuan}</span>
          </div>
          <div className="mt-0.5 text-xs font-semibold whitespace-nowrap">{data[hover].label}</div>
          <div className="mt-1 flex items-center gap-1.5 text-[0.7rem] text-dim whitespace-nowrap">
            <span className="inline-block h-0.5 w-3 rounded-full" style={{ background: WARNA }} />
            {data[hover].meter}
          </div>
          <div className="text-[0.7rem] text-dim">{data[hover].tagihanTeks}</div>
        </div>
      )}
    </div>
  );
}
