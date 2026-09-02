import { targetFotoMeteran, targetTagihan, periodeDefault, labelBulan } from '@/lib/targets';
import { ok, fail, handler, periodeDariQuery } from '@/lib/api';

export const dynamic = 'force-dynamic';

export const GET = handler(async (req, { params }) => {
  const { tipe } = await params;
  if (tipe === 'tagihan') return ok({ targets: await targetTagihan() });
  if (tipe === 'foto-meteran') {
    const { tahun, bulan } = periodeDariQuery(req, periodeDefault());
    return ok({
      periode: { tahun, bulan, label: labelBulan(bulan, tahun) },
      targets: await targetFotoMeteran({ tahun, bulan }),
    });
  }
  return fail(404, 'Jenis target tidak dikenal');
});
