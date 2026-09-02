'use client';
import { useEffect } from 'react';
import { Button } from './ui';

// Dialog sederhana: menggantikan alert()/confirm() bawaan browser.
export default function Modal({
  buka, tutup, judul, children,
  aksiUtama, labelUtama = 'Lanjutkan', varianUtama = 'green',
  labelBatal = 'Tutup', lebar = 'max-w-lg',
}) {
  useEffect(() => {
    if (!buka) return;
    const esc = (e) => { if (e.key === 'Escape') tutup?.(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [buka, tutup]);

  if (!buka) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={tutup}
    >
      <div
        className={`fade-in w-full ${lebar} max-h-[88vh] overflow-y-auto rounded-2xl border border-line bg-surface p-6 shadow-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        {judul && <h3 className="mb-4 text-base font-bold">{judul}</h3>}
        <div className="text-sm">{children}</div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={tutup}>{labelBatal}</Button>
          {aksiUtama && (
            <Button variant={varianUtama} onClick={aksiUtama}>{labelUtama}</Button>
          )}
        </div>
      </div>
    </div>
  );
}
