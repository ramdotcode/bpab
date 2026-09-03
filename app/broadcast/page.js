'use client';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { apiGet } from '@/hooks/useApi';
import { useToast } from '@/components/Toast';
import Modal from '@/components/Modal';
import {
  PageHeader, Panel, Table, Th, Td, Tr, EmptyState, StatCard,
  Input, Select, Textarea, Field, Button, Badge, Spinner, ProgressBar, Checkbox,
} from '@/components/ui';
import { MODES } from '@/lib/messages';
import { BULAN } from '@/lib/format';

export default function HalamanBroadcast() {
  return (
    <Suspense fallback={<div className="p-7 text-dim"><Spinner className="mr-2 align-middle" />Memuat...</div>}>
      <IsiBroadcast />
    </Suspense>
  );
}

function IsiBroadcast() {
  const sp = useSearchParams();
  const { toast, Toaster } = useToast();
  const mode = MODES[sp.get('mode')] ? sp.get('mode') : 'foto-meteran';
  const cfg = MODES[mode];

  const [target, setTarget] = useState([]);
  const [periode, setPeriode] = useState(null);   // periode data yang sedang tampil
  const [tahun, setTahun] = useState('');         // periode yang dipilih di bilah alat
  const [bulan, setBulan] = useState('');
  const [memuat, setMemuat] = useState(false);
  const [galat, setGalat] = useState(null);
  const [template, setTemplate] = useState(cfg.template || '');
  const [jedaMin, setJedaMin] = useState(3);
  const [jedaMax, setJedaMax] = useState(6);
  const [pilih, setPilih] = useState(() => new Set());
  const [log, setLog] = useState([]);
  const [tab, setTab] = useState('target');
  const [pratinjau, setPratinjau] = useState(null);
  const [cari, setCari] = useState('');
  const [dari, setDari] = useState('');
  const [ke, setKe] = useState('');

  const [kirimJalan, setKirimJalan] = useState(false);
  const [progres, setProgres] = useState({ selesai: 0, total: 0, teks: '' });
  const berhenti = useRef(false);

  // Periode berjalan dipakai sebagai nilai awal pemilih bulan/tahun.
  useEffect(() => {
    apiGet('/api/periode')
      .then((p) => { setTahun(p.tahun); setBulan(p.bulan); })
      .catch((e) => setGalat(e.message));
  }, []);

  // Ganti mode -> reset semuanya
  useEffect(() => {
    setTarget([]);
    setPilih(new Set());
    setTemplate(MODES[mode].template || '');
    setGalat(null);
  }, [mode]);

  const catat = (jenis, nomor, pesan) =>
    setLog((l) => [{ id: `${Date.now()}-${Math.random()}`, jam: new Date().toLocaleTimeString('id-ID'), jenis, nomor, pesan }, ...l]);

  const muat = async () => {
    setMemuat(true);
    setGalat(null);
    try {
      const url = cfg.periodik && tahun && bulan
        ? `${cfg.endpoint}?tahun=${tahun}&bulan=${bulan}`
        : cfg.endpoint;
      const j = await apiGet(url);
      const label = j.periode?.label || '';
      // `no` disimpan supaya nomor urut baris tetap sama walau daftarnya disaring
      setTarget((j.targets || []).map((t, i) => ({
        ...t, id: `t${i}`, no: i + 1, status: 'pending', pesanKhusus: '', periodeLabel: label,
      })));
      setPeriode(j.periode || null);
      catat('info', 'DATABASE', `Memuat ${j.targets.length} target${label ? ` periode ${label}` : ''}.`);
      setTab('target');
    } catch (e) {
      setGalat(e.message);
      catat('gagal', 'DATABASE', e.message);
    } finally {
      setMemuat(false);
    }
  };

  const susunPesan = (t) =>
    t.pesanKhusus ? t.pesanKhusus : cfg.build(t, cfg.editable ? template : null);

  const stat = useMemo(() => ({
    total: target.length,
    ok: target.filter((t) => t.status === 'ok').length,
    gagal: target.filter((t) => t.status === 'gagal').length,
    nunggu: target.filter((t) => t.status === 'pending').length,
  }), [target]);

  // Daftar yang sedang tampil. Semua aksi massal mengikuti daftar ini —
  // supaya "kirim semua" tidak diam-diam mengenai baris yang tidak terlihat.
  const terlihat = useMemo(() => {
    const q = cari.trim().toLowerCase();
    if (!q) return target;
    return target.filter((t) =>
      (t.nama || '').toLowerCase().includes(q)
      || (t.customId || '').toLowerCase().includes(q)
      || (t.wa || '').toLowerCase().includes(q)
      || (t.alamat || '').toLowerCase().includes(q));
  }, [target, cari]);

  const ubahStatus = (id, status) =>
    setTarget((ts) => ts.map((t) => (t.id === id ? { ...t, status } : t)));

  const jeda = () => {
    const min = Number(jedaMin) || 3;
    const max = Number(jedaMax) || 6;
    return (min + Math.random() * Math.max(0, max - min)) * 1000;
  };
  const tunggu = (ms) => new Promise((r) => setTimeout(r, ms));

  const kirimSatu = async (t) => {
    ubahStatus(t.id, 'kirim');
    try {
      const r = await fetch('/api/wa/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ number: t.wa, message: susunPesan(t) }),
      });
      const j = await r.json();
      ubahStatus(t.id, j.ok ? 'ok' : 'gagal');
      catat(j.ok ? 'ok' : 'gagal', t.wa, j.message || (j.ok ? 'Terkirim' : 'Gagal'));
      return j.ok;
    } catch (e) {
      ubahStatus(t.id, 'gagal');
      catat('gagal', t.wa, 'Network error: ' + e.message);
      return false;
    }
  };

  const kirimBanyak = async (daftar) => {
    if (daftar.length === 0) return;
    setKirimJalan(true);
    berhenti.current = false;
    setProgres({ selesai: 0, total: daftar.length, teks: 'Memulai...' });
    catat('info', 'SYSTEM', `Mulai broadcast ke ${daftar.length} nomor.`);

    let n = 0;
    for (const t of daftar) {
      if (berhenti.current) { catat('info', 'SYSTEM', 'Dihentikan pengguna.'); break; }
      setProgres({ selesai: n, total: daftar.length, teks: `Mengirim ke ${t.nama || t.wa}...` });
      await kirimSatu(t);
      n += 1;
      setProgres({ selesai: n, total: daftar.length, teks: `${n} dari ${daftar.length} terkirim` });
      if (n < daftar.length && !berhenti.current) {
        setProgres({ selesai: n, total: daftar.length, teks: 'Menunggu jeda...' });
        await tunggu(jeda());
      }
    }
    setKirimJalan(false);
    catat('info', 'SYSTEM', 'Broadcast selesai.');
    toast('Broadcast selesai', 'ok');
  };

  const kirimTerpilih = () => {
    const daftar = target.filter((t) => pilih.has(t.id) && t.status !== 'ok');
    if (daftar.length === 0) return toast('Pilih minimal satu target yang belum terkirim.', 'gagal');
    kirimBanyak(daftar);
  };

  const kirimSemua = () => {
    const daftar = terlihat.filter((t) => t.status === 'pending' || t.status === 'gagal');
    if (daftar.length === 0) return toast('Tidak ada target yang perlu dikirim.', 'gagal');
    kirimBanyak(daftar);
  };

  // Pilih baris berdasarkan nomor urut, mis. 1 s.d 10. Menambah ke pilihan yang
  // sudah ada supaya bisa dicicil (1-10, lalu 25-30). Hanya baris yang sedang
  // terlihat & belum terkirim yang ikut terpilih.
  const pilihRentang = () => {
    const a = parseInt(dari, 10);
    const b = ke.trim() === '' ? Math.max(...terlihat.map((t) => t.no)) : parseInt(ke, 10);
    if (!Number.isFinite(a) || !Number.isFinite(b)) {
      return toast('Isi nomor "dari" dan "sampai" dulu.', 'gagal');
    }
    const min = Math.min(a, b);
    const max = Math.max(a, b);
    const kena = terlihat.filter((t) => t.no >= min && t.no <= max && t.status !== 'ok');
    if (kena.length === 0) {
      return toast(`Tidak ada baris ${min}–${max} yang bisa dipilih.`, 'gagal');
    }
    setPilih((s) => {
      const baru = new Set(s);
      for (const t of kena) baru.add(t.id);
      return baru;
    });
    toast(`Baris ${min}–${max} dipilih (${kena.length} target).`, 'ok');
  };

  const togglePilih = (id) => setPilih((s) => {
    const n = new Set(s);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });

  const pilihSemua = (on) =>
    setPilih(on ? new Set(terlihat.filter((t) => t.status !== 'ok').map((t) => t.id)) : new Set());

  const unduhCsv = () => {
    if (target.length === 0) return;
    const q = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
    let csv = 'Nama,No HP,ID,Alamat,Pesan,Status\n';
    for (const t of target) {
      csv += [q(t.nama), q(t.wa), q(t.customId), q(t.alamat), q(susunPesan(t)), q(t.status)].join(',') + '\n';
    }
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    const cap = periode ? periode.label.replace(/\s+/g, '-') : new Date().toISOString().slice(0, 10);
    a.download = `Target_${mode}_${cap}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast('CSV diunduh', 'ok');
  };

  // Daftar di layar berasal dari periode lain -> ingatkan supaya dimuat ulang.
  const belumDimuat = Boolean(cfg.periodik && periode
    && (periode.tahun !== tahun || periode.bulan !== bulan));

  const persen = progres.total ? Math.round((progres.selesai / progres.total) * 100) : 0;

  return (
    <>
      <PageHeader title={cfg.label.replace(/^\S+\s/, 'Broadcast: ')} desc={cfg.desc}>
        {periode && (
          <Badge tone={belumDimuat ? 'amber' : 'primary'}>
            {belumDimuat ? `Data: ${periode.label} (belum dimuat ulang)` : periode.label}
          </Badge>
        )}
        <Button variant="outline" onClick={unduhCsv} disabled={target.length === 0}>Export CSV</Button>
        <Button variant="green" onClick={muat} disabled={memuat}>
          {memuat ? <><Spinner /> Memuat...</> : '⟳ Muat Data dari Database'}
        </Button>
      </PageHeader>

      {/* Pengaturan */}
      <div className="flex flex-wrap items-start gap-5 border-b border-line bg-surface px-7 py-4">
        {cfg.periodik && (
          <Field label="Periode Meteran"
            hint={belumDimuat
              ? 'Klik "Muat Data" untuk menarik target periode ini.'
              : 'Pilih bulan lalu untuk mengejar yang belum kirim foto.'}>
            <div className="flex items-center gap-2">
              <Select value={bulan} onChange={(e) => setBulan(e.target.value)} className="w-36">
                {BULAN.slice(1).map((b, i) => (
                  <option key={b} value={String(i + 1).padStart(2, '0')}>{b}</option>
                ))}
              </Select>
              <Input type="number" value={tahun} onChange={(e) => setTahun(e.target.value)} className="w-24" />
            </div>
          </Field>
        )}

        <Field label="Jeda Pengiriman (detik)" hint="Jeda acak mencegah blokir WhatsApp.">
          <div className="flex items-center gap-2">
            <Input type="number" value={jedaMin} onChange={(e) => setJedaMin(e.target.value)} className="w-20 text-center" />
            <span className="text-dim">—</span>
            <Input type="number" value={jedaMax} onChange={(e) => setJedaMax(e.target.value)} className="w-20 text-center" />
          </div>
        </Field>

        {cfg.editable && (
          <Field label="Template Pesan" className="min-w-72 flex-1"
            hint="Variabel: {nama}, {id}, {alamat}, {no_hp}, {periode}">
            <Textarea value={template} onChange={(e) => setTemplate(e.target.value)} className="min-h-24 font-mono text-xs" />
          </Field>
        )}

        {!cfg.editable && (
          <Panel className="max-w-md flex-1 p-3">
            <p className="text-xs leading-relaxed text-dim">
              Format pesan sudah tetap (sapaan otomatis, rincian meteran, total tagihan, cara pembayaran).
              Bisa diubah per pelanggan lewat tombol ✏️ di tabel.
            </p>
          </Panel>
        )}
      </div>

      {/* Statistik */}
      {target.length > 0 && (
        <div className="flex flex-wrap gap-4 border-b border-line bg-surface px-7 py-4">
          <StatCard label="Total Target" value={stat.total} />
          <StatCard label="Berhasil" value={stat.ok} tone="green" />
          <StatCard label="Gagal" value={stat.gagal} tone="red" />
          <StatCard label="Menunggu" value={stat.nunggu} tone="dim" />
        </div>
      )}

      {/* Progres kirim */}
      {kirimJalan && (
        <div className="border-b border-line bg-surface px-7 py-3">
          <div className="mb-1.5 flex items-center justify-between text-xs">
            <span className="text-dim">{progres.teks}</span>
            <button onClick={() => { berhenti.current = true; }}
              className="cursor-pointer font-bold text-red hover:underline">Hentikan</button>
          </div>
          <ProgressBar value={persen} />
        </div>
      )}

      {/* Tab */}
      <div className="flex border-b border-line bg-surface px-7">
        {[['target', `Daftar Target (${target.length})`], ['log', `Log Pengiriman (${log.length})`]].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`cursor-pointer border-b-2 px-5 py-3.5 text-sm font-semibold transition-colors
              ${tab === id ? 'border-green text-green' : 'border-transparent text-dim hover:text-ink'}`}>
            {label}
          </button>
        ))}
      </div>

      <div className="flex flex-1 flex-col overflow-hidden p-7 pt-5">
        {galat && <Panel className="mb-4 border-red/30 p-4"><p className="text-sm text-red">{galat}</p></Panel>}

        {tab === 'target' && (
          <>
            {target.length > 0 && (
              <>
                <div className="mb-3 flex flex-wrap items-center gap-3">
                  <Input type="search" value={cari} onChange={(e) => setCari(e.target.value)}
                    placeholder="Cari nama, kode pelanggan, no HP, atau alamat..."
                    className="min-w-56 flex-1 max-w-sm" />
                  {cari && (
                    <Badge tone={terlihat.length ? 'primary' : 'red'}>
                      {terlihat.length} dari {target.length}
                    </Badge>
                  )}

                  {/* Pilih baris berdasarkan nomor urut */}
                  <div className="flex items-center gap-2 rounded-xl border border-line px-3 py-2">
                    <span className="text-xs font-semibold text-dim">Pilih baris</span>
                    <Input type="number" min="1" value={dari} placeholder="dari"
                      onChange={(e) => setDari(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') pilihRentang(); }}
                      className="w-20 px-2 py-1.5 text-center text-xs" />
                    <span className="text-dim">–</span>
                    <Input type="number" min="1" value={ke} placeholder="sampai"
                      onChange={(e) => setKe(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') pilihRentang(); }}
                      className="w-20 px-2 py-1.5 text-center text-xs" />
                    <Button variant="outline" className="px-3 py-1.5 text-xs" onClick={pilihRentang}>
                      Pilih
                    </Button>
                  </div>
                </div>

                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <Checkbox label={cari ? 'Pilih semua hasil' : 'Pilih semua'}
                    onChange={(e) => pilihSemua(e.target.checked)}
                    checked={pilih.size > 0
                      && pilih.size === terlihat.filter((t) => t.status !== 'ok').length} />
                  <span className="text-xs text-dim">{pilih.size} dipilih</span>
                  {pilih.size > 0 && (
                    <button onClick={() => setPilih(new Set())}
                      className="cursor-pointer text-xs text-dim underline hover:text-ink">
                      bersihkan
                    </button>
                  )}
                  <span className="flex-1" />
                  <Button variant="outline" onClick={kirimTerpilih} disabled={kirimJalan || pilih.size === 0}
                    className="border-primary text-primary">
                    ➤ Kirim Dipilih ({pilih.size})
                  </Button>
                  <Button variant="green" onClick={kirimSemua}
                    disabled={kirimJalan || terlihat.filter((t) => t.status === 'pending' || t.status === 'gagal').length === 0}>
                    ➤ {cari ? `Kirim Semua Hasil (${terlihat.filter((t) => t.status === 'pending' || t.status === 'gagal').length})` : 'Kirim Semua Otomatis'}
                  </Button>
                </div>
              </>
            )}

            <Table>
              <thead>
                <tr>
                  <Th className="w-10" />
                  <Th className="w-12">No</Th>
                  <Th className="w-52">Kontak</Th>
                  <Th>Preview Pesan</Th>
                  <Th className="w-40">Aksi</Th>
                </tr>
              </thead>
              <tbody>
                {memuat && (
                  <tr><td colSpan={5} className="px-6 py-16 text-center text-dim">
                    <Spinner className="mr-2 align-middle" /> Memuat target...
                  </td></tr>
                )}

                {!memuat && target.length === 0 && (
                  <EmptyState colSpan={5} title="Belum ada data target">
                    Klik <b>Muat Data dari Database</b> di kanan atas.
                  </EmptyState>
                )}

                {!memuat && target.length > 0 && terlihat.length === 0 && (
                  <EmptyState colSpan={5} title="Tidak ada yang cocok">
                    Coba kata pencarian lain, atau kosongkan kotak pencariannya.
                  </EmptyState>
                )}

                {!memuat && terlihat.map((t) => (
                  <Tr key={t.id}>
                    <Td>
                      <input type="checkbox" className="size-4 accent-green"
                        disabled={t.status === 'ok'}
                        checked={pilih.has(t.id)}
                        onChange={() => togglePilih(t.id)} />
                    </Td>
                    <Td className="text-dim tnum">{t.no}</Td>
                    <Td>
                      <div className="font-semibold">{t.nama || <i className="text-dim">Tanpa Nama</i>}</div>
                      <div className="font-mono text-xs text-dim">{t.wa}</div>
                      {t.customId && <Badge className="mt-1">{t.customId}</Badge>}
                    </Td>
                    <Td className="max-w-xl text-xs whitespace-pre-wrap text-ink/90">{susunPesan(t)}</Td>
                    <Td>
                      {t.status === 'kirim' ? (
                        <span className="text-xs text-dim"><Spinner className="mr-1.5 align-middle" />mengirim</span>
                      ) : t.status === 'ok' ? (
                        <Badge tone="green">✓ Terkirim</Badge>
                      ) : (
                        <div className="flex gap-1.5">
                          <Button variant="ghost" className="px-2 py-1.5"
                            onClick={() => setPratinjau(t)} title="Edit pesan">✏️</Button>
                          <Button variant={t.status === 'gagal' ? 'danger' : 'green'}
                            className="px-3 py-1.5 text-xs"
                            disabled={kirimJalan}
                            onClick={() => kirimSatu(t)}>
                            {t.status === 'gagal' ? 'Ulangi' : 'Kirim'}
                          </Button>
                        </div>
                      )}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </>
        )}

        {tab === 'log' && (
          <div className="flex-1 overflow-y-auto">
            {log.length === 0
              ? <p className="py-16 text-center text-sm text-dim">Log pengiriman akan muncul di sini...</p>
              : (
                <div className="space-y-2">
                  {log.map((l) => (
                    <div key={l.id}
                      className={`rounded-lg border-l-3 bg-surface px-4 py-2.5 font-mono text-xs
                        ${l.jenis === 'ok' ? 'border-l-green' : l.jenis === 'gagal' ? 'border-l-red' : 'border-l-primary'}`}>
                      <span className="text-dim">{l.jam}</span>
                      <span className="mx-3 font-semibold">{l.nomor}</span>
                      <span>{l.pesan}</span>
                    </div>
                  ))}
                </div>
              )}
          </div>
        )}
      </div>

      {/* Edit pesan per pelanggan */}
      <Modal buka={Boolean(pratinjau)} tutup={() => setPratinjau(null)} lebar="max-w-2xl"
        judul="Edit pesan untuk pelanggan ini" labelUtama="Simpan pesan" labelBatal="Batal"
        aksiUtama={() => {
          const nilai = document.getElementById('edit-pesan').value;
          setTarget((ts) => ts.map((t) => t.id === pratinjau.id
            ? { ...t, pesanKhusus: nilai === susunPesan({ ...t, pesanKhusus: '' }) ? '' : nilai }
            : t));
          setPratinjau(null);
        }}>
        {pratinjau && (
          <>
            <p className="mb-3 text-dim">
              <b className="text-ink">{pratinjau.nama}</b> · <span className="font-mono">{pratinjau.wa}</span>
            </p>
            <Textarea id="edit-pesan" defaultValue={susunPesan(pratinjau)} className="min-h-64 font-mono text-xs" />
            <p className="mt-2 text-xs text-dim">Kosongkan perubahan untuk kembali mengikuti template.</p>
          </>
        )}
      </Modal>

      <Toaster />
    </>
  );
}
