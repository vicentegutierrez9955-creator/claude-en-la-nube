/* Componentes de interfaz: ventanas, avisos, buscadores */
'use strict';

const UI = {
  modals: [],

  h(html) {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  },

  toast(msg, type = '') {
    const el = UI.h(`<div class="toast ${type}">${U.esc(msg)}</div>`);
    document.getElementById('toast-root').appendChild(el);
    setTimeout(() => el.remove(), type === 'bad' ? 5000 : 2800);
  },

  /* Abre una ventana. opts: { title, body (html|Element), footer (html), wide, onKey(e, m), onClose } */
  modal(opts) {
    const back = UI.h(`<div class="modal-back"><div class="modal ${opts.size || ''}" role="dialog" aria-modal="true">
      <header><h3>${U.esc(opts.title || '')}</h3><button type="button" data-close aria-label="Cerrar">×</button></header>
      <div class="body"></div>${opts.footer ? `<footer>${opts.footer}</footer>` : ''}</div></div>`);
    const body = back.querySelector('.body');
    if (typeof opts.body === 'string') body.innerHTML = opts.body; else if (opts.body) body.appendChild(opts.body);
    const m = {
      el: back, body, box: back.querySelector('.modal'),
      q: (s) => back.querySelector(s), qa: (s) => back.querySelectorAll(s),
      close(result) {
        if (m.closed) return;
        m.closed = true;
        back.remove();
        UI.modals = UI.modals.filter(x => x !== m);
        if (opts.onClose) opts.onClose(result);
        m._resolve && m._resolve(result);
        const top = UI.modals[UI.modals.length - 1];
        if (top) UI.focusFirst(top.box); else if (window.App) App.refocus();
      },
      onKey: opts.onKey,
    };
    m.done = new Promise(r => { m._resolve = r; });
    back.querySelector('[data-close]').onclick = () => m.close(null);
    back.addEventListener('mousedown', e => { if (e.target === back && opts.dismissable !== false) m.close(null); });
    document.getElementById('modal-root').appendChild(back);
    UI.modals.push(m);
    UI.focusFirst(back.querySelector('.modal'));
    return m;
  },
  focusFirst(root) {
    const el = root.querySelector('[autofocus]') || root.querySelector('input:not([type=hidden]):not([disabled]), select, textarea, button.primary');
    if (el) { el.focus(); if (el.select && el.tagName === 'INPUT') el.select(); }
  },
  top() { return UI.modals[UI.modals.length - 1]; },

  alert(msg, title = 'Aviso') {
    const m = UI.modal({ title, body: `<p>${U.esc(msg).replace(/\n/g, '<br>')}</p>`, footer: `<button class="primary" data-ok>Aceptar</button>` });
    m.q('[data-ok]').onclick = () => m.close(true);
    m.onKey = (e) => { if (e.key === 'Enter') { e.preventDefault(); m.close(true); } };
    m.q('[data-ok]').focus();
    return m.done;
  },
  confirm(msg, { title = 'Confirmar', ok = 'Aceptar', danger = false } = {}) {
    const m = UI.modal({ title, body: `<p>${U.esc(msg).replace(/\n/g, '<br>')}</p>`, footer: `<button class="secondary" data-no>Cancelar</button><button class="${danger ? 'danger' : 'primary'}" data-ok>${U.esc(ok)}</button>` });
    m.q('[data-ok]').onclick = () => m.close(true);
    m.q('[data-no]').onclick = () => m.close(false);
    m.onKey = (e) => { if (e.key === 'Enter') { e.preventDefault(); m.close(true); } };
    m.q('[data-ok]').focus();
    return m.done.then(r => !!r);
  },
  /* Pide un valor. fields: [{ name, label, type, value, step, options, required }] */
  form(title, fields, { ok = 'Aceptar', size = '', note = '' } = {}) {
    const html = `<form class="grid-form">${note ? `<p class="muted">${note}</p>` : ''}${fields.map(f => {
      if (f.type === 'select') return `<label>${U.esc(f.label)}<select name="${f.name}">${f.options.map(o => `<option value="${U.esc(o.value)}" ${String(o.value) === String(f.value ?? '') ? 'selected' : ''}>${U.esc(o.label)}</option>`).join('')}</select></label>`;
      if (f.type === 'textarea') return `<label>${U.esc(f.label)}<textarea name="${f.name}" rows="3">${U.esc(f.value ?? '')}</textarea></label>`;
      if (f.type === 'checkbox') return `<label class="check"><input type="checkbox" name="${f.name}" ${f.value ? 'checked' : ''}> ${U.esc(f.label)}</label>`;
      return `<label>${U.esc(f.label)}<input name="${f.name}" type="${f.type || 'text'}" ${f.step ? `step="${f.step}"` : ''} value="${U.esc(f.value ?? '')}" ${f.required ? 'required' : ''} ${f.autofocus ? 'autofocus' : ''} ${f.cls ? `class="${f.cls}"` : ''} inputmode="${f.type === 'number' ? 'decimal' : 'text'}"></label>`;
    }).join('')}<button type="submit" class="hidden"></button></form>`;
    const m = UI.modal({ title, body: html, size, footer: `<button class="secondary" data-no>Cancelar</button><button class="primary" data-ok>${U.esc(ok)}</button>` });
    const form = m.q('form');
    const submit = () => {
      if (!form.reportValidity()) return;
      const out = {};
      for (const f of fields) {
        const el = form.elements[f.name];
        out[f.name] = f.type === 'checkbox' ? el.checked : el.value;
      }
      m.close(out);
    };
    form.onsubmit = (e) => { e.preventDefault(); submit(); };
    m.q('[data-ok]').onclick = submit;
    m.q('[data-no]').onclick = () => m.close(null);
    return m.done;
  },
  async prompt(title, label, value = '', type = 'text') {
    const r = await UI.form(title, [{ name: 'v', label, value, type, autofocus: true, step: type === 'number' ? 'any' : undefined }]);
    return r ? r.v : null;
  },

  /* Buscador de productos (F10). Devuelve el producto elegido. */
  buscarProducto(inicial = '', { titulo = 'Buscar producto' } = {}) {
    const m = UI.modal({
      title: titulo, size: 'wide',
      body: `<div class="row"><label class="grow">Escriba parte del nombre, código o departamento<input data-q value="${U.esc(inicial)}" autofocus></label></div>
        <div class="table-wrap" style="max-height:55vh"><table class="grid"><thead><tr><th>Código</th><th>Descripción</th><th>Departamento</th><th class="num">Precio</th><th class="num">Mayoreo</th><th class="num">Existencia</th></tr></thead><tbody></tbody></table></div>
        <p class="muted small">↑ ↓ para moverse · Enter para elegir · Esc para cerrar</p>`,
    });
    const input = m.q('[data-q]'), tbody = m.q('tbody');
    let rows = [], sel = 0;
    const render = () => {
      rows = Store.buscarProductos(input.value, 300);
      sel = Math.min(sel, Math.max(rows.length - 1, 0));
      tbody.innerHTML = rows.map((p, i) => `<tr class="clickable ${i === sel ? 'sel' : ''}" data-i="${i}"><td>${U.esc(p.codigo)}</td><td>${U.esc(p.descripcion)}</td><td>${U.esc(p.departamento)}</td><td class="num">${U.money(p.precio)}</td><td class="num">${p.mayoreo ? U.money(p.mayoreo) : ''}</td><td class="num">${p.usaInventario ? U.qty(p.existencia) : '—'}</td></tr>`).join('') || `<tr><td colspan="6" class="muted center">Sin resultados</td></tr>`;
      const s = tbody.querySelector('tr.sel'); if (s) s.scrollIntoView({ block: 'nearest' });
    };
    input.oninput = U.debounce(() => { sel = 0; render(); }, 120);
    tbody.onclick = (e) => { const tr = e.target.closest('tr[data-i]'); if (tr) m.close(rows[+tr.dataset.i]); };
    m.onKey = (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(sel + 1, rows.length - 1); render(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(sel - 1, 0); render(); }
      else if (e.key === 'Enter') { e.preventDefault(); if (rows[sel]) m.close(rows[sel]); }
    };
    render();
    return m.done;
  },

  buscarCliente({ soloCredito = false } = {}) {
    const m = UI.modal({
      title: 'Seleccionar cliente', size: 'wide',
      body: `<div class="row"><label class="grow">Nombre o teléfono<input data-q autofocus></label><button class="secondary" data-nuevo>+ Nuevo cliente</button></div>
      <div class="table-wrap" style="max-height:50vh"><table class="grid"><thead><tr><th>Nombre</th><th>Teléfono</th><th class="num">Límite</th><th class="num">Saldo</th></tr></thead><tbody></tbody></table></div>`,
    });
    const input = m.q('[data-q]'), tbody = m.q('tbody');
    let rows = [], sel = 0;
    const render = () => {
      const q = U.norm(input.value);
      rows = Store.clientes.filter(c => (!soloCredito || c.credito) && (!q || U.norm(c.nombre + ' ' + (c.telefono || '')).includes(q))).slice(0, 300);
      sel = Math.min(sel, Math.max(rows.length - 1, 0));
      tbody.innerHTML = rows.map((c, i) => `<tr class="clickable ${i === sel ? 'sel' : ''}" data-i="${i}"><td>${U.esc(c.nombre)}</td><td>${U.esc(c.telefono || '')}</td><td class="num">${c.credito ? (c.limite > 0 ? U.money(c.limite) : 'Sin límite') : 'Sin crédito'}</td><td class="num">${U.money(c.saldo)}</td></tr>`).join('') || `<tr><td colspan="4" class="muted center">Sin clientes</td></tr>`;
    };
    input.oninput = () => { sel = 0; render(); };
    tbody.onclick = (e) => { const tr = e.target.closest('tr[data-i]'); if (tr) m.close(rows[+tr.dataset.i]); };
    m.q('[data-nuevo]').onclick = async () => { const c = await Clientes.editar(); if (c) m.close(c); };
    m.onKey = (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(sel + 1, rows.length - 1); render(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(sel - 1, 0); render(); }
      else if (e.key === 'Enter') { e.preventDefault(); if (rows[sel]) m.close(rows[sel]); }
    };
    render();
    return m.done;
  },

  /* Pide autorización de un usuario con el permiso indicado */
  async autorizar(perm, accion) {
    if (Store.can(perm)) return true;
    const r = await UI.form('Autorización requerida', [
      { name: 'usuario', label: 'Usuario autorizado', autofocus: true },
      { name: 'password', label: 'Contraseña', type: 'password' },
    ], { note: `Su usuario no tiene permiso para: <b>${U.esc(accion)}</b>. Un supervisor puede autorizarlo.` });
    if (!r) return false;
    try { if (await Remote.autorizar(r.usuario, r.password, perm)) return true; } catch (e) { UI.toast(e.message, 'bad'); return false; }
    UI.toast('Autorización inválida', 'bad');
    return false;
  },

  rangoFechas(prefix, from, to) {
    return `<label>Desde<input type="date" data-${prefix}-from value="${from}"></label><label>Hasta<input type="date" data-${prefix}-to value="${to}"></label>`;
  },
};
