'use client';
import { useCallback, useEffect, useState } from 'react';

// Pembantu pemanggilan API: melempar Error dengan pesan dari server.
export async function apiGet(url) {
  const r = await fetch(url, { cache: 'no-store' });
  const j = await r.json().catch(() => ({ ok: false, message: 'Respons tidak valid' }));
  if (!j.ok) throw new Error(j.message || 'Gagal memuat data');
  return j;
}

export async function apiPost(url, body) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({ ok: false, message: 'Respons tidak valid' }));
  if (!j.ok) throw new Error(j.message || 'Gagal menyimpan');
  return j;
}

// Muat data sekali / saat kunci berubah, lengkap dengan status memuat & error.
export function useApi(url, { skip = false } = {}) {
  const [data, setData] = useState(null);
  const [memuat, setMemuat] = useState(!skip);
  const [error, setError] = useState(null);

  const muat = useCallback(async () => {
    if (skip || !url) return;
    setMemuat(true);
    setError(null);
    try {
      setData(await apiGet(url));
    } catch (e) {
      setError(e.message);
    } finally {
      setMemuat(false);
    }
  }, [url, skip]);

  useEffect(() => { muat(); }, [muat]);

  return { data, setData, memuat, error, muatUlang: muat };
}
