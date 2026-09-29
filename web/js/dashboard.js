// Dashboard del roadmap (solo lectura).
// Esfuerzo: small = 1 pt, medium = 2, large = 3. TBD e "Incluido" no computan.
const PTS = { small: 1, medium: 2, large: 3 };
const SIZE_LABEL = { large: 'L', medium: 'M', small: 'S' };
const AREAS = ['Producto', 'Diseño'];
// Colores de las áreas tomados de los tokens CSS: Producto = semantic-primary, Diseño = content-high.
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const areaColor = (a) => css(a === 'Producto' ? '--semantic-primary' : '--content-high');
// Tono por tamaño dentro de cada área (L más oscuro).
const SHADE = { large: 1, medium: 0.7, small: 0.42 };

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pts = (t) => PTS[t.tamano] || 0;
const counted = (t) => pts(t) > 0;
// Clase CSS a partir del estado: «En curso» -> en-curso.
const slug = (s) => String(s).toLowerCase().replace(/[^a-záéíóúñ0-9]+/g, '-');
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

function summarize(tasks) {
  const rows = tasks.filter(counted);
  const sum = { n: rows.length, pts: rows.reduce((a, t) => a + pts(t), 0), area: {} };
  for (const a of AREAS) {
    const r = rows.filter((t) => t.area === a);
    sum.area[a] = {
      n: r.length,
      pts: r.reduce((s, t) => s + pts(t), 0),
      size: Object.fromEntries(Object.keys(PTS).map((k) => [k, r.filter((t) => t.tamano === k).length])),
    };
  }
  return sum;
}

const projects = (tasks) => [...new Set(tasks.map((t) => t.proyecto).filter(Boolean))];

function sizeText(size) {
  return ['large', 'medium', 'small'].filter((k) => size[k]).map((k) => `${size[k]}${SIZE_LABEL[k]}`).join(' · ') || '–';
}

function segBar(area, size, maxPts) {
  const segs = ['large', 'medium', 'small']
    .filter((k) => size[k])
    .map((k) => {
      const w = ((size[k] * PTS[k]) / maxPts) * 100;
      return `<span style="width:${w}%;background:${areaColor(area)};opacity:${SHADE[k]}" title="${size[k]} ${k}">${size[k]}${SIZE_LABEL[k]}</span>`;
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
      <div class="area-num"><b>${x.pts} pts</b><small>${x.n} tareas · ${sizeText(x.size)}</small></div></div>`;
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
  <p class="note">Esfuerzo: small = 1 pt · medium = 2 pts · large = 3 pts. No se cuentan las iniciativas TBD ni «Todo lo pasado de Producto».</p>
  <div class="filters">
    <div><label for="f-proyecto">Proyecto</label><select id="f-proyecto"></select></div>
    <div><label for="f-area">Área</label><select id="f-area"></select></div>
    <div id="w-estado"><label for="f-estado">Estado</label><select id="f-estado"></select></div>
    <div><label for="f-tamano">Tamaño</label><select id="f-tamano"></select></div>
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
  <div class="card"><h2>Detalle</h2>
    <div class="table-wrap"><table class="tasks"><thead><tr><th>Proyecto</th><th>Área</th><th>Estado</th><th>Iniciativa</th><th>Tamaño</th><th class="n">Pts</th><th>Nota</th></tr></thead><tbody id="rows"></tbody></table></div>
  </div>`;

const FILTERS = [['f-proyecto', 'proyecto'], ['f-area', 'area'], ['f-estado', 'estado'], ['f-tamano', 'tamano']];

function showError(msg) {
  const el = document.getElementById('err');
  el.hidden = false;
  el.textContent = msg;
}

// Fila de la tabla de iniciativas (la usan el dashboard y la pestaña «Iniciativas» del formulario).
function taskRow(t) {
  const dot = AREAS.includes(t.area) ? areaColor(t.area) : css('--content-low');
  return `<tr${counted(t) ? '' : ' class="dim"'}><td>${esc(t.proyecto)}</td><td><span class="dot" style="background:${dot}"></span>${esc(t.area)}</td>` +
    `<td>${t.estado ? `<span class="tag ${slug(t.estado)}">${esc(t.estado)}</span>` : '–'}</td><td>${esc(t.iniciativa)}</td><td>${esc(t.tamano)}</td>` +
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
  let all = initial;
  root.innerHTML = TEMPLATE(internal);
  const $ = (id) => document.getElementById(id);
  // Gráficos con la tipografía y los colores del Design System (low/xs, content-mid, stroke-low).
  Chart.defaults.font.family = css('--font-text');
  Chart.defaults.font.size = 12;
  Chart.defaults.color = css('--content-mid');
  Chart.defaults.borderColor = css('--stroke-low');
  $('direct').hidden = !directMode;
  $('direct').textContent = dataNote;

  // Filtros a partir de los datos actuales, conservando la selección si sigue siendo válida.
  function buildFilters() {
    // Si la hoja no rellena Estado, se ocultan su filtro y su gráfico.
    const hasEstado = all.some((t) => t.estado);
    $('w-estado').hidden = !hasEstado;
    $('card-estado').hidden = !hasEstado;
    for (const [id, key] of FILTERS) {
      const prev = $(id).value;
      const vals = [...new Set(all.map((t) => t[key]).filter(Boolean))];
      $(id).innerHTML = '<option value="">Todos</option>' + vals.map((v) => `<option>${esc(v)}</option>`).join('');
      if (vals.includes(prev)) $(id).value = prev;
      $(id).onchange = update;
    }
  }

  function update() {
    const hasEstado = all.some((t) => t.estado);
    const f = Object.fromEntries(FILTERS.map(([id, key]) => [key, $(id).value]));
    const tasks = all.filter((t) => Object.entries(f).every(([k, v]) => !v || t[k] === v));
    const s = summarize(tasks);

    $('k-n').textContent = s.n;
    $('k-pts').textContent = s.pts;
    for (const [id, lid, a] of [['k-prod', 'l-prod', 'Producto'], ['k-dis', 'l-dis', 'Diseño']]) {
      $(id).textContent = pct(s.area[a].pts, s.pts) + '%';
      $(lid).textContent = `${a} · ${s.area[a].pts} pts · ${s.area[a].n} tareas`;
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
    const sizes = Object.keys(PTS);
    stacked('c-tamano', sizes, Object.fromEntries(AREAS.map((a) => [a, sizes.map((z) => count((t) => t.tamano === z && t.area === a))])));

    $('rows').innerHTML = tasks.map(taskRow).join('');
  }
  buildFilters();
  update();
  return {
    setData(next) {
      all = next;
      buildFilters();
      update();
    },
  };
}
