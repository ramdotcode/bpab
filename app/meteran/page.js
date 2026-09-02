'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { apiGet, apiPost } from '@/hooks/useApi';
import { useToast } from '@/components/Toast';
import Modal from '@/components/Modal';
import {
  PageHeader, Panel, Table, Th, Td, Tr, EmptyState, Button, Badge,
  Input, Select, Checkbox, Field, ProgressBar, Spinner,
} from '@/components/ui';
import { angka, rupiah, BULAN } from '@/lib/format';

export default function HalamanMeteran() {
  const { toast, Toaster } = useToast();
  const [data, setData] = useState(null);
  const [memuat, setMemuat] = useState(true);
  const [galat, setGalat] = useState(null);

  const [tahun, setTahun] = useState('');
  const [bulan, setBulan] = useState('');
  const [cari, setCari] = useState('');
  const [hanyaKosong, setHanyaKosong] = useState(true);
  const [simulasi, setSimulasi] = useState(false);
  const [izinkanUbah, setIzinkanUbah] = useState(false);

  const [nilai, setNilai] = useState({});      // { "kode_urutan": "1234" }
  const [status, setStatus] = useState({});    // { id: 'simpan'|'ok'|'gagal' }
  const [konfirmasi, setKonfirmasi] = useState(null);
  const [pratinjau, setPratinjau] = useState(null);
  const [koreksi, setKoreksi] = useState(null);     // baris yang mau dikoreksi awalnya
  const [lanjutan, setLanjutan] = useState(null);   // periode berikutnya yang ikut perlu dibetulkan
  const [filterTanda, setFilterTanda] = useState('');   // '' | 'rantai' | 'diam'
  const [perkiraan, setPerkiraan] = useState(() => new Set()); // baris yang diisi otomatis
  const inputRef = useRef({});

  // ---- muat periode awal ----
  useEffect(() => {
    (async () => {
      try {
        const p = await apiGet('/api/periode');
        setTahun(p.tahun);
        setBulan(p.bulan);
      } catch (e) {
        setGalat(e.message);
        setMemuat(false);
      }
    })();
  }, []);

  // ---- muat daftar meteran ----
  const muat = async () => {
    if (!tahun || !bulan) return;
    setMemuat(true);
    setGalat(null);
    try {
      const j = await apiGet(`/api/meteran?tahun=${tahun}&bulan=${bulan}`);
      setData(j);
      setNilai({});
      setStatus({});
      if (!j.izin_tulis) setSimulasi(true);
    } catch (e) {
      setGalat(e.message);
    } finally {
      setMemuat(false);
    }
  };
  useEffect(() => { muat(); /* eslint-disable-line */ }, [tahun, bulan]);

  const idBaris = (r) => `${r.kode}_${r.urutan}`;
  const minimal = data?.minimal ?? 6;

  // ---- baris yang tampil ----
  const terlihat = useMemo(() => {
    if (!data) return [];
    const q = cari.trim().toLowerCase();
    const batas = data.batas_diam ?? 3;
    return data.rows.filter((r) => {
      if (r.flat) return false;
      if (filterTanda === 'rantai') return r.rantai_putus && !r.lunas;
      if (filterTanda === 'diam') return r.bulan_diam >= batas;
      if (hanyaKosong && r.terisi) return false;
      if (!q) return true;
      return r.nama.toLowerCase().includes(q)
        || r.kode.toLowerCase().includes(q)
        || r.alamat.toLowerCase().includes(q);
    });
  }, [data, cari, hanyaKosong, filterTanda]);

  // ---- hitung pemakaian & tagihan dari angka yang sedang diketik ----
  const hitung = (r) => {
    const v = nilai[idBaris(r)];
    const dipakai = v === undefined ? (r.terisi ? String(r.akhir) : '') : v;
    if (dipakai === '') return null;
    const akhir = Number(dipakai);
    if (!Number.isInteger(akhir) || akhir < r.awal) return { invalid: true };
    const pemakaian = akhir - r.awal;
    return {
      akhir, pemakaian,
      total: Math.max(pemakaian, minimal) * r.tarif,
      kenaMinimal: pemakaian < minimal,
    };
  };

  // ---- isi otomatis dari rata-rata pemakaian setahun terakhir ----
  const bisaOtomatis = (r) =>
    r.rata12 !== null && r.n12 > 0 && !r.flat && !r.lunas && !(r.rantai_putus && !r.lunas);

  const usulanAkhir = (r) => r.awal + r.rata12;

  const isiOtomatis = (r) => {
    const id = idBaris(r);
    setNilai((n) => ({ ...n, [id]: String(usulanAkhir(r)) }));
    setPerkiraan((s) => new Set(s).add(id));
  };

  const isiSemuaOtomatis = () => {
    const sasaran = terlihat.filter((r) => bisaOtomatis(r) && !r.terisi);
    if (sasaran.length === 0) {
      return toast('Tidak ada baris kosong yang punya riwayat pemakaian.', 'gagal');
    }
    setNilai((n) => {
      const baru = { ...n };
      for (const r of sasaran) baru[idBaris(r)] = String(usulanAkhir(r));
      return baru;
    });
    setPerkiraan((s) => {
      const baru = new Set(s);
      for (const r of sasaran) baru.add(idBaris(r));
      return baru;
    });
    toast(`${sasaran.length} baris diisi perkiraan — periksa dulu, lalu klik Simpan.`, 'info');
  };

  const kosongkanSemua = () => {
    setNilai({});
    setPerkiraan(new Set());
  };

  const fokusBerikut = (id) => {
    const urut = terlihat.map(idBaris);
    const i = urut.indexOf(id);
    for (const kandidat of urut.slice(i + 1)) {
      const el = inputRef.current[kandidat];
      if (el && !el.disabled) { el.focus(); el.select(); return; }
    }
  };

  // ---- simpan ----
  const mintaSimpan = (r, lanjut) => {
    const h = hitung(r);
    if (!h) return toast('Isi angka meterannya dulu.', 'gagal');
    if (h.invalid) return toast(`Angka meteran harus bilangan bulat dan tidak kurang dari ${r.awal}.`, 'gagal');
    if (simulasi) return kirim(r, h, lanjut);
    setKonfirmasi({ r, h, lanjut });
  };

  const kirim = async (r, h, lanjut) => {
    const id = idBaris(r);
    setKonfirmasi(null);
    setStatus((s) => ({ ...s, [id]: 'simpan' }));
    try {
      const { hasil } = await apiPost('/api/meteran', {
        kode: r.kode, tahun: data.periode.tahun, bulan: data.periode.bulan,
        urutan: r.urutan, akhir: h.akhir, simulasi, izinkanUbah,
      });
      if (hasil.ditulis) {
        setStatus((s) => ({ ...s, [id]: 'ok' }));
        // sudah tersimpan -> bukan "perkiraan yang menunggu" lagi
        setPerkiraan((s) => { if (!s.has(id)) return s; const b = new Set(s); b.delete(id); return b; });
        setData((d) => {
          const rows = d.rows.map((x) => idBaris(x) === id
            ? { ...x, akhir: hasil.akhir, pemakaian: hasil.pemakaian, total: hasil.total, terisi: true }
            : x);
          const naik = !r.terisi;
          return {
            ...d, rows,
            ringkasan: naik
              ? { ...d.ringkasan, terisi: d.ringkasan.terisi + 1, kosong: d.ringkasan.kosong - 1 }
              : d.ringkasan,
          };
        });
        toast(`${hasil.nama} tersimpan — ${hasil.pemakaian} m³, ${rupiah(hasil.total)}`, 'ok');
        // Kalau periode berikutnya jadi tidak nyambung, tawarkan perbaikannya.
        if (hasil.perlu_koreksi_lanjutan) {
          setLanjutan({ ...hasil.perlu_koreksi_lanjutan, kode: r.kode, nama: hasil.nama, urutan: r.urutan });
        } else if (lanjut) fokusBerikut(id);
      } else {
        setStatus((s) => ({ ...s, [id]: null }));
        setPratinjau(hasil);
      }
    } catch (e) {
      setStatus((s) => ({ ...s, [id]: 'gagal' }));
      toast(e.message, 'gagal');
    }
  };

  // ---- koreksi meteran awal (kasus ganti meteran) ----
  const jalankanKoreksi = async () => {
    const r = koreksi;
    setKoreksi(null);
    const id = idBaris(r);
    setStatus((s) => ({ ...s, [id]: 'simpan' }));
    try {
      const { hasil } = await apiPost('/api/meteran/koreksi-awal', {
        kode: r.kode, tahun: data.periode.tahun, bulan: data.periode.bulan, urutan: r.urutan,
      });
      setData((d) => ({
        ...d,
        rows: d.rows.map((x) => idBaris(x) === id
          ? {
            ...x, awal: hasil.awal_baru, rantai_putus: false,
            pemakaian: hasil.pemakaian, total: hasil.total,
          }
          : x),
        ringkasan: { ...d.ringkasan, rantai_putus: Math.max(0, d.ringkasan.rantai_putus - 1) },
      }));
      setStatus((s) => ({ ...s, [id]: null }));
      toast(`Meteran awal ${hasil.nama} diperbaiki: ${hasil.awal_lama} → ${hasil.awal_baru}`, 'ok');
      if (hasil.perlu_koreksi_lanjutan) {
        setLanjutan({ ...hasil.perlu_koreksi_lanjutan, kode: r.kode, nama: hasil.nama, urutan: r.urutan });
      } else {
        // fokuskan kolom input supaya bisa langsung diisi
        setTimeout(() => inputRef.current[id]?.focus(), 60);
      }
    } catch (e) {
      setStatus((s) => ({ ...s, [id]: null }));
      toast(e.message, 'gagal');
    }
  };

  // Perbaiki meteran awal periode BERIKUTNYA (bisa berantai ke bulan setelahnya).
  const perbaikiLanjutan = async () => {
    const L = lanjutan;
    setLanjutan(null);
    try {
      const { hasil } = await apiPost('/api/meteran/koreksi-awal', {
        kode: L.kode, tahun: L.tahun, bulan: L.bulan, urutan: L.urutan,
      });
      toast(`${hasil.periode}: meteran awal ${hasil.awal_lama} → ${hasil.awal_baru}`, 'ok');
      if (hasil.perlu_koreksi_lanjutan) {
        setLanjutan({ ...hasil.perlu_koreksi_lanjutan, kode: L.kode, nama: L.nama, urutan: L.urutan });
      }
      // kalau yang dibetulkan adalah periode yang sedang ditampilkan, muat ulang
      if (L.tahun === data.periode.tahun && L.bulan === data.periode.bulan) muat();
    } catch (e) {
      toast(e.message, 'gagal');
    }
  };

  const R = data?.ringkasan;
  const persen = R?.total ? Math.round((R.terisi / R.total) * 100) : 0;

  return (
    <>
      <PageHeader
        title="Input Meteran"
        desc={data ? `Periode pemakaian ${data.periode.label} · minimal ${minimal} m³` : 'Memuat...'}
      >
        {simulasi && <Badge tone="amber">MODE SIMULASI</Badge>}
        {R && <Badge tone="green">{R.terisi}/{R.total} terisi</Badge>}
      </PageHeader>

      {/* Bilah alat */}
      <div className="flex flex-wrap items-end gap-3 border-b border-line bg-surface px-7 py-4">
        <Field label="Periode" className="flex gap-2">
          <Select value={bulan} onChange={(e) => setBulan(e.target.value)} className="w-36">
            {BULAN.slice(1).map((b, i) => (
              <option key={b} value={String(i + 1).padStart(2, '0')}>{b}</option>
            ))}
          </Select>
          <Input type="number" value={tahun} onChange={(e) => setTahun(e.target.value)} className="w-24" />
        </Field>

        <Field label="Cari" className="min-w-56 flex-1 max-w-96">
          <Input type="search" value={cari} onChange={(e) => setCari(e.target.value)}
            placeholder="Nama, kode, atau alamat..." />
        </Field>

        <div className="flex flex-col gap-2 pb-1">
          <Checkbox label="Hanya yang belum diisi" checked={hanyaKosong}
            onChange={(e) => setHanyaKosong(e.target.checked)} />
          <Checkbox label="Izinkan ubah yang sudah diisi" checked={izinkanUbah}
            onChange={(e) => setIzinkanUbah(e.target.checked)} />
        </div>

        <div className="flex flex-col gap-2 pb-1">
          <Checkbox label="Mode simulasi (tidak menulis)" checked={simulasi}
            disabled={data && !data.izin_tulis}
            onChange={(e) => setSimulasi(e.target.checked)} />
          <span className="text-xs text-dim">Tekan <b className="text-ink">Enter</b> untuk simpan &amp; lanjut</span>
        </div>

        <div className="ml-auto flex items-center gap-2 pb-1">
          <Button variant="outline" onClick={isiSemuaOtomatis} disabled={!data}
            title="Isi semua baris kosong dengan perkiraan dari rata-rata pemakaian setahun terakhir">
            ⚡ Isi perkiraan (semua)
          </Button>
          {perkiraan.size > 0 && (
            <Button variant="ghost" onClick={kosongkanSemua} title="Hapus semua angka yang belum disimpan">
              Kosongkan
            </Button>
          )}
        </div>
      </div>

      {/* Progres */}
      {R && (
        <div className="border-b border-line bg-surface px-7 pb-4">
          <ProgressBar value={persen} />
          <div className="mt-2 flex flex-wrap gap-4 text-xs text-dim">
            <span>✅ Terisi <b className="text-ink">{R.terisi}</b></span>
            <span>⬜ Belum <b className="text-ink">{R.kosong}</b></span>
            {R.flat > 0 && <span>⚪ Tarif flat dilewati <b className="text-ink">{R.flat}</b></span>}
            <span className="ml-auto">{persen}% selesai</span>
          </div>
        </div>
      )}

      <div className="flex flex-1 flex-col overflow-hidden p-7 pt-5">
        {galat && (
          <Panel className="mb-4 border-red/30 p-4">
            <p className="text-sm text-red">{galat}</p>
            <Button className="mt-3" onClick={muat}>Coba lagi</Button>
          </Panel>
        )}

        {/* Tanda perlu perhatian — klik untuk menyaring */}
        {(R?.rantai_putus > 0 || R?.diam > 0) && (
          <Panel className="mb-4 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-1 text-xs font-semibold text-dim uppercase tracking-wide">
                Perlu perhatian
              </span>

              {R.rantai_putus > 0 && (
                <button onClick={() => setFilterTanda((v) => (v === 'rantai' ? '' : 'rantai'))}
                  className={`cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors
                    ${filterTanda === 'rantai'
                      ? 'border-amber bg-amber/15 text-amber'
                      : 'border-line text-amber hover:bg-amber/10'}`}>
                  ⚠️ {R.rantai_putus} meteran awal tidak nyambung
                </button>
              )}

              {R.diam > 0 && (
                <button onClick={() => setFilterTanda((v) => (v === 'diam' ? '' : 'diam'))}
                  className={`cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors
                    ${filterTanda === 'diam'
                      ? 'border-primary bg-primary/15 text-primary'
                      : 'border-line text-primary hover:bg-primary/10'}`}>
                  ⏸ {R.diam} tidak berubah ≥ {data.batas_diam} bulan
                </button>
              )}

              {filterTanda && (
                <Button variant="ghost" className="px-3 py-1.5 text-xs"
                  onClick={() => setFilterTanda('')}>
                  Tampilkan semua
                </Button>
              )}
            </div>

            <p className="mt-2.5 text-xs leading-relaxed text-dim">
              {filterTanda === 'diam'
                ? 'Pemakaian nol berturut-turut. Bisa berarti meteran macet, rumah kosong, atau meterannya tidak benar-benar dibaca — cek fisiknya sebelum diisi.'
                : filterTanda === 'rantai'
                  ? 'Meteran awal tidak sama dengan angka akhir bulan sebelumnya. Perbaiki dulu supaya pemakaiannya tidak salah hitung.'
                  : 'Klik salah satu tanda di atas untuk menyaring barisnya.'}
            </p>
          </Panel>
        )}

        <Table>
          <thead>
            <tr>
              <Th className="w-12">No</Th>
              <Th className="w-24">Kode</Th>
              <Th>Nama / Alamat</Th>
              <Th className="w-20">RT</Th>
              <Th className="w-24" align="right">Awal</Th>
              <Th className="w-32">Meteran Akhir</Th>
              <Th className="w-28" align="right">Pemakaian</Th>
              <Th className="w-32" align="right">Tagihan</Th>
              <Th className="w-44">Aksi</Th>
            </tr>
          </thead>
          <tbody>
            {memuat && (
              <tr><td colSpan={9} className="px-6 py-16 text-center text-dim">
                <Spinner className="mr-2 align-middle" /> Memuat data meteran...
              </td></tr>
            )}

            {!memuat && terlihat.length === 0 && (
              <EmptyState colSpan={9}
                title={hanyaKosong ? 'Semua meteran periode ini sudah diisi 🎉' : 'Tidak ada hasil'}>
                {hanyaKosong
                  ? 'Hilangkan centang "Hanya yang belum diisi" untuk melihat atau mengoreksi.'
                  : 'Coba ubah kata pencarian.'}
              </EmptyState>
            )}

            {!memuat && terlihat.map((r, i) => {
              const id = idBaris(r);
              const h = hitung(r);
              const st = status[id];
              const terkunci = r.terisi && !izinkanUbah;
              return (
                <Tr key={id}>
                  <Td className="text-dim tnum">{i + 1}</Td>
                  <Td className="font-mono text-xs">{r.kode}</Td>
                  <Td>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{r.nama || <i className="text-dim">Tanpa Nama</i>}</span>
                      {r.bulan_diam >= (data.batas_diam ?? 3) && (
                        <Badge tone="primary"
                          title={`Pemakaian nol ${r.bulan_diam} bulan berturut-turut — cek meteran fisiknya`}>
                          ⏸ {r.bulan_diam} bln tidak berubah
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-dim">{r.alamat}</div>
                  </Td>
                  <Td className="text-xs text-dim">{r.rt}</Td>
                  <Td align="right" className="font-mono text-xs">
                    {r.rantai_putus && !r.lunas ? (
                      <span className="inline-flex flex-col items-end gap-0.5">
                        <span className="text-amber">⚠ {angka(r.awal)}</span>
                        <span className="text-[0.65rem] font-sans text-dim">
                          bln lalu: {angka(r.akhir_sebelum)}
                        </span>
                      </span>
                    ) : angka(r.awal)}
                  </Td>
                  <Td>
                    <div className="flex items-center gap-1.5">
                      <Input
                        type="number" inputMode="numeric"
                        ref={(el) => { inputRef.current[id] = el; }}
                        disabled={terkunci || st === 'simpan' || (r.rantai_putus && !r.lunas)}
                        value={nilai[id] ?? (r.terisi ? String(r.akhir) : '')}
                        onChange={(e) => {
                          setNilai((n) => ({ ...n, [id]: e.target.value }));
                          setPerkiraan((s) => { // diketik manual -> bukan perkiraan lagi
                            if (!s.has(id)) return s;
                            const b = new Set(s); b.delete(id); return b;
                          });
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') { e.preventDefault(); mintaSimpan(r, true); }
                        }}
                        placeholder="—"
                        className={`text-right ${h?.invalid ? 'border-red' : h ? 'border-green' : ''}`}
                      />
                      {bisaOtomatis(r) && !terkunci && (
                        <button
                          onClick={() => isiOtomatis(r)}
                          title={`Isi otomatis: ${angka(r.awal)} + ${r.rata12} = ${angka(usulanAkhir(r))}\nRata-rata ${r.rata12} m³ dari ${r.n12} bulan terakhir`}
                          className="shrink-0 cursor-pointer rounded-md border border-line px-1.5 py-1.5 text-[0.68rem] font-semibold text-dim transition-colors hover:border-primary hover:text-primary"
                        >
                          ⚡{r.rata12}
                        </button>
                      )}
                    </div>
                  </Td>
                  <Td align="right">
                    {h?.invalid ? <span className="text-red text-xs">tidak valid</span>
                      : h ? (
                        <span className="inline-flex flex-wrap items-center justify-end gap-1.5">
                          {h.pemakaian} m³
                          {h.kenaMinimal && <Badge tone="amber">min {minimal}</Badge>}
                          {perkiraan.has(id) && <Badge tone="primary">perkiraan</Badge>}
                        </span>
                      ) : <span className="text-dim">—</span>}
                  </Td>
                  <Td align="right" className="font-semibold">
                    {h && !h.invalid ? angka(h.total) : <span className="font-normal text-dim">—</span>}
                  </Td>
                  <Td>
                    <div className="flex items-center gap-1.5">
                      {/* Buka tab baru supaya angka yang sudah diisi (belum disimpan) tidak hilang */}
                      <a
                        href={`/pemakaian?kode=${encodeURIComponent(r.kode)}`}
                        target="_blank" rel="noopener noreferrer"
                        title={`Lihat tren pemakaian ${r.nama} (tab baru)`}
                        className="shrink-0 rounded-md border border-line px-2 py-1.5 text-xs text-dim transition-colors hover:border-primary hover:text-primary"
                      >
                        📈
                      </a>

                      {st === 'simpan' ? (
                        <span className="text-xs text-dim"><Spinner className="mr-1.5 align-middle" />menyimpan</span>
                      ) : r.rantai_putus && !r.lunas ? (
                        <Button variant="outline" className="border-amber px-2.5 py-1.5 text-xs text-amber"
                          onClick={() => setKoreksi(r)}>
                          Koreksi awal
                        </Button>
                      ) : r.terisi && !izinkanUbah ? (
                        <Badge tone="green">✓ Tersimpan</Badge>
                      ) : (
                        <Button
                          variant={st === 'gagal' ? 'danger' : 'green'}
                          className="px-3 py-1.5 text-xs"
                          onClick={() => mintaSimpan(r, false)}
                        >
                          {st === 'gagal' ? 'Coba lagi' : r.terisi ? 'Perbarui' : 'Simpan'}
                        </Button>
                      )}
                    </div>
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      </div>

      {/* Konfirmasi simpan sungguhan */}
      <Modal
        buka={Boolean(konfirmasi)}
        tutup={() => setKonfirmasi(null)}
        judul="Simpan meteran?"
        labelUtama="Ya, simpan"
        labelBatal="Batal"
        aksiUtama={() => kirim(konfirmasi.r, konfirmasi.h, konfirmasi.lanjut)}
      >
        {konfirmasi && (
          <dl className="grid grid-cols-[7rem_1fr] gap-y-2">
            <dt className="text-dim">Pelanggan</dt><dd className="font-semibold">{konfirmasi.r.nama}</dd>
            <dt className="text-dim">Periode</dt><dd>{data.periode.label}</dd>
            <dt className="text-dim">Meteran</dt>
            <dd className="font-mono">{konfirmasi.r.awal} → {konfirmasi.h.akhir}</dd>
            <dt className="text-dim">Pemakaian</dt>
            <dd>{konfirmasi.h.pemakaian} m³
              {konfirmasi.h.kenaMinimal && <span className="text-amber"> (kena minimal {minimal} m³)</span>}
            </dd>
            <dt className="text-dim">Tagihan</dt>
            <dd className="font-bold text-green">{rupiah(konfirmasi.h.total)}</dd>
            {konfirmasi.r.terisi && (
              <>
                <dt className="text-amber">Perhatian</dt>
                <dd className="text-amber">Mengganti nilai sebelumnya: {konfirmasi.r.akhir}</dd>
              </>
            )}
            {perkiraan.has(idBaris(konfirmasi.r)) && (
              <>
                <dt className="text-primary">Catatan</dt>
                <dd className="text-primary">
                  Angka ini <b>perkiraan</b> dari rata-rata {konfirmasi.r.rata12} m³
                  ({konfirmasi.r.n12} bulan), bukan hasil baca meteran.
                </dd>
              </>
            )}
          </dl>
        )}
      </Modal>

      {/* Konfirmasi koreksi meteran awal */}
      <Modal
        buka={Boolean(koreksi)}
        tutup={() => setKoreksi(null)}
        judul="Perbaiki meteran awal?"
        labelUtama="Ya, perbaiki"
        labelBatal="Batal"
        varianUtama="primary"
        aksiUtama={jalankanKoreksi}
      >
        {koreksi && (
          <>
            <p className="mb-4 text-dim">
              Meteran awal <b className="text-ink">{koreksi.nama}</b> tidak sama dengan angka akhir
              bulan sebelumnya. Ini biasanya terjadi setelah meteran diganti.
            </p>
            <dl className="grid grid-cols-[10rem_1fr] gap-y-2">
              <dt className="text-dim">Periode</dt><dd>{data.periode.label}</dd>
              <dt className="text-dim">Awal sekarang</dt>
              <dd className="font-mono text-amber">{angka(koreksi.awal)} <span className="font-sans text-xs">(salah)</span></dd>
              <dt className="text-dim">Akan diubah jadi</dt>
              <dd className="font-mono font-bold text-green">{angka(koreksi.akhir_sebelum)}</dd>
              <dt className="text-dim">Dasarnya</dt>
              <dd>angka akhir meteran bulan sebelumnya</dd>
            </dl>
            {koreksi.akhir > 0 && (
              <p className="mt-4 text-xs text-amber">
                Meteran akhir sudah terisi ({angka(koreksi.akhir)}) — pemakaian &amp; tagihannya
                akan ikut dihitung ulang.
              </p>
            )}
            <p className="mt-4 text-xs text-dim">
              Hanya kolom meteran awal yang diubah. Kolom pembayaran tidak tersentuh,
              dan baris yang sudah lunas tidak bisa dikoreksi dari sini.
            </p>
          </>
        )}
      </Modal>

      {/* Tawaran memperbaiki periode berikutnya (efek berantai dari koreksi) */}
      <Modal
        buka={Boolean(lanjutan)}
        tutup={() => setLanjutan(null)}
        judul="Bulan berikutnya ikut perlu dibetulkan"
        labelUtama={lanjutan?.bisa_dikoreksi ? `Perbaiki ${lanjutan.periode}` : undefined}
        labelBatal={lanjutan?.bisa_dikoreksi ? 'Nanti saja' : 'Mengerti'}
        varianUtama="primary"
        aksiUtama={lanjutan?.bisa_dikoreksi ? perbaikiLanjutan : undefined}
      >
        {lanjutan && (
          <>
            <p className="mb-4 text-dim">
              Karena angka meteran berubah, meteran awal <b className="text-ink">{lanjutan.periode}</b>{' '}
              untuk <b className="text-ink">{lanjutan.nama}</b> jadi tidak nyambung lagi.
            </p>
            <dl className="grid grid-cols-[11rem_1fr] gap-y-2">
              <dt className="text-dim">Awal {lanjutan.periode}</dt>
              <dd className="font-mono text-amber">{angka(lanjutan.awal_sekarang)}</dd>
              <dt className="text-dim">Seharusnya</dt>
              <dd className="font-mono font-bold text-green">{angka(lanjutan.awal_seharusnya)}</dd>
            </dl>
            {lanjutan.bisa_dikoreksi ? (
              <p className="mt-4 text-xs text-dim">
                Kalau dibiarkan, pemakaian {lanjutan.periode} akan salah hitung.
                Pemakaian &amp; tagihannya ikut dihitung ulang bila meteran akhirnya sudah ada.
              </p>
            ) : (
              <p className="mt-4 text-xs text-amber">
                Tagihan {lanjutan.periode} sudah <b>LUNAS</b>, jadi tidak bisa dibetulkan dari web ini —
                perbaiki di aplikasi lama bila perlu.
              </p>
            )}
          </>
        )}
      </Modal>

      {/* Hasil simulasi */}
      <Modal
        buka={Boolean(pratinjau)}
        tutup={() => setPratinjau(null)}
        judul="Mode simulasi — tidak ada yang ditulis"
        lebar="max-w-2xl"
      >
        {pratinjau && (
          <>
            <p className="mb-3">
              <b>{pratinjau.nama}</b> · {pratinjau.periode} · {pratinjau.awal} → {pratinjau.akhir}
              {' '}= {pratinjau.pemakaian} m³ → <b className="text-green">{rupiah(pratinjau.total)}</b>
            </p>
            <pre className="overflow-x-auto rounded-lg border border-line bg-bg p-3 font-mono text-[0.7rem] leading-relaxed whitespace-pre-wrap">
              {pratinjau.sql}{'\n\n'}nilai: {JSON.stringify(pratinjau.params)}
            </pre>
            <p className="mt-3 text-xs text-dim">
              Hilangkan centang “Mode simulasi” untuk benar-benar menyimpan.
            </p>
          </>
        )}
      </Modal>

      <Toaster />
    </>
  );
}
