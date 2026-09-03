import { laporanMeteran, laporanBelumBayar, laporanSudahBayar, laporanPemasukan } from '@/lib/reports';
import { periodeDefault } from '@/lib/targets';
import { ok, fail, handler, periodeDariQuery } from '@/lib/api';

export const dynamic = 'force-dynamic';

const LAPORAN = {
  'meteran': laporanMeteran,
  'belum-bayar': laporanBelumBayar,
  'sudah-bayar': laporanSudahBayar,
  'pemasukan': laporanPemasukan,
};

export const GET = handler(async (req, { params }) => {
  const { tipe } = await params;
  const fn = LAPORAN[tipe];
  if (!fn) return fail(404, 'Jenis laporan tidak dikenal');
  const { tahun, bulan } = periodeDariQuery(req, periodeDefault());
  return ok({ laporan: await fn({ tahun, bulan }) });
});
