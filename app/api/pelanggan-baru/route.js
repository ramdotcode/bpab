import { tambahPelanggan } from '@/lib/newcustomer';
import { ok, handler } from '@/lib/api';

export const dynamic = 'force-dynamic';

export const POST = handler(async (req) => {
  const body = await req.json();
  return ok({ hasil: await tambahPelanggan(body) });
}, 400);
