// Tabla de tareas con etiquetas de filtro por proyecto y contador de las que se están viendo.
// La comparten index.html (con el estado editable) y dashboard.html (solo lectura): una única implementación.
// Pagina las filas (20 por página). Depende de dashboard.js (prepare, taskRow).
const TaskTable = {
  // root: elemento donde se monta. Opciones:
  //   projects:   lista de proyectos para las etiquetas, o función (todas las tareas) => lista
  //   groups:     en vez de projects, grupos de etiquetas [{ key: 'area', label: 'Tipo', values: [...] }]; dentro de un grupo solo hay
  //               una activa (excluyentes), entre grupos se suman (y). values puede ser una función (todas las tareas) => lista
  //   rowOptions: opciones de taskRow; con { statusOptions } el estado es un selector editable
  //   onChange:   ({ total, visible, shown }) => void, tras cada pintado
  //   pageSize:   filas por página (20 por defecto)
  //   emptyText:  texto cuando no hay tareas que mostrar
  //   title:      titular opcional (dashboard): barra con titular y contador dentro del recuadro de la tabla
  // Devuelve { setTasks(tareas, { keepPage }), tasks(), paint() }.
  init(root, { projects = [], rowOptions = {}, onChange = () => {}, pageSize = 20, emptyText = 'Aún no hay tareas.', title = '', groups = null } = {}) {
    // Con titular (dashboard) la barra va dentro del recuadro de la tabla; sin él (formulario), encima y fuera.
    const bar = `      <div class="filterbar">
        ${title ? `<h2 class="sec">${title}</h2>` : ''}
        <div class="chips" id="chips" role="group" aria-label="Filtros"></div>
        <div class="showing">
          <span id="showing" role="status" aria-live="polite"></span>
          <button type="button" class="linkbtn" id="clear" hidden>Quitar filtros</button>
        </div>
      </div>`;
    root.innerHTML = `
${title ? '' : bar}      <section class="card">
        ${title ? bar : ''}
        <p class="msg err" id="table-msg" role="status" hidden></p>
        <p class="note" id="source" hidden></p>
        <div class="table-wrap">
          <table class="tasks${rowOptions.deletable ? ' deletable' : ''}">
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
    // Etiquetas de filtro agrupadas: por defecto un solo grupo con los proyectos.
    const getGroups = () => {
      const g = groups ? (typeof groups === 'function' ? groups(all) : groups)
        : [{ key: 'proyecto', label: 'proyecto', values: projects }];
      return g.map((x) => ({ ...x, values: typeof x.values === 'function' ? x.values(all) : x.values }));
    };
    let shape = '';
    const selected = new Map(); // grupo (key) -> etiqueta activa (como mucho una); sin ninguna en un grupo, no filtra por él
    const isOn = (key, v) => selected.get(key)?.has(v);
    const anySelected = () => [...selected.values()].some((set) => set.size);
    let page = 1;
    let printing = false;       // al imprimir se muestran todas las filas, no solo la página actual

    // Las etiquetas se reconstruyen solo si cambian los grupos o sus valores.
    function buildChips() {
      const gs = getGroups();
      const next = JSON.stringify(gs);
      if (next === shape) return;
      shape = next;
      for (const [key, set] of selected) {
        const g = gs.find((x) => x.key === key);
        for (const v of [...set]) if (!g || !g.values.includes(v)) set.delete(v);
      }
      const nodes = [];
      gs.forEach((g, i) => {
        if (i && g.values.length) nodes.push(Object.assign(document.createElement('span'), { className: 'chips-sep', ariaHidden: 'true' }));
        for (const name of g.values) {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'chip';
          b.dataset.key = g.key;
          b.dataset.value = name;
          b.textContent = name;
          b.onclick = () => {
            // Excluyentes dentro de cada grupo: elegir una quita la anterior; volver a pulsarla la desactiva.
            const was = isOn(g.key, name);
            selected.set(g.key, new Set(was ? [] : [name]));
            page = 1;
            paint();
          };
          nodes.push(b);
        }
      });
      $('chips').replaceChildren(...nodes);
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
      const filtered = anySelected() ? all.filter((t) => [...selected].every(([key, set]) => !set.size || set.has(t[key]))) : all;
      const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
      page = Math.min(Math.max(page, 1), pages);                       // si hay menos páginas que antes, se ajusta
      const shownRows = printing ? filtered : filtered.slice((page - 1) * pageSize, page * pageSize);
      $('rows').innerHTML = shownRows.length
        ? shownRows.map((t) => taskRow(t, rowOptions)).join('')
        : `<tr><td colspan="7" class="empty">${all.length ? 'Ninguna tarea coincide con el filtro.' : emptyText}</td></tr>`;
      // Contador: las filas que se ven en pantalla sobre el total de tareas.
      $('showing').textContent = all.length
        ? `Mostrando ${shownRows.length} de ${all.length} ${all.length === 1 ? 'tarea' : 'tareas'}`
        : '';
      $('clear').hidden = !anySelected();
      for (const b of $('chips').querySelectorAll('.chip')) b.setAttribute('aria-pressed', !!isOn(b.dataset.key, b.dataset.value));
      paintPager(pages);
      onChange({ total: all.length, visible: filtered.length, shown: shownRows.length });
    }

    // Al imprimir (por ejemplo «Imprimir / PDF» del dashboard) salen todas las tareas, no solo la página actual.
    window.addEventListener('beforeprint', () => { printing = true; paint(); });
    window.addEventListener('afterprint', () => { printing = false; paint(); });

    return {
      // keepPage: false al cambiar de filtros (vuelve a la página 1); true (por defecto) al refrescar datos.
      setTasks(tasks, { keepPage = true } = {}) {
        all = newestFirst(prepare(tasks)); // las más nuevas primero, para que se vean al entrar
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
