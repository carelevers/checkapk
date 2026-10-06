/**
 * Laat de browser een CSV-bestand downloaden (puntkomma-gescheiden, opent goed in Nederlandse Excel).
 * @param {(string|number)[][]} rows
 * @param {string} name bestandsnaam zonder extensie
 */
export function downloadCsv(rows, name) {
  const cell = (v) => (/[;"\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v));
  const csv = rows.map((r) => r.map(cell).join(';')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  a.download = name.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() + '.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
