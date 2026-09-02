'use client';
import { useCallback, useEffect, useState } from 'react';

// Notifikasi ringan di kanan bawah. Pakai: const { toast, Toaster } = useToast()
export function useToast() {
  const [daftar, setDaftar] = useState([]);

  const toast = useCallback((pesan, jenis = 'info') => {
    const id = `${Date.now()}-${Math.random()}`;
    setDaftar((d) => [...d, { id, pesan, jenis }]);
    return id;
  }, []);

  const buang = useCallback((id) => {
    setDaftar((d) => d.filter((t) => t.id !== id));
  }, []);

  const Toaster = useCallback(() => (
    <div className="pointer-events-none fixed right-5 bottom-5 z-50 flex w-[min(360px,90vw)] flex-col gap-2">
      {daftar.map((t) => <Item key={t.id} {...t} buang={buang} />)}
    </div>
  ), [daftar, buang]);

  return { toast, Toaster };
}

const GAYA = {
  ok: 'border-green/40 bg-green/12 text-green',
  gagal: 'border-red/40 bg-red/12 text-red',
  info: 'border-primary/40 bg-primary/12 text-ink',
};

function Item({ id, pesan, jenis, buang }) {
  useEffect(() => {
    const t = setTimeout(() => buang(id), jenis === 'gagal' ? 7000 : 3500);
    return () => clearTimeout(t);
  }, [id, jenis, buang]);

  return (
    <div
      onClick={() => buang(id)}
      className={`fade-in pointer-events-auto cursor-pointer rounded-xl border px-4 py-3
        text-sm font-medium shadow-lg backdrop-blur-sm ${GAYA[jenis] || GAYA.info}`}
    >
      {pesan}
    </div>
  );
}
