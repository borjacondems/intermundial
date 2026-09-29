// Overlay de carga que bloquea toda la página (ratón y teclado) mientras hay peticiones en curso.
const Loading = (() => {
  let count = 0;
  let el;

  const blockable = () => document.querySelectorAll('header.top, main');

  function ensure() {
    if (el) return el;
    el = document.createElement('div');
    el.className = 'loading';
    el.hidden = true;
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.innerHTML = '<div class="spinner" aria-hidden="true"></div><p class="loading-msg"></p>';
    document.body.appendChild(el);
    return el;
  }

  return {
    show(msg = 'Cargando…') {
      const box = ensure();
      count++;
      box.querySelector('.loading-msg').textContent = msg;
      box.hidden = false;
      blockable().forEach((n) => { n.inert = true; }); // impide clics, foco y teclado por debajo
      document.body.setAttribute('aria-busy', 'true');
    },
    hide() {
      count = Math.max(0, count - 1);
      if (count > 0) return;
      if (el) el.hidden = true;
      blockable().forEach((n) => { n.inert = false; });
      document.body.removeAttribute('aria-busy');
    },
    // Ejecuta fn() con el overlay activo y lo retira siempre, incluso si falla.
    async wrap(msg, fn) {
      this.show(msg);
      try {
        return await fn();
      } finally {
        this.hide();
      }
    },
  };
})();
