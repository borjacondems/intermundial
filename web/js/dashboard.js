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
const AREAS = ['Producto', 'Diseño'];
// Colores de las áreas tomados de los tokens CSS: Producto = semantic-primary, Diseño = content-high.
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const areaColor = (a) => css(a === 'Producto' ? '--semantic-primary' : '--content-high');
// Tono por tamaño dentro de cada área (XL más oscuro).
const SHADE = { XL: 1, L: 0.82, M: 0.64, S: 0.48, XS: 0.34 };

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

// «1XL · 2L · 4M»: tareas por tamaño, de mayor a menor.
function sizeText(size) {
  return [...SIZES].reverse().filter((k) => size[k]).map((k) => `${size[k]}${k}`).join(' · ') || '–';
}

// Barra por área: un tramo por tamaño, de ancho proporcional a sus puntos. El texto solo se escribe en los tramos
// anchos (≥ 34 % de la barra); en los estrechos queda el título al pasar el ratón y el desglose de la derecha.
function segBar(area, size, maxPts) {
  const segs = [...SIZES].reverse()
    .filter((k) => size[k])
    .map((k) => {
      const points = size[k] * PTS[k];
      const share = points / maxPts;
      return `<span style="width:${share * 100}%;background:${areaColor(area)};opacity:${SHADE[k]}" title="${size[k]} × ${k} · ${points} pts">${share >= 0.34 ? size[k] + k : ''}</span>`;
    })
    .join('');
  return `<div class="seg">${segs}</div>`;
}

function projectCard(name, tasks, maxPts) {
  const s = summarize(tasks.filter((t) => t.proyecto === name));
  const line = (a) => {
    const x = s.area[a];
    return `<div class="area-row"><div class="area-name" style="color:${areaColor(a)}">${a}</div>
      ${segBar(a, x.size, maxPts)}
      <div class="area-num"><b>${x.pts} pts</b><small>${nTareas(x.n)} · ${sizeText(x.size)}</small></div></div>`;
  };
  return `<div class="card proj"><h2>${esc(name)}</h2>
    <div class="split"><span>Tareas · Producto ${pct(s.area.Producto.n, s.n)}% · Diseño ${pct(s.area.Diseño.n, s.n)}%</span>
    <span>Esfuerzo · Producto ${pct(s.area.Producto.pts, s.pts)}% · Diseño ${pct(s.area.Diseño.pts, s.pts)}%</span></div>
    ${AREAS.map(line).join('')}</div>`;
}

const charts = {};
function stacked(id, labels, byArea, horizontal) {
  charts[id]?.destroy();
  charts[id] = new Chart(document.getElementById(id), {
    type: 'bar',
    data: {
      labels,
      datasets: AREAS.map((a) => ({ label: a, data: byArea[a], backgroundColor: areaColor(a), borderRadius: 3 })),
    },
    options: {
      maintainAspectRatio: false,
      indexAxis: horizontal ? 'y' : 'x',
      plugins: { legend: { position: 'bottom' } },
      scales: { x: { stacked: true, ticks: { precision: 0 } }, y: { stacked: true, ticks: { precision: 0 } } },
    },
  });
}

const TEMPLATE = (internal) => `
  <p id="err" class="msg err" hidden></p>
  <p class="note" id="direct" hidden></p>
  <p class="note" id="status" role="status" hidden></p>
  <p class="print-only" id="filtros-impresos"></p>
  <p class="note">Puntos de esfuerzo por tamaño: XS = 1 · S = 2 · M = 8 · L = 16 · XL = 32. No se cuentan las tareas TBD ni «Todo lo pasado de Producto».</p>
  <div class="filters" id="filters">
    <div id="w-desde"><label for="f-desde">Desde</label><select id="f-desde"></select></div>
    <div id="w-hasta"><label for="f-hasta">Hasta</label><select id="f-hasta"></select></div>
    <div id="w-estado"><label for="f-estado">Estado</label><select id="f-estado"></select></div>
  </div>
  <div class="grid kpis">
    <div class="card kpi"><div class="v" id="k-n">–</div><div class="l">Tareas</div></div>
    <div class="card kpi"><div class="v" id="k-pts">–</div><div class="l">Puntos de esfuerzo</div></div>
    <div class="card kpi"><div class="v" id="k-prod">–</div><div class="l" id="l-prod">Producto</div></div>
    <div class="card kpi"><div class="v" id="k-dis">–</div><div class="l" id="l-dis">Diseño</div></div>
  </div>
  <h2 class="sec">Esfuerzo por proyecto</h2>
  <div class="grid projs" id="projs"></div>
  <div class="grid charts">
    <div class="card"><h2>Puntos por proyecto</h2><div class="chart-box"><canvas id="c-pts"></canvas></div></div>
    <div class="card"><h2>Tareas por proyecto</h2><div class="chart-box"><canvas id="c-n"></canvas></div></div>
    <div class="card" id="card-estado"><h2>Tareas por estado</h2><div class="chart-box"><canvas id="c-estado"></canvas></div></div>
    <div class="card"><h2>Tareas por tamaño</h2><div class="chart-box"><canvas id="c-tamano"></canvas></div></div>
  </div>
  <h2 class="sec">Detalle de tareas</h2>
  <div id="detail"></div>`;

// Filtro global del dashboard: solo el estado (y solo si la hoja lo rellena). Por proyecto se filtra con las etiquetas de la tabla.
const FILTERS = [['f-estado', 'estado']];

function showError(msg) {
  const el = document.getElementById('err');
  el.hidden = false;
  el.textContent = msg;
}

// Fila de la tabla de tareas (la usan el dashboard y la pestaña «Tareas» del formulario).
// Con { statusOptions } el estado es un selector editable (pestaña «Tareas» del equipo); sin él, una etiqueta.
function taskRow(t, { statusOptions = null, disabled = false } = {}) {
  const dot = AREAS.includes(t.area) ? areaColor(t.area) : css('--content-low');
  const estado = statusOptions
    ? `<select class="status ${t.estado ? slug(t.estado) : 'sin-estado'}" data-id="${esc(t.id)}" aria-label="Estado de «${esc(t.iniciativa)}»"${disabled ? ' disabled' : ''}>` +
      ['', ...statusOptions].map((o) => `<option value="${esc(o)}"${o === t.estado ? ' selected' : ''}>${o ? esc(o) : 'Sin estado'}</option>`).join('') +
      '</select>'
    : t.estado ? `<span class="tag ${slug(t.estado)}">${esc(t.estado)}</span>` : '–';
  return `<tr${counted(t) ? '' : ' class="dim"'}><td>${esc(t.proyecto)}</td><td><span class="dot" style="background:${dot}"></span>${esc(t.area)}</td>` +
    `<td>${estado}</td><td>${esc(t.iniciativa)}</td><td>${esc(normSize(t.tamano))}</td>` +
    `<td class="n">${counted(t) ? pts(t) : '–'}</td><td>${esc(t.nota)}</td></tr>`;
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
function mount(root, initial, { internal = false } = {}) {
  let all = prepare(initial);
  root.innerHTML = TEMPLATE(internal);
  // Tabla de tareas con etiquetas por proyecto y contador. Recibe las tareas que dejan pasar los filtros de arriba.
  const detail = TaskTable.init(root.querySelector('#detail'), { projects: () => projects(all), emptyText: 'No hay tareas con los filtros elegidos.' });
  const $ = (id) => document.getElementById(id);
  // Gráficos con la tipografía y los colores del Design System (low/xs, content-mid, stroke-low).
  Chart.defaults.font.family = css('--font-text');
  Chart.defaults.font.size = 12;
  Chart.defaults.color = css('--content-mid');
  Chart.defaults.borderColor = css('--stroke-low');
  $('direct').hidden = !directMode;
  $('direct').textContent = dataNote;

  // Periodo: selectores «Desde» y «Hasta» (de mes a mes). Mientras no se toquen siguen el rango completo de los datos,
  // así un mes nuevo entra solo; si se han tocado, la selección se conserva mientras siga siendo válida.
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
    const hasDates = buildPeriod();
    // Si la hoja no rellena Estado, se ocultan su filtro y su gráfico.
    const hasEstado = all.some((t) => t.estado);
    $('w-estado').hidden = !hasEstado;
    $('filters').hidden = !hasEstado && !hasDates; // sin ningún filtro disponible se oculta también la barra
    $('card-estado').hidden = !hasEstado;
    for (const [id, key] of FILTERS) {
      const prev = $(id).value;
      const vals = [...new Set(all.map((t) => t[key]).filter(Boolean))];
      $(id).innerHTML = '<option value="">Todos</option>' + vals.map((v) => `<option>${esc(v)}</option>`).join('');
      if (vals.includes(prev)) $(id).value = prev;
      $(id).onchange = () => update(true); // otro filtro: la tabla vuelve a la página 1
    }
  }

  function update(resetPage = false) {
    const hasEstado = all.some((t) => t.estado);
    const f = Object.fromEntries(FILTERS.map(([id, key]) => [key, $(id).value]));
    const tasks = all.filter((t) => Object.entries(f).every(([k, v]) => !v || t[k] === v) && enPeriodo(t));
    const s = summarize(tasks);

    // Al imprimir la barra de filtros no sale: esta línea (visible solo en papel/PDF) indica qué periodo y estado se ven.
    const { desde, hasta } = periodo();
    const partes = [];
    if (desde) partes.push(`Periodo: ${monthLabel(desde)}${hasta !== desde ? ' – ' + monthLabel(hasta) : ''}`);
    if (f.estado) partes.push(`Estado: ${f.estado}`);
    $('filtros-impresos').textContent = partes.join(' · ');

    $('k-n').textContent = s.n;
    $('k-pts').textContent = s.pts;
    for (const [id, lid, a] of [['k-prod', 'l-prod', 'Producto'], ['k-dis', 'l-dis', 'Diseño']]) {
      $(id).textContent = pct(s.area[a].pts, s.pts) + '%';
      $(lid).textContent = `${a} · ${s.area[a].pts} pts · ${nTareas(s.area[a].n)}`;
    }

    const names = projects(tasks);
    const perProject = names.map((n) => summarize(tasks.filter((t) => t.proyecto === n)));
    const maxPts = Math.max(1, ...perProject.flatMap((p) => AREAS.map((a) => p.area[a].pts)));
    $('projs').innerHTML = names.map((n) => projectCard(n, tasks, maxPts)).join('');

    stacked('c-pts', names, Object.fromEntries(AREAS.map((a) => [a, perProject.map((p) => p.area[a].pts)])), true);
    stacked('c-n', names, Object.fromEntries(AREAS.map((a) => [a, perProject.map((p) => p.area[a].n)])), true);

    const estados = [...new Set(tasks.map((t) => t.estado || 'Sin estado'))];
    const count = (pred) => tasks.filter((t) => counted(t) && pred(t)).length;
    if (hasEstado) stacked('c-estado', estados, Object.fromEntries(AREAS.map((a) => [a, estados.map((e) => count((t) => (t.estado || 'Sin estado') === e && t.area === a))])));
    const sizes = SIZES;
    stacked('c-tamano', sizes, Object.fromEntries(AREAS.map((a) => [a, sizes.map((z) => count((t) => t.tamano === z && t.area === a))])));

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
