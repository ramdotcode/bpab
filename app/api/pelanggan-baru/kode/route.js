import { saranKode } from '@/lib/newcustomer';
import { ok, handler } from '@/lib/api';

export const dynamic = 'force-dynamic';

export const GET = handler(async (req) => {
  const sp = new URL(req.url).searchParams;
  return ok(await saranKode({
    kodeRt: sp.get('rt') || '',
    kodeRumah: sp.get('rumah') || '',
  }));
});
