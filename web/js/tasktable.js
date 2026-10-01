// Tabla de tareas con etiquetas de filtro por proyecto y contador de las que se están viendo.
// La comparten index.html (con el estado editable) y dashboard.html (solo lectura): una única implementación.
// Pagina las filas (20 por página). Depende de dashboard.js (prepare, taskRow).
const TaskTable = {
  // root: elemento donde se monta. Opciones:
  //   projects:   lista de proyectos para las etiquetas, o función (todas las tareas) => lista
  //   rowOptions: opciones de taskRow; con { statusOptions } el estado es un selector editable
  //   onChange:   ({ total, visible, shown }) => void, tras cada pintado
  //   pageSize:   filas por página (20 por defecto)
  // Devuelve { setTasks(tareas, { keepPage }), tasks(), paint() }.
  init(root, { projects = [], rowOptions = {}, onChange = () => {}, pageSize = 20 } = {}) {
    root.innerHTML = `
      <div class="filterbar">
        <div class="chips" id="chips" role="group" aria-label="Filtrar por proyecto"></div>
        <div class="showing">
          <span id="showing" role="status" aria-live="polite"></span>
          <button type="button" class="linkbtn" id="clear" hidden>Quitar filtros</button>
        </div>
      </div>
      <section class="card">
        <p class="msg err" id="table-msg" role="status" hidden></p>
        <p class="note" id="source" hidden></p>
        <div class="table-wrap">
          <table class="tasks">
            <thead><tr><th>Proyecto</th><th>Área</th><th>Estado</th><th>Tarea</th><th>Tamaño</th><th class="n">Pts</th><th>Nota</th></tr></thead>
            <tbody id="rows"></tbody>
          </table>
        </div>
        <nav class="pager" id="pager" aria-label="Paginación" hidden>
          <span id="page-info"></span>
          <div class="pages" id="pages"></div>
        </nav>
      </section>`;
    const $ = (id) => root.querySelector('#' + id);

    let all = [];
    let names = [];
    const selected = new Set(); // etiquetas activas; sin ninguna se ven todas, y se pueden combinar
    let page = 1;
    let printing = false;       // al imprimir se muestran todas las filas, no solo la página actual

    // Las etiquetas se reconstruyen solo si cambia la lista de proyectos.
    function buildChips() {
      const next = typeof projects === 'function' ? projects(all) : projects;
      if (next.join('\u0000') === names.join('\u0000')) return;
      names = next;
      for (const name of [...selected]) if (!names.includes(name)) selected.delete(name);
      $('chips').replaceChildren(...names.map((name) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'chip';
        b.dataset.proyecto = name;
        b.textContent = name;
        b.onclick = () => { selected.has(name) ? selected.delete(name) : selected.add(name); page = 1; paint(); };
        return b;
      }));
    }

    $('clear').onclick = () => { selected.clear(); page = 1; paint(); };

    // Páginas a mostrar en el paginador: la primera, la última y las cercanas a la actual, con «…» en los huecos.
    function pageItems(cur, n) {
      if (n <= 7) return Array.from({ length: n }, (_, i) => i + 1);
      const set = new Set([1, n]);
      for (let p = cur - 1; p <= cur + 1; p++) if (p >= 1 && p <= n) set.add(p);
      if (cur <= 3) [2, 3, 4].forEach((p) => set.add(p));
      if (cur >= n - 2) [n - 1, n - 2, n - 3].forEach((p) => set.add(p));
      const out = [];
      let prev = 0;
      for (const p of [...set].sort((a, b) => a - b)) {
        if (p - prev > 1) out.push('…');
        out.push(p);
        prev = p;
      }
      return out;
    }

    function goTo(p) {
      page = p;
      paint();
      // Si el principio de la tabla ha quedado fuera de pantalla (se pulsó el paginador al final), se vuelve a él.
      const card = root.querySelector('.card');
      if (card.getBoundingClientRect().top < 0) card.scrollIntoView({ block: 'start' });
    }

    function paintPager(pages) {
      const pager = $('pager');
      pager.hidden = pages <= 1 || printing;
      if (pager.hidden) return;
      $('page-info').textContent = `Página ${page} de ${pages}`;
      const btn = (label, target, { current = false, disabled = false, aria } = {}) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'page';
        b.textContent = label;
        if (aria) b.setAttribute('aria-label', aria);
        if (current) b.setAttribute('aria-current', 'page');
        b.disabled = disabled;
        if (!disabled && !current) b.onclick = () => goTo(target);
        return b;
      };
      const gap = () => Object.assign(document.createElement('span'), { className: 'gap', textContent: '…' });
      $('pages').replaceChildren(
        btn('Anterior', page - 1, { disabled: page === 1, aria: 'Página anterior' }),
        ...pageItems(page, pages).map((p) => (p === '…' ? gap() : btn(String(p), p, { current: p === page, aria: `Página ${p}` }))),
        btn('Siguiente', page + 1, { disabled: page === pages, aria: 'Página siguiente' }),
      );
    }

    // Dibuja la tabla, el contador, el paginador y las etiquetas a partir de todas las tareas y del filtro elegido.
    function paint() {
      const filtered = selected.size ? all.filter((t) => selected.has(t.proyecto)) : all;
      const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
      page = Math.min(Math.max(page, 1), pages);                       // si hay menos páginas que antes, se ajusta
      const shownRows = printing ? filtered : filtered.slice((page - 1) * pageSize, page * pageSize);
      $('rows').innerHTML = shownRows.length
        ? shownRows.map((t) => taskRow(t, rowOptions)).join('')
        : `<tr><td colspan="7" class="empty">${all.length ? 'Ninguna tarea coincide con el filtro.' : 'Aún no hay tareas.'}</td></tr>`;
      // Contador: las filas que se ven en pantalla sobre el total de tareas.
      $('showing').textContent = all.length
        ? `Mostrando ${shownRows.length} de ${all.length} ${all.length === 1 ? 'tarea' : 'tareas'}`
        : '';
      $('clear').hidden = !selected.size;
      for (const b of $('chips').children) b.setAttribute('aria-pressed', selected.has(b.dataset.proyecto));
      paintPager(pages);
      onChange({ total: all.length, visible: filtered.length, shown: shownRows.length });
    }

    // Al imprimir (por ejemplo «Imprimir / PDF» del dashboard) salen todas las tareas, no solo la página actual.
    window.addEventListener('beforeprint', () => { printing = true; paint(); });
    window.addEventListener('afterprint', () => { printing = false; paint(); });

    return {
      // keepPage: false al cambiar de filtros (vuelve a la página 1); true (por defecto) al refrescar datos.
      setTasks(tasks, { keepPage = true } = {}) {
        all = prepare(tasks);
        if (!keepPage) page = 1;
        buildChips();
        paint();
        return all;
      },
      tasks: () => all,
      paint,
    };
  },
};
