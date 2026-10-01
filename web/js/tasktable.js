// Tabla de tareas con etiquetas de filtro por proyecto y contador de las que se están viendo.
// La comparten index.html (con el estado editable) y dashboard.html (solo lectura): una única implementación.
// Depende de dashboard.js (prepare, taskRow).
const TaskTable = {
  // root: elemento donde se monta. Opciones:
  //   projects:   lista de proyectos para las etiquetas, o función (todas las tareas) => lista
  //   rowOptions: opciones de taskRow; con { statusOptions } el estado es un selector editable
  //   onChange:   ({ total, visible }) => void, tras cada pintado
  // Devuelve { setTasks(tareas), tasks(), paint() }.
  init(root, { projects = [], rowOptions = {}, onChange = () => {} } = {}) {
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
      </section>`;
    const $ = (id) => root.querySelector('#' + id);

    let all = [];
    let names = [];
    const selected = new Set(); // etiquetas activas; sin ninguna se ven todas, y se pueden combinar

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
        b.onclick = () => { selected.has(name) ? selected.delete(name) : selected.add(name); paint(); };
        return b;
      }));
    }

    $('clear').onclick = () => { selected.clear(); paint(); };

    // Dibuja la tabla, el contador y las etiquetas a partir de todas las tareas y del filtro elegido.
    function paint() {
      const visible = selected.size ? all.filter((t) => selected.has(t.proyecto)) : all;
      $('rows').innerHTML = visible.length
        ? visible.map((t) => taskRow(t, rowOptions)).join('')
        : `<tr><td colspan="7" class="empty">${all.length ? 'Ninguna tarea coincide con el filtro.' : 'Aún no hay tareas.'}</td></tr>`;
      $('showing').textContent = all.length
        ? `Mostrando ${visible.length} de ${all.length} ${all.length === 1 ? 'tarea' : 'tareas'}`
        : '';
      $('clear').hidden = !selected.size;
      for (const b of $('chips').children) b.setAttribute('aria-pressed', selected.has(b.dataset.proyecto));
      onChange({ total: all.length, visible: visible.length });
    }

    return {
      setTasks(tasks) {
        all = prepare(tasks);
        buildChips();
        paint();
        return all;
      },
      tasks: () => all,
      paint,
    };
  },
};
