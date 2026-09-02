'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { apiGet, apiPost } from '@/hooks/useApi';
import { useToast } from '@/components/Toast';
import Modal from '@/components/Modal';
import {
  PageHeader, Panel, Button, Field, Input, Select, Checkbox, Badge, Spinner,
} from '@/components/ui';
import { rupiah, hariIni } from '@/lib/format';

const KOSONG = {
  rumahBaru: true, kodeRumah: '', kodeRt: '', alamat: '', namaPenghuni: '',
  jenisBangunan: 'R', nama: '', noHp: '', nik: '', jenisLangganan: '1',
  tarif: 5000, tanggalDaftar: '', kodePelanggan: '', buatTagihan: true,
};

export default function TambahPelanggan() {
  const router = useRouter();
  const { toast, Toaster } = useToast();
  const [form, setForm] = useState(KOSONG);
  const [ref, setRef] = useState(null);
  const [memuat, setMemuat] = useState(true);
  const [simulasi, setSimulasi] = useState(true);
  const [proses, setProses] = useState(false);
  const [pratinjau, setPratinjau] = useState(null);
  const [konfirmasi, setKonfirmasi] = useState(false);
  const [sukses, setSukses] = useState(null);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    (async () => {
      try {
        const j = await apiGet('/api/pelanggan-baru/form');
        setRef(j);
        setForm((f) => ({
          ...f,
          kodeRt: j.rt[0]?.kode || '',
          tanggalDaftar: hariIni(),
        }));
      } catch (e) {
        toast(e.message, 'gagal');
      } finally {
        setMemuat(false);
      }
    })();
    // eslint-disable-next-line
  }, []);

  // Usulkan kode pelanggan tiap kali RT / rumah berubah.
  useEffect(() => {
    const rt = form.rumahBaru
      ? form.kodeRt
      : ref?.rumah.find((r) => r.kode === form.kodeRumah)?.kode_rt || '';
    if (!rt || !form.kodeRumah) return;
    let batal = false;
    apiGet(`/api/pelanggan-baru/kode?rt=${encodeURIComponent(rt)}&rumah=${encodeURIComponent(form.kodeRumah)}`)
      .then((j) => { if (!batal) set('kodePelanggan', j.kode); })
      .catch(() => {});
    return () => { batal = true; };
    // eslint-disable-next-line
  }, [form.kodeRumah, form.kodeRt, form.rumahBaru, ref]);

  const gantiJenis = (v) => {
    setForm((f) => ({
      ...f, jenisLangganan: v,
      tarif: v === '2' ? 500000 : 5000,
      jenisBangunan: v === '2' ? 'B' : 'R',
    }));
  };

  const pilihRumahAda = (kode) => {
    const r = ref?.rumah.find((x) => x.kode === kode);
    setForm((f) => ({
      ...f, kodeRumah: kode,
      kodeRt: r?.kode_rt || f.kodeRt,
      alamat: r?.alamat_lengkap || '',
    }));
  };

  const kirim = async (mode) => {
    setKonfirmasi(false);
    setProses(true);
    try {
      const rt = form.rumahBaru
        ? form.kodeRt
        : ref?.rumah.find((r) => r.kode === form.kodeRumah)?.kode_rt || form.kodeRt;
      const { hasil } = await apiPost('/api/pelanggan-baru', {
        ...form, kodeRt: rt, simulasi: mode === 'simulasi',
      });
      if (hasil.ditulis) {
        setSukses(hasil);
        toast(`${hasil.nama} tersimpan (${hasil.kode_pelanggan})`, 'ok');
      } else {
        setPratinjau(hasil);
      }
    } catch (e) {
      toast(e.message, 'gagal');
    } finally {
      setProses(false);
    }
  };

  const simpan = () => (simulasi ? kirim('simulasi') : setKonfirmasi(true));

  const rumahKosong = ref?.rumah.filter((r) => !r.dipakai_oleh) || [];

  if (memuat) {
    return (
      <>
        <PageHeader title="Tambah Pelanggan" />
        <div className="p-7 text-dim"><Spinner className="mr-2 align-middle" /> Memuat data rujukan...</div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Tambah Pelanggan Baru"
        desc="Menulis ke tra_rumah → tra_pelanggan_bpab → baris tagihan, dalam satu transaksi"
      >
        {simulasi && <Badge tone="amber">MODE SIMULASI</Badge>}
        <Link href="/pelanggan"><Button variant="outline">← Daftar pelanggan</Button></Link>
      </PageHeader>

      <div className="flex-1 overflow-y-auto p-7">
        <div className="max-w-4xl space-y-6">

          {/* ---------- 1. RUMAH ---------- */}
          <Panel className="p-5">
            <h2 className="mb-4 text-sm font-bold text-green">1. Rumah</h2>

            <div className="mb-4 flex flex-wrap gap-5">
              {[['true', 'Buat rumah baru'], ['false', 'Pakai rumah yang sudah ada']].map(([v, label]) => (
                <label key={v} className="flex cursor-pointer items-center gap-2 text-sm">
                  <input type="radio" name="mode-rumah" className="size-4 accent-green"
                    checked={String(form.rumahBaru) === v}
                    onChange={() => setForm((f) => ({ ...f, rumahBaru: v === 'true', kodeRumah: '', alamat: '' }))} />
                  {label}
                </label>
              ))}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {form.rumahBaru ? (
                <>
                  <Field label="RT *">
                    <Select value={form.kodeRt} onChange={(e) => set('kodeRt', e.target.value)}>
                      {ref.rt.map((r) => <option key={r.kode} value={r.kode}>{r.nama_rt}</option>)}
                    </Select>
                  </Field>
                  <Field label="Kode Rumah *" hint="Contoh: M.99, Q.4, R.17">
                    <Input value={form.kodeRumah} onChange={(e) => set('kodeRumah', e.target.value)}
                      placeholder="M.99" />
                  </Field>
                </>
              ) : (
                <Field label="Pilih Rumah *" className="sm:col-span-2"
                  hint={rumahKosong.length === 0
                    ? 'Semua rumah sudah dipakai pelanggan aktif — pilih "buat rumah baru".'
                    : `${rumahKosong.length} rumah tersedia (belum dipakai pelanggan aktif).`}>
                  <Select value={form.kodeRumah} onChange={(e) => pilihRumahAda(e.target.value)}>
                    <option value="">— pilih rumah —</option>
                    {ref.rumah.map((r) => (
                      <option key={r.kode} value={r.kode} disabled={Boolean(r.dipakai_oleh)}>
                        {r.kode} — {r.dipakai_oleh ? `dipakai ${r.nama_pelanggan}` : 'KOSONG'}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}

              <Field label="Alamat Lengkap" className="sm:col-span-2">
                <Input value={form.alamat} onChange={(e) => set('alamat', e.target.value)}
                  placeholder="Jl. Mendut II M.99" />
              </Field>

              <Field label="Nama Penghuni" hint='Gaya data lama: pakai awalan "Kel."'>
                <Input value={form.namaPenghuni} onChange={(e) => set('namaPenghuni', e.target.value)}
                  placeholder={form.nama ? `Kel. ${form.nama}` : 'Kel. ...'} />
              </Field>

              <Field label="Jenis Bangunan">
                <Select value={form.jenisBangunan} onChange={(e) => set('jenisBangunan', e.target.value)}>
                  <option value="R">R — Rumah</option>
                  <option value="B">B — Bangunan / Usaha</option>
                </Select>
              </Field>
            </div>
          </Panel>

          {/* ---------- 2. PELANGGAN ---------- */}
          <Panel className="p-5">
            <h2 className="mb-4 text-sm font-bold text-green">2. Pelanggan</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nama Pelanggan *" className="sm:col-span-2"
                hint='Tanpa awalan "Kel." — nama ini yang dipakai di pesan WhatsApp.'>
                <Input value={form.nama} onChange={(e) => set('nama', e.target.value)}
                  placeholder="Nama lengkap" />
              </Field>

              <Field label="No HP / WhatsApp">
                <Input value={form.noHp} onChange={(e) => set('noHp', e.target.value)}
                  placeholder="08xxxxxxxxxx" />
              </Field>

              <Field label="Kode Pelanggan *" hint="Otomatis: RT + no rumah + urutan. Bisa diubah.">
                <Input value={form.kodePelanggan} onChange={(e) => set('kodePelanggan', e.target.value)}
                  className="font-mono" placeholder="otomatis" />
              </Field>

              <Field label="Jenis Langganan">
                <Select value={form.jenisLangganan} onChange={(e) => gantiJenis(e.target.value)}>
                  <option value="1">1 — Rumah Tangga (per m³)</option>
                  <option value="2">2 — Tarif Flat (mis. instansi)</option>
                </Select>
              </Field>

              <Field label="Tarif (Rp)"
                hint={form.jenisLangganan === '2' ? 'Tagihan flat per bulan, meteran tidak dibaca.' : 'Per m³.'}>
                <Input type="number" value={form.tarif} onChange={(e) => set('tarif', e.target.value)} />
              </Field>

              <Field label="Tanggal Daftar">
                <Input type="date" value={form.tanggalDaftar}
                  onChange={(e) => set('tanggalDaftar', e.target.value)} />
              </Field>

              <Field label="NIK (opsional)">
                <Input value={form.nik} onChange={(e) => set('nik', e.target.value)} placeholder="boleh kosong" />
              </Field>
            </div>
          </Panel>

          {/* ---------- 3. TAGIHAN ---------- */}
          <Panel className="p-5">
            <h2 className="mb-3 text-sm font-bold text-green">3. Baris Tagihan Awal</h2>
            <Checkbox
              label={`Buat baris tagihan periode ${ref.periode.label} (meteran awal 0)`}
              checked={form.buatTagihan}
              onChange={(e) => set('buatTagihan', e.target.checked)}
            />
            <p className="mt-2 text-xs text-dim">
              Tanpa ini, pelanggan baru belum bisa diisi meterannya.
            </p>
          </Panel>

          {/* ---------- AKSI ---------- */}
          <Panel className="p-5">
            <Checkbox className="mb-4" checked={simulasi} disabled={!ref.izin_tambah}
              onChange={(e) => setSimulasi(e.target.checked)}
              label="Mode simulasi — tampilkan SQL saja, tidak menulis" />
            <div className="flex flex-wrap gap-3">
              <Button variant="green" onClick={simpan} disabled={proses}>
                {proses ? <><Spinner /> Memproses...</> : '💾 Simpan Pelanggan'}
              </Button>
              <Button variant="outline" onClick={() => router.push('/pelanggan')}>Batal</Button>
            </div>
          </Panel>
        </div>
      </div>

      {/* Konfirmasi tulis sungguhan */}
      <Modal buka={konfirmasi} tutup={() => setKonfirmasi(false)}
        judul="Simpan pelanggan baru?" labelUtama="Ya, simpan" labelBatal="Batal"
        aksiUtama={() => kirim('asli')}>
        <dl className="grid grid-cols-[7rem_1fr] gap-y-2">
          <dt className="text-dim">Nama</dt><dd className="font-semibold">{form.nama}</dd>
          <dt className="text-dim">Kode</dt><dd className="font-mono">{form.kodePelanggan}</dd>
          <dt className="text-dim">Rumah</dt>
          <dd>{form.kodeRumah} {form.rumahBaru ? <Badge tone="amber">BARU</Badge> : <Badge>existing</Badge>}</dd>
          <dt className="text-dim">Alamat</dt><dd>{form.alamat || '—'}</dd>
          <dt className="text-dim">Tarif</dt><dd>{rupiah(form.tarif)}</dd>
          {form.buatTagihan && (
            <><dt className="text-dim">Tagihan</dt><dd>+ baris {ref.periode.label}</dd></>
          )}
        </dl>
        <p className="mt-4 text-xs text-amber">Data akan ditulis ke database.</p>
      </Modal>

      {/* Hasil simulasi */}
      <Modal buka={Boolean(pratinjau)} tutup={() => setPratinjau(null)} lebar="max-w-3xl"
        judul="Mode simulasi — tidak ada yang ditulis">
        {pratinjau && (
          <>
            <p className="mb-3">
              <b>{pratinjau.nama}</b> — kode <b className="font-mono">{pratinjau.kode_pelanggan}</b>{' '}
              (no_urut {pratinjau.no_urut}), rumah {pratinjau.kode_rumah}
              {pratinjau.rumah_baru && <Badge tone="amber" className="ml-1.5">baru</Badge>}
            </p>
            <p className="mb-4 text-dim">
              {pratinjau.tagihan ? `Baris tagihan: ${pratinjau.tagihan.periode}` : 'Tanpa baris tagihan'}
            </p>
            <div className="space-y-3">
              {pratinjau.pratinjau.map((p) => (
                <div key={p.tabel}>
                  <div className="mb-1 text-xs font-bold text-green">{p.tabel}</div>
                  <pre className="overflow-x-auto rounded-lg border border-line bg-bg p-3 font-mono text-[0.68rem] leading-relaxed whitespace-pre-wrap">
                    {p.sql}{'\n'}nilai: {JSON.stringify(p.params)}
                  </pre>
                </div>
              ))}
            </div>
            <p className="mt-4 text-xs text-dim">
              Hilangkan centang “Mode simulasi” untuk benar-benar menyimpan.
            </p>
          </>
        )}
      </Modal>

      {/* Berhasil */}
      <Modal buka={Boolean(sukses)} tutup={() => { setSukses(null); router.push('/pelanggan'); }}
        judul="✓ Pelanggan tersimpan" labelBatal="Ke daftar pelanggan"
        labelUtama="Lihat kartu pelanggan" varianUtama="primary"
        aksiUtama={() => router.push(`/pelanggan/${sukses.kode_pelanggan}`)}>
        {sukses && (
          <dl className="grid grid-cols-[7rem_1fr] gap-y-2">
            <dt className="text-dim">Nama</dt><dd className="font-semibold">{sukses.nama}</dd>
            <dt className="text-dim">Kode</dt><dd className="font-mono">{sukses.kode_pelanggan}</dd>
            <dt className="text-dim">Rumah</dt><dd>{sukses.kode_rumah}</dd>
            <dt className="text-dim">Tabel</dt><dd className="text-xs">{sukses.tabel_disentuh.join(' → ')}</dd>
          </dl>
        )}
      </Modal>

      <Toaster />
    </>
  );
}
