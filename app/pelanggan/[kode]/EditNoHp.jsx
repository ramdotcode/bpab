'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Modal from '@/components/Modal';
import { useToast } from '@/components/Toast';
import { Field, Input } from '@/components/ui';

// Baris "No HP / WhatsApp" di kartu pelanggan, dengan tombol ubah.
// Markup dt/dd meniru Info di page.js supaya tampil seragam di dalam <dl>.
export default function EditNoHp({ kode, noHp }) {
  const router = useRouter();
  const { toast, Toaster } = useToast();
  const [buka, setBuka] = useState(false);
  const [nilai, setNilai] = useState('');
  const [proses, setProses] = useState(false);

  const bukaDialog = () => { setNilai(noHp || ''); setBuka(true); };

  const simpan = async () => {
    if (proses) return;
    setProses(true);
    try {
      const res = await fetch(`/api/pelanggan/${encodeURIComponent(kode)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ no_hp: nilai }),
      });
      const j = await res.json();
      if (!j.ok) throw new Error(j.message || 'Gagal menyimpan.');
      toast(j.no_hp ? `No HP disimpan: ${j.no_hp}` : 'No HP dikosongkan.', 'ok');
      setBuka(false);
      router.refresh();
    } catch (e) {
      toast(e.message || 'Gagal menyimpan.', 'gagal');
    } finally {
      setProses(false);
    }
  };

  return (
    <div>
      <dt className="text-[0.68rem] font-semibold uppercase tracking-wide text-dim">
        No HP / WhatsApp
      </dt>
      <dd className="mt-0.5 flex items-center gap-1.5 text-sm break-words">
        <span className={`font-mono ${noHp ? '' : 'text-red'}`}>
          {noHp || 'Belum ada no HP'}
        </span>
        <button
          type="button"
          onClick={bukaDialog}
          title="Ubah no HP"
          className="rounded px-1 text-dim transition hover:bg-line/60 hover:text-ink"
        >
          ✏️
        </button>
      </dd>

      <Modal
        buka={buka}
        tutup={() => { if (!proses) setBuka(false); }}
        judul={`Ubah No HP — ${kode}`}
        aksiUtama={simpan}
        labelUtama={proses ? 'Menyimpan…' : 'Simpan'}
        labelBatal="Batal"
      >
        <Field label="No HP / WhatsApp"
          hint="Format bebas (08…, 62…, +62…). Kosongkan untuk menghapus nomor.">
          <Input
            value={nilai}
            onChange={(e) => setNilai(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') simpan(); }}
            placeholder="08xxxxxxxxxx"
            inputMode="tel"
            autoFocus
          />
        </Field>
      </Modal>
      <Toaster />
    </div>
  );
}
