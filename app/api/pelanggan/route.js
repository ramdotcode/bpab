import { listPelanggan } from '@/lib/customers';
import { ok, handler } from '@/lib/api';

export const dynamic = 'force-dynamic';

export const GET = handler(async (req) => {
  const sp = new URL(req.url).searchParams;
  return ok({
    pelanggan: await listPelanggan({
      q: (sp.get('q') || '').trim(),
      rt: (sp.get('rt') || '').trim(),
      nunggak: sp.get('nunggak') === '1',
    }),
  });
});
