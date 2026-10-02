// Dashboard del roadmap (solo lectura).
// Escala de tamaños, en puntos de esfuerzo: XS = 1 · S = 2 · M = 8 · L = 16 · XL = 32.
// TBD e «Incluido» no puntúan. Debe coincidir con SCALE en apps-script/Code.gs.
const PTS = { XS: 1, S: 2, M: 8, L: 16, XL: 32 };
const SIZES = Object.keys(PTS);                       // de menor a mayor
// Nombres anteriores de los tamaños: se leen como S / M / L hasta que la hoja se migre (setupSheet en Code.gs).
const SIZE_ALIASES = { small: 'S', medium: 'M', large: 'L' };

// Devuelve el tamaño en su forma canónica (XS, S, M, L, XL, TBD, Incluido); lo desconocido se deja como llega.
function normSize(v) {
  const s = String(v == null ? '' : v).trim();
  const low = s.toLowerCase();
  if (SIZE_ALIASES[low]) return SIZE_ALIASES[low];
  const up = s.toUpperCase();
  if (PTS[up]) return up;
  if (low === 'tbd') return 'TBD';
  if (low === 'incluido') return 'Incluido';
  return s;
}
// Copia de las tareas con el tamaño normalizado (también para datos guardados en la caché con nombres antiguos).
const prepare = (tasks) => tasks.map((t) => ({ ...t, tamano: normSize(t.tamano) }));
// Las tareas nuevas primero: el id es el nº de fila de la hoja y las tareas nuevas se añaden al final, así que va de mayor a menor.
const newestFirst = (tasks) => [...tasks].sort((a, b) => (+b.id || 0) - (+a.id || 0));
const AREAS = ['Producto', 'Diseño'];
// Colores de las áreas tomados de los tokens CSS: Producto = semantic-primary, Diseño = content-high.
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const areaColor = (a) => css(a === 'Producto' ? '--semantic-primary' : '--content-high');

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pts = (t) => PTS[normSize(t.tamano)] || 0;
const counted = (t) => pts(t) > 0;
// Clase CSS a partir del estado: «En curso» -> en-curso.
const slug = (s) => String(s).toLowerCase().replace(/[^a-záéíóúñ0-9]+/g, '-');
const nTareas = (n) => `${n} ${n === 1 ? 'tarea' : 'tareas'}`;
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

function summarize(tasks) {
  const rows = tasks.filter(counted);
  const sum = { n: rows.length, pts: rows.reduce((a, t) => a + pts(t), 0), area: {} };
  for (const a of AREAS) {
    const r = rows.filter((t) => t.area === a);
    sum.area[a] = {
      n: r.length,
      pts: r.reduce((s, t) => s + pts(t), 0),
      size: Object.fromEntries(SIZES.map((k) => [k, r.filter((t) => normSize(t.tamano) === k).length])),
    };
  }
  return sum;
}

// ---- Periodos por meses ----
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const ymKey = (y, m) => (m >= 1 && m <= 12 && y >= 1900 ? `${y}-${String(m).padStart(2, '0')}` : '');
const monthLabel = (k) => `${MESES[+k.slice(5) - 1]} ${k.slice(0, 4)}`;

// Mes («AAAA-MM») de una fecha escrita como texto; '' si no se reconoce. Admite ISO (con hora, en horario local),
// AAAA-MM-DD, AAAA-MM y DD/MM/AAAA (día primero, como en una hoja en español; si el segundo número pasa de 12
// se entiende MM/DD/AAAA).
function monthKey(v) {
  const s = String(v == null ? '' : v).trim();
  if (!s) return '';
  let m;
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? '' : ymKey(d.getFullYear(), d.getMonth() + 1);
  }
  if ((m = s.match(/^(\d{4})-(\d{1,2})(?:-\d{1,2})?(?!\d)/))) return ymKey(+m[1], +m[2]);
  if ((m = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})/))) return ymKey(+m[3], +m[2] > 12 ? +m[1] : +m[2]);
  return '';
}

// Meses consecutivos entre dos claves «AAAA-MM» (ambas incluidas).
function monthsBetween(a, b) {
  const out = [];
  let y = +a.slice(0, 4), m = +a.slice(5);
  while (ymKey(y, m) <= b && out.length < 600) {
    out.push(ymKey(y, m));
    if (++m > 12) { m = 1; y++; }
  }
  return out;
}

const projects = (tasks) => [...new Set(tasks.map((t) => t.proyecto).filter(Boolean))];

const charts = {};
// Gráfico de anillo por tipo de tarea (área: Producto / Diseño), con el total en el centro y la leyenda debajo.
// unit: «tarea(s)» o «punto(s)».
function donut(id, values, unit) {
  const color = (a) => (a === 'Diseño' ? css('--surface-blue2') : areaColor(a)); // Diseño = #E0F0FF (token surface-blue2)
  const total = values.reduce((a, b) => a + b, 0);
  const text = (n) => `${n} ${n === 1 ? unit[0] : unit[1]}`;
  charts[id]?.destroy();
  charts[id] = new Chart(document.getElementById(id), {
    type: 'doughnut',
    data: { labels: AREAS, datasets: [{ data: values, backgroundColor: AREAS.map(color), borderColor: css('--surface-default'), borderWidth: 3 }] },
    options: { maintainAspectRatio: false, cutout: '62%', plugins: {
        legend: { display: false },
        // Al pasar el ratón por un tramo: el tipo, su recuento y su porcentaje, en un globo fuera del anillo
        // (hacia el exterior desde el centro) con la flecha apuntando al tramo.
        tooltip: {
          enabled: false,
          external: ({ chart, tooltip }) => {
            let el = document.getElementById('donut-tip');
            if (!el) { el = document.createElement('div'); el.id = 'donut-tip'; el.setAttribute('role', 'tooltip'); document.body.appendChild(el); }
            if (!tooltip.opacity || !tooltip.dataPoints?.length) { el.classList.remove('on'); return; }
            const i = tooltip.dataPoints[0].dataIndex;
            const arc = chart.getDatasetMeta(0).data[i].getProps(['x', 'y', 'startAngle', 'endAngle', 'outerRadius'], true);
            const ang = (arc.startAngle + arc.endAngle) / 2;
            const dx = Math.cos(ang), dy = Math.sin(ang);
            const box = chart.canvas.getBoundingClientRect();
            const gap = 10; // distancia entre el borde del anillo y la flecha
            const x = box.left + arc.x + dx * (arc.outerRadius + gap);
            const y = box.top + arc.y + dy * (arc.outerRadius + gap);
            // El globo se coloca hacia el lado dominante: a la derecha/izquierda del anillo, o encima/debajo.
            const side = Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'right' : 'left') : (dy >= 0 ? 'bottom' : 'top');
            el.className = `donut-tip ${side}`;
            el.innerHTML = `<b><span class="sw" style="background:${color(AREAS[i])}"></span>${AREAS[i]}</b>${text(values[i])} · ${pct(values[i], total)}%`;
            el.style.left = `${x}px`;
            el.style.top = `${y}px`;
            el.classList.add('on');
          },
        },
      },
    },
  });
  document.getElementById(id + '-c').innerHTML = `<b>${total}</b><span>${unit[total === 1 ? 0 : 1]}</span>`;
  document.getElementById(id + '-l').innerHTML = AREAS.map((a, i) =>
    `<div class="lg"><span class="sw" style="background:${color(a)}"></span><div><b>${a} ${pct(values[i], total)}%</b><small>${text(values[i])}</small></div></div>`).join('');
}

// ---- Informe PDF: una sección (una página) por proyecto ----
// Barra proporcional Producto / Diseño con los mismos colores que los anillos.
function shareBar(values) {
  const total = values.reduce((a, b) => a + b, 0) || 1;
  return `<div class="rpt-bar">${AREAS.map((a, i) => `<span style="width:${(values[i] / total) * 100}%;background:${a === 'Diseño' ? css('--surface-blue2') : areaColor(a)}"></span>`).join('')}</div>`;
}

function reportSection(name, tasks, subtitle) {
  const s = summarize(tasks);
  const kpi = (v, l) => `<div class="rpt-kpi"><b>${v}</b><span>${l}</span></div>`;
  const areaRows = AREAS.map((a) =>
    `<tr><td>${a}</td><td class="n">${s.area[a].n}</td><td class="n">${s.area[a].pts}</td><td class="n">${pct(s.area[a].pts, s.pts)}%</td></tr>`).join('');
  const rows = newestFirst(tasks).map((t) =>
    `<tr${counted(t) ? '' : ' class="dim"'}><td>${esc(t.area)}</td><td>${t.estado ? esc(t.estado) : '–'}</td><td>${esc(t.iniciativa)}</td>` +
    `<td>${esc(normSize(t.tamano))}</td><td class="n">${counted(t) ? pts(t) : '–'}</td><td>${esc(t.nota)}</td></tr>`).join('');
  return `<section class="rpt-page">
    <p class="rpt-sub">Dashboard Tareas${subtitle ? ' · ' + esc(subtitle) : ''}</p>
    <h2 class="rpt-title">${esc(name)}</h2>
    <div class="rpt-kpis">${kpi(s.n, 'Tareas')}${kpi(s.pts, 'Puntos de esfuerzo')}${kpi(pct(s.area.Producto.pts, s.pts) + '%', 'Producto')}${kpi(pct(s.area.Diseño.pts, s.pts) + '%', 'Diseño')}</div>
    <h3>Tareas por tipo</h3>${shareBar(AREAS.map((a) => s.area[a].n))}
    <h3>Esfuerzo por tipo</h3>${shareBar(AREAS.map((a) => s.area[a].pts))}
    <table class="rpt-areas"><thead><tr><th>Tipo</th><th class="n">Tareas</th><th class="n">Puntos</th><th class="n">% esfuerzo</th></tr></thead><tbody>${areaRows}</tbody></table>
    <h3>Detalle de tareas</h3>
    <table class="rpt-tasks"><thead><tr><th>Área</th><th>Estado</th><th>Tarea</th><th>Tamaño</th><th class="n">Pts</th><th>Nota</th></tr></thead><tbody>${rows}</tbody></table>
  </section>`;
}

const TEMPLATE = (internal) => `
  <p id="err" class="msg err" hidden></p>
  <p class="note" id="direct" hidden></p>
  <p class="print-only" id="filtros-impresos"></p>
  <div class="tabs proj-tags" id="proj-tags" role="tablist" aria-label="Proyectos"></div>
  <div class="filters" id="filters">
    <div id="w-desde"><label for="f-desde">Desde</label><select id="f-desde"></select></div>
    <div id="w-hasta"><label for="f-hasta">Hasta</label><select id="f-hasta"></select></div>
    <p class="note status" id="status" role="status" hidden></p>
    <div class="actions">
      <button type="button" class="ghost reload" id="reload">Recargar</button>
    </div>
  </div>
  <div class="grid kpis">
    <div class="card kpi"><div class="v" id="k-n">–</div><div class="l">Tareas</div></div>
    <div class="card kpi"><div class="v" id="k-pts">–</div><div class="l">Puntos de esfuerzo</div></div>
    <div class="card kpi"><div class="v" id="k-prod">–</div><div class="l" id="l-prod">Producto</div></div>
    <div class="card kpi"><div class="v" id="k-dis">–</div><div class="l" id="l-dis">Diseño</div></div>
  </div>
  <div class="grid charts">
    <div class="card"><h2>Tareas</h2><div class="donut"><div class="chart-box"><canvas id="c-pie-n"></canvas><div class="donut-center" id="c-pie-n-c"></div></div><div class="legend" id="c-pie-n-l"></div></div></div>
    <div class="card"><h2>Esfuerzo</h2><div class="donut"><div class="chart-box"><canvas id="c-pie-pts"></canvas><div class="donut-center" id="c-pie-pts-c"></div></div><div class="legend" id="c-pie-pts-l"></div></div></div>
  </div>
  <div id="detail" class="detail"></div>
  <div id="print-report" class="print-report"></div>`;

// Filtros globales con selector: ninguno (el periodo y el proyecto tienen los suyos). Se conserva la lista por si se añade alguno.
const FILTERS = [];

function showError(msg) {
  const el = document.getElementById('err');
  el.hidden = false;
  el.textContent = msg;
}

// Fila de la tabla de tareas (la usan el dashboard y la pestaña «Tareas» del formulario).
// Con { statusOptions } el estado es un selector editable (pestaña «Tareas» del equipo); sin él, una etiqueta.
function taskRow(t, { statusOptions = null, disabled = false, deletable = false } = {}) {
  const dot = AREAS.includes(t.area) ? areaColor(t.area) : css('--content-low');
  const estado = statusOptions
    ? `<select class="status ${t.estado ? slug(t.estado) : 'sin-estado'}" data-id="${esc(t.id)}" aria-label="Estado de «${esc(t.iniciativa)}»"${disabled ? ' disabled' : ''}>` +
      ['', ...statusOptions].map((o) => `<option value="${esc(o)}"${o === t.estado ? ' selected' : ''}>${o ? esc(o) : 'Sin estado'}</option>`).join('') +
      '</select>'
    : t.estado ? `<span class="tag ${slug(t.estado)}">${esc(t.estado)}</span>` : '–';
  // Botón de borrar (solo en la tabla del equipo): aparece al pasar el ratón por la fila, al final de la última celda.
  const del = deletable
    ? `<button type="button" class="row-del" data-id="${esc(t.id)}" aria-label="Borrar «${esc(t.iniciativa)}»" title="Borrar tarea"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12M9 7V4h6v3"/></svg></button>`
    : '';
  return `<tr${counted(t) ? '' : ' class="dim"'}><td>${esc(t.proyecto)}</td><td><span class="dot" style="background:${dot}"></span>${esc(t.area)}</td>` +
    `<td>${estado}</td><td>${esc(t.iniciativa)}</td><td>${esc(normSize(t.tamano))}</td>` +
    `<td class="n">${counted(t) ? pts(t) : '–'}</td><td>${esc(t.nota)}${del}</td></tr>`;
}

// Texto de estado bajo el título («Actualizando…», «Datos de las 12:34»).
function setStatus(text) {
  const el = document.getElementById('status');
  if (!el) return;
  el.textContent = text || '';
  el.hidden = !text;
}

const hhmm = (t) => new Date(t).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

// Devuelve { setData(tasks) } para refrescar los datos sin perder los filtros elegidos.
function mount(root, initial, { internal = false, onReload = null } = {}) {
  let all = prepare(initial);
  root.innerHTML = TEMPLATE(internal);
  // Tabla de tareas con etiquetas por proyecto y contador. Recibe las tareas que dejan pasar los filtros de arriba.
  const detail = TaskTable.init(root.querySelector('#detail'), { title: 'Detalle de tareas', groups: [{ key: 'area', values: AREAS }, { key: 'estado', values: ['En curso', 'Bloqueado', 'Hecho'] }], emptyText: 'No hay tareas con los filtros elegidos.' });
  const $ = (id) => document.getElementById(id);
  // Gráficos con la tipografía y los colores del Design System (low/xs, content-mid, stroke-low).
  Chart.defaults.font.family = css('--font-text');
  Chart.defaults.font.size = 12;
  Chart.defaults.color = css('--content-mid');
  Chart.defaults.borderColor = css('--stroke-low');
  $('reload').hidden = !onReload;
  $('reload').onclick = () => onReload();
  // Descargar PDF: se imprime el informe por proyectos (el navegador ofrece «Guardar como PDF»).
  let report = { base: [], filtros: '' };
  $('pdf').hidden = false; // el botón vive junto al título de la página (dashboard.html)
  $('pdf').onclick = () => {
    const names = projects(report.base);
    $('print-report').innerHTML = names.length
      ? names.map((n) => reportSection(n, report.base.filter((t) => t.proyecto === n), report.filtros)).join('')
      : reportSection('Sin proyecto', report.base, report.filtros);
    const title = document.title;
    document.title = `Dashboard Tareas ${new Date().toISOString().slice(0, 10)}`;
    document.body.classList.add('report');
    const done = () => { document.body.classList.remove('report'); document.title = title; window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    window.print();
  };
  $('direct').hidden = !directMode;
  $('direct').textContent = dataNote;

  // Periodo: selectores «Desde» y «Hasta» (de mes a mes). Mientras no se toquen siguen el rango completo de los datos,
  // así un mes nuevo entra solo; si se han tocado, la selección se conserva mientras siga siendo válida.
  let proyecto = '';  // proyecto elegido en las etiquetas de arriba; vacío = Todo
  let touched = false;
  const periodo = () => ({ desde: $('f-desde').value, hasta: $('f-hasta').value });
  // Una tarea sin fecha reconocible no se puede situar en el tiempo: se cuenta siempre.
  const enPeriodo = (t) => {
    const { desde, hasta } = periodo();
    const k = monthKey(t.fecha);
    return !k || !desde || (k >= desde && k <= hasta);
  };

  function buildPeriod() {
    const keys = all.map((t) => monthKey(t.fecha)).filter(Boolean).sort();
    const hasDates = keys.length > 0;
    $('w-desde').hidden = $('w-hasta').hidden = !hasDates;
    if (!hasDates) { $('f-desde').innerHTML = $('f-hasta').innerHTML = ''; return false; }
    const months = monthsBetween(keys[0], keys[keys.length - 1]);
    const options = months.map((k) => `<option value="${k}">${monthLabel(k)}</option>`).join('');
    const prev = periodo();
    $('f-desde').innerHTML = $('f-hasta').innerHTML = options;
    let desde = months[0], hasta = months[months.length - 1];
    if (touched) {
      if (months.includes(prev.desde)) desde = prev.desde;
      if (months.includes(prev.hasta)) hasta = prev.hasta;
      if (desde > hasta) { desde = months[0]; hasta = months[months.length - 1]; }
    }
    $('f-desde').value = desde;
    $('f-hasta').value = hasta;
    $('f-desde').onchange = () => { touched = true; if ($('f-desde').value > $('f-hasta').value) $('f-hasta').value = $('f-desde').value; update(true); };
    $('f-hasta').onchange = () => { touched = true; if ($('f-hasta').value < $('f-desde').value) $('f-desde').value = $('f-hasta').value; update(true); };
    return true;
  }

  // Filtros a partir de los datos actuales, conservando la selección si sigue siendo válida.
  function buildFilters() {
    const names = projects(all);
    if (!names.includes(proyecto)) proyecto = '';
    $('proj-tags').hidden = names.length < 2;
    const tabs = ['', ...names].map((name) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tab';
      b.setAttribute('role', 'tab');
      b.dataset.proyecto = name;
      b.textContent = name || 'Todo';
      return b;
    });
    const select = (name, focus) => {
      proyecto = name;
      for (const t of tabs) {
        const on = t.dataset.proyecto === name;
        t.setAttribute('aria-selected', on);
        t.tabIndex = on ? 0 : -1;
        if (on && focus) t.focus();
      }
      update(true);
    };
    tabs.forEach((t, i) => {
      t.onclick = () => select(t.dataset.proyecto);
      t.onkeydown = (e) => { // flechas, Inicio y Fin, como en la página de tareas
        const next = { ArrowRight: (i + 1) % tabs.length, ArrowLeft: (i - 1 + tabs.length) % tabs.length, Home: 0, End: tabs.length - 1 }[e.key];
        if (next === undefined) return;
        e.preventDefault();
        select(tabs[next].dataset.proyecto, true);
      };
      const on = t.dataset.proyecto === proyecto;
      t.setAttribute('aria-selected', on);
      t.tabIndex = on ? 0 : -1;
    });
    $('proj-tags').replaceChildren(...tabs);
    const hasDates = buildPeriod();
    for (const [id, key] of FILTERS) {
      const prev = $(id).value;
      const vals = [...new Set(all.map((t) => t[key]).filter(Boolean))];
      $(id).innerHTML = '<option value="">Todos</option>' + vals.map((v) => `<option>${esc(v)}</option>`).join('');
      if (vals.includes(prev)) $(id).value = prev;
      $(id).onchange = () => update(true); // otro filtro: la tabla vuelve a la página 1
    }
  }

  function update(resetPage = false) {
    const f = Object.fromEntries(FILTERS.map(([id, key]) => [key, $(id).value]));
    const base = all.filter((t) => Object.entries(f).every(([k, v]) => !v || t[k] === v) && enPeriodo(t)); // periodo y estado
    const tasks = proyecto ? base.filter((t) => t.proyecto === proyecto) : base;
    const s = summarize(tasks);

    // Al imprimir la barra de filtros no sale: esta línea (visible solo en papel/PDF) indica qué periodo y estado se ven.
    const { desde, hasta } = periodo();
    const partes = [];
    if (desde) partes.push(`Periodo: ${monthLabel(desde)}${hasta !== desde ? ' – ' + monthLabel(hasta) : ''}`);
    if (f.estado) partes.push(`Estado: ${f.estado}`);
    report = { base, filtros: partes.join(' · ') };
    if (proyecto) partes.unshift(`Proyecto: ${proyecto}`);
    $('filtros-impresos').textContent = partes.join(' · ');

    $('k-n').textContent = s.n;
    $('k-pts').textContent = s.pts;
    for (const [id, lid, a] of [['k-prod', 'l-prod', 'Producto'], ['k-dis', 'l-dis', 'Diseño']]) {
      $(id).textContent = pct(s.area[a].pts, s.pts) + '%';
      $(lid).textContent = `${a} · ${s.area[a].pts} pts · ${nTareas(s.area[a].n)}`;
    }

    donut('c-pie-n', AREAS.map((a) => s.area[a].n), ['tarea', 'tareas']);
    donut('c-pie-pts', AREAS.map((a) => s.area[a].pts), ['punto', 'puntos']);



    detail.setTasks(tasks, { keepPage: !resetPage }); // misma tabla que en el formulario, sin poder cambiar el estado
  }
  buildFilters();
  update();
  return {
    setData(next) {
      all = prepare(next);
      buildFilters();
      update();
    },
  };
}
