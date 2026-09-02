import { ping } from '@/lib/db';
import { ok, handler } from '@/lib/api';

export const dynamic = 'force-dynamic';

export const GET = handler(async () => {
  const db = await ping();
  return ok({ db, device_configured: Boolean(process.env.WHACENTER_DEVICE_ID) });
});
