// Penjaga rute: semua halaman & API wajib punya cookie sesi yang sah.
// Kecuali: /login, /api/auth/*, dan aset statis Next.
import { NextResponse } from 'next/server';
import { NAMA_COOKIE, cekToken } from '@/lib/auth';

export default async function proxy(req) {
  const { pathname, search } = req.nextUrl;
  const token = req.cookies.get(NAMA_COOKIE)?.value;
  const sah = await cekToken(token, process.env.AUTH_SECRET);

  // Sudah login tapi buka /login → langsung ke beranda.
  if (pathname === '/login') {
    return sah ? NextResponse.redirect(new URL('/', req.url)) : NextResponse.next();
  }

  if (sah) return NextResponse.next();

  // API: balas 401 JSON supaya fetch() di halaman tidak dapat HTML redirect.
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ ok: false, message: 'Belum login.' }, { status: 401 });
  }

  // Halaman: ke /login, ingat tujuan semula.
  const url = new URL('/login', req.url);
  const tujuan = pathname + search;
  if (tujuan !== '/') url.searchParams.set('next', tujuan);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico).*)'],
};
