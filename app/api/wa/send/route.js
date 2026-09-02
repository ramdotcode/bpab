import { fail, handler } from '@/lib/api';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const BASE = process.env.WHACENTER_BASE || 'https://app.whacenter.com';

// Device ID ditambahkan di server, tidak pernah dikirim ke browser.
export const POST = handler(async (req) => {
  const id = process.env.WHACENTER_DEVICE_ID;
  if (!id) return fail(400, 'Device ID belum diset di .env.local');
  const { number, message } = await req.json();
  if (!number || !message) return fail(400, 'number & message wajib diisi');

  const form = new FormData();
  form.append('device_id', id);
  form.append('number', number);
  form.append('message', message);

  const r = await fetch(`${BASE}/api/send`, { method: 'POST', body: form, cache: 'no-store' });
  const data = await r.json().catch(() => ({}));
  const sukses = data.status === true || data.status === 'true' || r.ok;
  return NextResponse.json({
    ok: sukses,
    message: data.message || (sukses ? 'Terkirim' : 'Gagal'),
    raw: data,
  });
}, 502);
