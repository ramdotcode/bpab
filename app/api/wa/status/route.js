import { ok, fail, handler } from '@/lib/api';

export const dynamic = 'force-dynamic';

const BASE = process.env.WHACENTER_BASE || 'https://app.whacenter.com';

// Pesan galatnya dibuat spesifik: "tidak terhubung" bisa berarti device ID belum
// diset di server, server tidak bisa menghubungi Whacenter, atau WA-nya memang putus.
export const GET = handler(async () => {
  const id = process.env.WHACENTER_DEVICE_ID;
  if (!id) return fail(400, 'WHACENTER_DEVICE_ID belum diset di server');

  let r;
  try {
    r = await fetch(`${BASE}/api/statusDevice?device_id=${encodeURIComponent(id)}`, {
      cache: 'no-store',
    });
  } catch (e) {
    return fail(502, `Server tidak bisa menghubungi ${BASE} (${e.cause?.code || e.message})`);
  }
  if (!r.ok) return fail(502, `${BASE} membalas HTTP ${r.status}`);

  const data = await r.json().catch(() => null);
  if (!data) return fail(502, `Balasan ${BASE} tidak bisa dibaca`);
  if (data.status === false) return fail(502, data.message || 'Whacenter menolak permintaan');
  return ok({ data: data.data || data });
}, 502);
