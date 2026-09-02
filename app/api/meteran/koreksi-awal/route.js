import { koreksiMeteranAwal } from '@/lib/meter';
import { ok, handler } from '@/lib/api';

export const dynamic = 'force-dynamic';

// Koreksi meteran_awal untuk kasus ganti meteran. Sangat dibatasi:
// hanya bila rantai putus, belum lunas, dan nilainya = akhir periode sebelumnya.
export const POST = handler(async (req) => {
  const b = await req.json();
  return ok({
    hasil: await koreksiMeteranAwal({
      kode: b.kode,
      tahun: String(b.tahun),
      bulan: String(b.bulan).padStart(2, '0'),
      urutan: Number(b.urutan) || 1,
      simulasi: b.simulasi === true,
    }),
  });
}, 400);
