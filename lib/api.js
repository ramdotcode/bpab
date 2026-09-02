// Pembantu untuk route handler: bentuk respons seragam { ok, ... }.
import { NextResponse } from 'next/server';

export const ok = (data = {}) => NextResponse.json({ ok: true, ...data });

export const fail = (status, message) =>
  NextResponse.json({ ok: false, message }, { status });

// Bungkus handler supaya error apa pun jadi respons rapi, bukan halaman error.
export function handler(fn, statusError = 500) {
  return async (req, ctx) => {
    try {
      return await fn(req, ctx);
    } catch (e) {
      console.error('[api]', e?.message || e);
      return fail(statusError, e?.message || 'Terjadi kesalahan.');
    }
  };
}

// Ambil periode dari query string, jatuh ke default bila kosong.
export function periodeDariQuery(req, def) {
  const sp = new URL(req.url).searchParams;
  return {
    tahun: (sp.get('tahun') || def.tahun).toString(),
    bulan: (sp.get('bulan') || def.bulan).toString().padStart(2, '0'),
  };
}
