import { detailPelanggan, ubahNoHp } from '@/lib/customers';
import { ok, fail, handler } from '@/lib/api';

export const dynamic = 'force-dynamic';

export const GET = handler(async (req, { params }) => {
  const { kode } = await params;
  const detail = await detailPelanggan(kode);
  if (!detail) return fail(404, 'Pelanggan tidak ditemukan');
  return ok({ detail });
});

// Satu-satunya field profil yang bisa diubah lewat API: no_hp.
export const PATCH = handler(async (req, { params }) => {
  const { kode } = await params;
  const b = await req.json();
  if (!('no_hp' in b)) return fail(400, 'Tidak ada perubahan: kirim field no_hp.');
  return ok(await ubahNoHp(kode, b.no_hp));
}, 400);
