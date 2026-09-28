/* Arranque, inicio de sesión, navegación y atajos de teclado */
'use strict';

const App = {
  screens: {},
  current: null,
  navKeys: { F1: 'ventas', F2: 'clientes', F3: 'productos', F4: 'inventario' },
  permisoPantalla: { ventas: 'vender', clientes: 'clientes', productos: 'productos', inventario: 'inventario', configuracion: 'configuracion', corte: 'corte', reportes: 'reportes' },

  async start() {
    App.screens = { ventas: Ventas, clientes: Clientes, productos: Productos, inventario: Inventario, configuracion: Configuracion, corte: Corte, reportes: Reportes };
    try {
      await Store.load();
    } catch (e) {
      document.body.innerHTML = `<div style="padding:30px;font-family:sans-serif"><h2>No se pudo conectar con el servidor</h2><p>${U.esc(e.message)}</p><p>Verifique que la computadora principal (servidor) esté encendida, que el programa del servidor esté abierto y que esta computadora esté conectada a la misma red Wi-Fi.</p><button onclick="location.reload()">Reintentar</button></div>`;
      return;
    }
    document.querySelectorAll('#mainnav button').forEach(b => b.onclick = () => App.go(b.dataset.screen));
    document.getElementById('btn-logout').onclick = () => App.logout();
    document.getElementById('login-form').onsubmit = App.onLogin;
    document.addEventListener('keydown', App.onKey, true);
    setInterval(App.tick, 1000 * 20);
    App.showLogin();
  },

  showLogin() {
    Store.user = null;
    document.getElementById('brand-name').textContent = Store.config.negocio.nombre;
    document.getElementById('login-title').textContent = Store.config.negocio.nombre;
    document.getElementById('login-hint').textContent = Store.primeraVez ? 'Primera vez: usuario "admin" sin contraseña. Cambie la contraseña en Configuración → Cajeros.' : '';
    document.getElementById('login-caja').textContent = Remote.caja ? `Esta computadora: ${Remote.caja}` : '';
    document.getElementById('login').classList.remove('hidden');
    document.getElementById('caja-row').classList.toggle('hidden', !!Remote.caja);
    const f = document.getElementById('login-form');
    f.reset();
    setTimeout(() => f.elements.usuario.focus(), 30);
  },

  async onLogin(e) {
    e.preventDefault();
    const f = e.target;
    const err = document.getElementById('login-error');
    err.textContent = '';
    if (!Remote.caja) {
      const nombre = (f.elements.caja && f.elements.caja.value.trim()) || '';
      if (!nombre) { document.getElementById('caja-row').classList.remove('hidden'); f.elements.caja.focus(); err.textContent = 'Escriba un nombre para esta caja (ej. Caja 1, Mostrador).'; return; }
      Remote.caja = nombre;
    }
    try {
      await Store.login(f.elements.usuario.value, f.elements.password.value);
    } catch (ex) { err.textContent = ex.message; return; }
    document.getElementById('brand-name').textContent = Store.config.negocio.nombre;
    document.getElementById('login').classList.add('hidden');
    document.getElementById('user-name').textContent = Store.user.nombre;
    App.applyPermissions();
    if (!Store.turno && Store.can('vender') && Store.config.pedirFondo) {
      const r = await UI.form('Iniciar turno', [{ name: 'fondo', label: 'Dinero inicial en caja (fondo)', type: 'number', step: 'any', value: '0', autofocus: true, cls: 'cobro-input' }], { ok: 'Iniciar turno', note: 'Indique con cuánto efectivo inicia la caja.' });
      await Store.abrirTurno(r ? U.num(r.fondo) : 0);
    }
    App.tick();
    const first = Object.keys(App.permisoPantalla).find(s => Store.can(App.permisoPantalla[s]));
    App.go(first || 'ventas', true);
  },

  logout() {
    Remote.logout();
    while (UI.modals.length) UI.top().close(null);
    App.current = null;
    document.getElementById('screen').innerHTML = '';
    App.showLogin();
  },

  applyPermissions() {
    document.querySelectorAll('#mainnav button').forEach(b => {
      b.classList.toggle('hidden', !Store.can(App.permisoPantalla[b.dataset.screen]));
    });
  },

  go(name, force = false) {
    if (!Store.user) return;
    if (!Store.can(App.permisoPantalla[name])) { UI.toast('No tiene permiso para entrar a esta sección', 'bad'); return; }
    if (App.current === name && !force) { App.refocus(); return; }
    while (UI.modals.length) UI.top().close(null);
    App.current = name;
    document.querySelectorAll('#mainnav button').forEach(b => b.classList.toggle('active', b.dataset.screen === name));
    const el = document.getElementById('screen');
    el.innerHTML = '';
    App.screens[name].render(el);
    App.refocus();
  },
  refresh() { if (App.current) App.go(App.current, true); },
  refocus() { const s = App.screens[App.current]; if (s && s.focus) s.focus(); },

  onKey(e) {
    if (!Store.user) return;
    const m = UI.top();
    if (m) {
      if (e.key === 'Escape') { e.preventDefault(); m.close(null); return; }
      if (m.onKey) m.onKey(e, m);
      if (/^F\d+$/.test(e.key)) e.preventDefault();
      return;
    }
    if (App.navKeys[e.key] && !e.ctrlKey && !e.altKey) { e.preventDefault(); App.go(App.navKeys[e.key]); return; }
    const s = App.screens[App.current];
    if (s && s.onKey && s.onKey(e)) { e.preventDefault(); return; }
    if (/^F\d+$/.test(e.key)) e.preventDefault(); // evita ayuda, recarga, etc. del navegador
  },

  tick() {
    const t = Store.turno;
    document.getElementById('status-turno').textContent = `${Remote.caja || 'Caja'} · ` + (t ? `Turno #${t.id} abierto desde ${U.fmtDateTime(t.abierto)} por ${t.usuarioAbre}` : 'Sin turno abierto (se abre con la primera venta)');
    document.getElementById('status-clock').textContent = new Date().toLocaleString('es-MX', { dateStyle: 'full', timeStyle: 'short' });
  },
  status(msg) { document.getElementById('status-msg').textContent = msg; },
};

window.addEventListener('DOMContentLoaded', App.start);
