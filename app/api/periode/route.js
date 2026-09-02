import { periodeDefault, labelBulan } from '@/lib/targets';
import { ok, handler } from '@/lib/api';

export const dynamic = 'force-dynamic';

export const GET = handler(async () => {
  const p = periodeDefault();
  return ok({ ...p, label: labelBulan(p.bulan, p.tahun) });
});
