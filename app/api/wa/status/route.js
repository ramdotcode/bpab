import { ok, fail, handler } from '@/lib/api';

export const dynamic = 'force-dynamic';

const BASE = process.env.WHACENTER_BASE || 'https://app.whacenter.com';

export const GET = handler(async () => {
  const id = process.env.WHACENTER_DEVICE_ID;
  if (!id) return fail(400, 'Device ID belum diset di .env.local');
  const r = await fetch(`${BASE}/api/statusDevice?device_id=${encodeURIComponent(id)}`, {
    cache: 'no-store',
  });
  const data = await r.json();
  return ok({ data: data.data || data });
}, 502);
