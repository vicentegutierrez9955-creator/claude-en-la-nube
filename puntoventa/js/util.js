/* Utilidades generales */
'use strict';

const U = {
  round2(n) { return Math.round((Number(n) + Number.EPSILON) * 100) / 100; },
  round3(n) { return Math.round((Number(n) + Number.EPSILON) * 1000) / 1000; },

  money(n) {
    const sym = (typeof Store !== 'undefined' && Store.config && Store.config.moneda) || '$';
    const v = U.round2(n || 0);
    const s = Math.abs(v).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return (v < 0 ? '-' : '') + sym + s;
  },
  qty(n) {
    const v = U.round3(n || 0);
    return Number.isInteger(v) ? String(v) : v.toLocaleString('es-MX', { maximumFractionDigits: 3 });
  },
  pct(n) { return U.round2(n || 0).toLocaleString('es-MX', { maximumFractionDigits: 2 }) + '%'; },

  /* Convierte textos como "$1,234.50", "1.234,50" o "12" a número */
  num(v, def = 0) {
    if (v === null || v === undefined || v === '') return def;
    if (typeof v === 'number') return isFinite(v) ? v : def;
    let s = String(v).trim().replace(/[$\s]/g, '');
    if (!s) return def;
    const lastComma = s.lastIndexOf(','), lastDot = s.lastIndexOf('.');
    if (lastComma > -1 && lastDot > -1) {
      if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
      else s = s.replace(/,/g, '');
    } else if (lastComma > -1) {
      const decimals = s.length - lastComma - 1;
      s = (decimals === 3 && s.split(',').length > 1 && !/^0,/.test(s)) ? s.replace(/,/g, '') : s.replace(',', '.');
    }
    const n = parseFloat(s);
    return isFinite(n) ? n : def;
  },

  esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  },
  norm(s) {
    return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  },
  normKey(s) { return U.norm(s).replace(/[^a-z0-9]/g, ''); },

  now() { return Date.now(); },
  pad(n) { return String(n).padStart(2, '0'); },
  dateKey(ts) { const d = new Date(ts); return `${d.getFullYear()}-${U.pad(d.getMonth() + 1)}-${U.pad(d.getDate())}`; },
  fmtDate(ts) { const d = new Date(ts); return `${U.pad(d.getDate())}/${U.pad(d.getMonth() + 1)}/${d.getFullYear()}`; },
  fmtTime(ts) { const d = new Date(ts); return `${U.pad(d.getHours())}:${U.pad(d.getMinutes())}`; },
  fmtDateTime(ts) { return ts ? `${U.fmtDate(ts)} ${U.fmtTime(ts)}` : ''; },
  startOfDay(key) { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d, 0, 0, 0, 0).getTime(); },
  endOfDay(key) { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d, 23, 59, 59, 999).getTime(); },
  today() { return U.dateKey(Date.now()); },
  addDays(key, n) { const t = U.startOfDay(key) + n * 86400000 + 3600000; return U.dateKey(t); },
  firstOfMonth() { const d = new Date(); return `${d.getFullYear()}-${U.pad(d.getMonth() + 1)}-01`; },

  async hash(text) {
    const data = new TextEncoder().encode('pv-salt::' + text);
    if (window.crypto && crypto.subtle) {
      const buf = await crypto.subtle.digest('SHA-256', data);
      return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    }
    // Respaldo si crypto.subtle no está disponible
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (const b of data) { h1 = Math.imul(h1 ^ b, 2654435761); h2 = Math.imul(h2 ^ b, 1597334677); }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return 'f' + (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
  },

  download(filename, content, mime = 'application/octet-stream') {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  },

  /* Exporta filas (arreglo de objetos) a Excel */
  exportXlsx(filename, rows, sheetName = 'Hoja1') {
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
    XLSX.writeFile(wb, filename);
  },

  debounce(fn, ms = 200) {
    let t;
    return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  },

  readFileAsArrayBuffer(file) {
    return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsArrayBuffer(file); });
  },
  readFileAsText(file) {
    return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsText(file); });
  },
  readFileAsDataURL(file) {
    return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(file); });
  },

  sum(arr, fn) { return arr.reduce((a, x) => a + (fn ? fn(x) : x), 0); },
  groupBy(arr, fn) {
    const m = new Map();
    for (const x of arr) { const k = fn(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); }
    return m;
  },
};
