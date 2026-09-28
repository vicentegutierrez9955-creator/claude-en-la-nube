/* Conexión con el servidor del punto de venta (en esta computadora o en otra de la red local) */
'use strict';

const Remote = {
  token: null,
  events: null,
  online: true,

  get caja() {
    try { return localStorage.getItem('pv-caja') || ''; } catch (e) { return ''; }
  },
  set caja(v) {
    try { localStorage.setItem('pv-caja', v); } catch (e) { /* sin almacenamiento local */ }
  },

  async fetch(url, opts = {}) {
    let res;
    try {
      res = await fetch(url, { ...opts, headers: { 'Content-Type': 'application/json', ...(Remote.token ? { 'X-Token': Remote.token } : {}), ...(opts.headers || {}) } });
    } catch (e) {
      Remote.setOnline(false);
      throw new Error('No hay conexión con el servidor. Verifique que la computadora principal esté encendida y conectada a la misma red.');
    }
    Remote.setOnline(true);
    let body = null;
    try { body = await res.json(); } catch (e) { /* sin cuerpo */ }
    if (res.status === 401 && Remote.token) {
      Remote.token = null;
      if (window.App) setTimeout(() => { UI.toast('La sesión terminó. Vuelva a iniciar sesión.', 'bad'); App.logout(); }, 0);
    }
    if (!res.ok) throw new Error((body && body.error) || `Error del servidor (${res.status})`);
    return body;
  },
  get(url) { return Remote.fetch(url); },
  post(url, data) { return Remote.fetch(url, { method: 'POST', body: JSON.stringify(data ?? {}) }); },

  setOnline(v) {
    if (Remote.online === v) return;
    Remote.online = v;
    const el = document.getElementById('status-msg');
    if (el) { el.textContent = v ? '' : 'SIN CONEXIÓN CON EL SERVIDOR'; el.classList.toggle('bad', !v); }
  },

  async login(usuario, password) {
    const r = await Remote.post('/api/login', { usuario, password });
    Remote.token = r.token;
    return r.user;
  },
  async logout() {
    if (Remote.token) Remote.post('/api/logout').catch(() => {});
    Remote.token = null;
    if (Remote.events) { Remote.events.close(); Remote.events = null; }
  },

  /* Carga los catálogos compartidos */
  async bootstrap() {
    const b = await Remote.get('/api/bootstrap?caja=' + encodeURIComponent(Remote.caja));
    Store.config = Store.mergeConfig(b.config);
    Store.productos = b.productos;
    Store.reindex();
    Store.departamentos = b.departamentos;
    Store.clientes = b.clientes;
    Store.promociones = b.promociones;
    Store.usuarios = b.usuarios;
    Store.turno = b.turno;
    Store.tickets = b.tickets;
    Store.user = b.user;
    Store.caja = Remote.caja;
    return b;
  },

  /* Recibe al momento los cambios hechos desde otras cajas */
  listen() {
    if (Remote.events) Remote.events.close();
    let first = true;
    const es = new EventSource('/api/events?token=' + encodeURIComponent(Remote.token));
    Remote.events = es;
    es.onopen = async () => {
      Remote.setOnline(true);
      if (!first) { try { await Remote.bootstrap(); Remote.afterChange(); } catch (e) { /* se reintenta */ } }
      first = false;
    };
    es.onerror = () => { Remote.setOnline(false); };
    es.onmessage = async (ev) => {
      let msg; try { msg = JSON.parse(ev.data); } catch (e) { return; }
      if (msg.reload) { await Remote.bootstrap(); Remote.afterChange(true); }
      else if (msg.changes) { Remote.apply(msg.changes); Remote.afterChange(); }
    };
  },

  apply(changes) {
    if (!changes || !changes.length) return;
    const lists = { productos: 'productos', departamentos: 'departamentos', clientes: 'clientes', promociones: 'promociones', usuarios: 'usuarios' };
    let prod = false;
    for (const o of changes) {
      if (o.store === 'meta') { if (o.value && o.value.key === 'config') Store.config = Store.mergeConfig(o.value.value); continue; }
      const name = lists[o.store];
      if (!name) continue;
      const arr = Store[name];
      if (o.op === 'put') {
        const i = arr.findIndex(x => x.id === o.value.id);
        if (i > -1) {
          if (name === 'usuarios' && Store.user && Store.user.id === o.value.id) Object.assign(Store.user, o.value);
          Object.keys(arr[i]).forEach(k => delete arr[i][k]);
          Object.assign(arr[i], o.value);
        } else arr.push(o.value);
      } else if (o.op === 'delete') {
        const i = arr.findIndex(x => x.id === o.key);
        if (i > -1) arr.splice(i, 1);
      }
      if (name === 'productos') prod = true;
    }
    if (prod) Store.reindex();
    Store.departamentos.sort((a, b) => a.nombre.localeCompare(b.nombre));
    Store.clientes.sort((a, b) => a.nombre.localeCompare(b.nombre));
  },

  afterChange(full) {
    if (!window.App || !App.current) return;
    if (full) { App.applyPermissions(); if (!UI.modals.length) App.refresh(); return; }
    const s = App.screens[App.current];
    if (s && s.onDataChange) s.onDataChange();
  },

  /* Ejecuta una operación en el servidor */
  async call(method, args) {
    const r = await Remote.post('/api/rpc', { method, args, caja: Remote.caja });
    if (r.reload) { try { await Remote.bootstrap(); Remote.afterChange(true); } catch (e) { /* se vuelve a iniciar sesión */ } }
    else Remote.apply(r.changes);
    Store.turno = r.turno;
    return r.result;
  },

  async autorizar(usuario, password, perm) {
    const r = await Remote.post('/api/autorizar', { usuario, password, perm });
    return r.ok;
  },
};

/* Lecturas de la base de datos (ventas, movimientos, etc.) */
const DB = {
  async _q(params) {
    const r = await Remote.get('/api/db?' + new URLSearchParams(params));
    return r.data;
  },
  all(store) { return DB._q({ op: 'all', store }); },
  async get(store, key) { return (await DB._q({ op: 'get', store, key })) ?? undefined; },
  byIndex(store, index, value) { return DB._q({ op: 'byIndex', store, index, value }); },
  range(store, index, from, to) { return DB._q({ op: 'range', store, index, from, to }); },
  count(store) { return DB._q({ op: 'count', store }); },
};
