// Penyusun sheet Excel laporan — fungsi murni, library XLSX dioper dari pemanggil
// (xlsx-js-style, SheetJS dengan dukungan gaya) supaya bisa diuji di Node.

// Titik pemisah ribuan dipaksa lewat format (tidak tergantung setelan bahasa Excel):
// 60000 -> 60.000, 1234567 -> 1.234.567. Nilainya tetap angka.
export const FORMAT_RUPIAH = '[>=1000000]#"."###"."###;[>=1000]#"."###;0';

const garis = (style) => {
  const g = { style, color: { rgb: '808080' } };
  return { top: g, bottom: g, left: g, right: g };
};
const TIPIS = garis('thin');
const HEADER = {
  font: { bold: true }, fill: { fgColor: { rgb: 'E7E6E6' } }, border: garis('medium'),
  alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
};
const TEBAL = { font: { bold: true } };

/**
 * kolom     : [[label, key, jenis]] — jenis 'rp' diformat uang, 'rp'/'int' ditulis sebagai angka
 * baris     : objek baris laporan
 * totKey    : key kolom tempat angka TOTAL (opsional), total: nilainya
 * ringkasan : { header: [5 sel], rows: [[label, '', '', jumlah, rupiah]] } (opsional);
 *             baris yang labelnya diawali "Total" dicetak tebal
 */
export function susunSheet(XLSX, { judul, kolom, baris, totKey, total, ringkasan }) {
  const n = kolom.length;
  const aoa = [[judul], kolom.map(([l]) => l)];
  for (const row of baris) {
    aoa.push(kolom.map(([, key, jenis]) => {
      const v = row[key];
      if (v === null || v === undefined || v === '') return '';
      return (jenis === 'rp' || jenis === 'int') ? Number(v) : v;
    }));
  }
  const adaTotal = Boolean(totKey) && total !== undefined;
  if (adaTotal) {
    const i = kolom.findIndex(([, k]) => k === totKey);
    const b = kolom.map(() => '');
    if (i > 0) b[i - 1] = 'TOTAL';
    b[i] = Number(total);
    aoa.push(b);
  }
  const akhirTabel = aoa.length;
  if (ringkasan) {
    aoa.push([]);
    aoa.push(ringkasan.header);
    aoa.push(...ringkasan.rows);
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const gaya = (r, c, s) => {
    const a = XLSX.utils.encode_cell({ r, c });
    const sel = ws[a] || (ws[a] = { t: 's', v: '' });
    sel.s = { ...(sel.s || {}), ...s };
    if (sel.t === 'n' && s.uang) sel.z = FORMAT_RUPIAH;
    delete sel.s.uang;
  };

  // Judul besar tebal, header kolom tebal bergaris tebal, isi bergaris tipis.
  const merges = [{ s: { r: 0, c: 0 }, e: { r: 0, c: n - 1 } }];
  gaya(0, 0, { font: { bold: true, sz: 14 } });
  for (let c = 0; c < n; c++) gaya(1, c, HEADER);
  for (let r = 2; r < akhirTabel; r++) {
    const barisTotal = adaTotal && r === akhirTabel - 1;
    kolom.forEach(([, , jenis], c) => {
      gaya(r, c, { border: TIPIS, ...(barisTotal ? TEBAL : {}), uang: jenis === 'rp' });
    });
  }

  // Ringkasan: header lalu isi; label digabung 3 kolom, kolom ke-5 = rupiah.
  if (ringkasan) {
    const awal = akhirTabel + 1;
    for (let r = awal; r < aoa.length; r++) {
      const head = r === awal;
      const tot = !head && /^Total/.test(String(aoa[r][0]));
      for (let c = 0; c < 5; c++) {
        gaya(r, c, head ? HEADER : { border: TIPIS, ...(tot ? TEBAL : {}), uang: c === 4 });
      }
      merges.push({ s: { r, c: 0 }, e: { r, c: 2 } });
    }
  }
  ws['!merges'] = merges;

  // Lebar kolom mengikuti isi terpanjang (angka uang dihitung dengan titiknya).
  ws['!cols'] = kolom.map(([l, , jenis], c) => {
    let w = l.length;
    for (let r = 2; r < akhirTabel; r++) {
      const v = aoa[r][c];
      if (v === '' || v === undefined) continue;
      w = Math.max(w, (jenis === 'rp' ? Number(v).toLocaleString('id-ID') : String(v)).length);
    }
    return { wch: Math.min(45, w + 2) };
  });
  return ws;
}
