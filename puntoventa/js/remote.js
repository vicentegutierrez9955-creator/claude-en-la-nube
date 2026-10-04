/* En las cajas, las operaciones que modifican datos se ejecutan en el servidor
   (así todas las computadoras comparten el mismo inventario sin choques). */
'use strict';

[
  'registrarVenta', 'devolver', 'movimientoCaja', 'abrirTurno', 'cerrarTurno', 'abonar',
  'guardarCliente', 'eliminarCliente', 'guardarProducto', 'actualizarVarios', 'eliminarProducto',
  'importarProductos', 'guardarPromocion', 'eliminarPromocion', 'movimientoInventario',
  'guardarUsuario', 'eliminarUsuario', 'guardarDepartamento', 'eliminarDepartamento', 'registrarMerma', 'importarClientes',
].forEach(name => { Store[name] = (...args) => Remote.call(name, args); });

Store.asegurarTurno = async () => { if (!Store.turno) await Store.abrirTurno(0); return Store.turno; };
Store.saveConfig = () => Remote.call('guardarConfig', [Store.config]);
Store.saveTickets = U.debounce(() => { Remote.call('guardarTickets', [Store.tickets]).catch(() => {}); }, 400);
Store.login = async (usuario, password) => {
  Store.user = await Remote.login(usuario, password);
  await Remote.bootstrap();
  Remote.listen();
  return Store.user;
};
Store.load = async () => {
  const info = await Remote.get('/api/info');
  Store.config.negocio.nombre = info.nombre;
  Store.primeraVez = info.primeraVez;
};
