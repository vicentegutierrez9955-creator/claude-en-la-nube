// Modo vista: el panel se puede mirar sin clave; para cambiar datos se entra con la clave del equipo.
const usuario = document.getElementById('usuario');
const salir = document.getElementById('salir');
const marcar = () => {
  const vista = !usuario.textContent.trim() || usuario.textContent === 'Modo vista';
  if (vista && usuario.textContent !== 'Modo vista') usuario.textContent = 'Modo vista';
  const texto = vista ? 'Entrar para editar' : 'Salir';
  if (salir.textContent !== texto) salir.textContent = texto;
};
new MutationObserver(marcar).observe(usuario, { childList: true, characterData: true, subtree: true });
marcar();
document.getElementById('solo-ver')?.addEventListener('click', () => location.reload());
