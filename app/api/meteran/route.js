import { daftarMeteran, simpanMeteran } from '@/lib/meter';
import { periodeDefault } from '@/lib/targets';
import { ok, handler, periodeDariQuery } from '@/lib/api';

export const dynamic = 'force-dynamic';

export const GET = handler(async (req) => {
  const sp = new URL(req.url).searchParams;
  const { tahun, bulan } = periodeDariQuery(req, periodeDefault());
  return ok(await daftarMeteran({ tahun, bulan, hanyaKosong: sp.get('hanya_kosong') === '1' }));
});

// Satu-satunya endpoint yang mengubah data meteran.
export const POST = handler(async (req) => {
  const b = await req.json();
  return ok({
    hasil: await simpanMeteran({
      kode: b.kode,
      tahun: String(b.tahun),
      bulan: String(b.bulan).padStart(2, '0'),
      urutan: Number(b.urutan) || 1,
      akhir: b.akhir,
      simulasi: b.simulasi === true,
      izinkanUbah: b.izinkanUbah === true,
    }),
  });
}, 400);
