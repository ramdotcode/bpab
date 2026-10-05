import { gantiMeteran } from '@/lib/meter';
import { ok, handler } from '@/lib/api';

export const dynamic = 'force-dynamic';

// Ganti meteran fisik: meteran awal dimulai dari 0 lagi (atau angka awal meteran
// baru) dan barisnya ditandai ganti_meteran='Y'. Hanya untuk tagihan belum lunas.
export const POST = handler(async (req) => {
  const b = await req.json();
  return ok({
    hasil: await gantiMeteran({
      kode: b.kode,
      tahun: String(b.tahun),
      bulan: String(b.bulan).padStart(2, '0'),
      urutan: Number(b.urutan) || 1,
      awalBaru: b.awalBaru === undefined || b.awalBaru === '' ? 0 : Number(b.awalBaru),
      simulasi: b.simulasi === true,
    }),
  });
}, 400);
