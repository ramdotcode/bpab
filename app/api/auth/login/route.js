import { NextResponse } from 'next/server';
import { fail, handler } from '@/lib/api';
import { konfigAuth, buatToken, samaWaktuTetap, NAMA_COOKIE, UMUR_SESI } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export const POST = handler(async (req) => {
  const k = konfigAuth();
  if (!k) return fail(500, 'AUTH_USER, AUTH_PASS, dan AUTH_SECRET belum diisi di .env.local.');

  const { username = '', password = '' } = await req.json().catch(() => ({}));

  // Cek keduanya dulu, baru putuskan — jangan berhenti di username salah.
  const cocokUser = samaWaktuTetap(username, k.user);
  const cocokPass = samaWaktuTetap(password, k.pass);
  if (!cocokUser || !cocokPass) return fail(401, 'Username atau password salah.');

  const res = NextResponse.json({ ok: true });
  res.cookies.set(NAMA_COOKIE, await buatToken(k.user, k.secret), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: UMUR_SESI,
    // Aplikasi ini biasanya jalan di http://localhost, jadi flag secure
    // hanya dipasang bila memang diakses lewat https.
    secure: new URL(req.url).protocol === 'https:',
  });
  return res;
});
