// Acceso a los datos. Script clásico (sin módulos) para que funcione también abriendo el HTML con doble clic.
const directMode = !API_URL || API_URL.includes('TU_ID_DE_DESPLIEGUE');

const store = {
  get: (k) => {
    try {
      return localStorage.getItem(k) || '';
    } catch {
      return '';
    }
  },
  set: (k, v) => {
    try {
      localStorage.setItem(k, v);
    } catch {}
  },
};

const teamKey = {
  get: () => store.get('teamKey'),
  set: (v) => store.set('teamKey', v),
};

// Copia local de los últimos datos leídos, para mostrarlos al instante mientras Apps Script responde
// (tarda de 3 a 10 s y a veces mucho más).
const dataCache = {
  get(name) {
    try {
      const v = JSON.parse(localStorage.getItem('cache:' + name));
      return v && v.t && v.data ? v : null;
    } catch {
      return null;
    }
  },
  set(name, data) {
    try {
      localStorage.setItem('cache:' + name, JSON.stringify({ t: Date.now(), data }));
    } catch {}
  },
  clear(name) {
    try {
      localStorage.removeItem('cache:' + name);
    } catch {}
  },
};

const TIMEOUT_MS = 20000;

// Apps Script no admite cabeceras personalizadas ni preflight CORS:
// todo va por POST con cuerpo JSON como text/plain, y los errores llegan en el JSON.
// Las lecturas (retry) se reintentan una vez si se agota el tiempo o falla la red; las escrituras nunca,
// para no guardar la misma tarea dos veces.
async function call(payload, { retry = false } = {}) {
  for (let attempt = 0; ; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      });
      const data = await res.json().catch(() => ({ error: `Error ${res.status}`, status: res.status }));
      if (data && data.error) {
        const err = new Error(data.error);
        err.status = data.status || res.status;
        throw err;
      }
      return data;
    } catch (e) {
      const transient = e.name === 'AbortError' || e instanceof TypeError;
      if (transient && retry && attempt === 0) continue;
      if (e.name === 'AbortError') {
        throw new Error(retry
          ? 'El servidor tarda demasiado en responder. Inténtalo de nuevo en unos segundos.'
          : 'El servidor tarda demasiado en responder. Puede que la tarea sí se haya guardado: revisa la hoja antes de reintentar.');
      }
      if (e instanceof TypeError) throw new Error('No se pudo conectar con el servidor. Comprueba tu conexión.');
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }
}

// --- Modo lectura directa: CSV de la hoja -> mismas tareas que devuelve el Apps Script ---
function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (ch !== '\r') cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

// Origen de los datos en modo lectura directa, para avisar al usuario.
let dataNote = '';

async function readSheet(client) {
  let text;
  try {
    // Sin caché (ni del navegador ni intermedia) para ver siempre lo último que hay en la hoja; 10 s máximo.
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);
    try {
      const res = await fetch(`${SHEET_CSV_URL}&_=${Date.now()}`, { cache: 'no-store', signal: ctrl.signal });
      if (!res.ok) throw new Error('http ' + res.status);
      text = await res.text();
    } finally {
      clearTimeout(timer);
    }
    dataNote = 'Modo lectura directa desde la hoja de Google Sheets (backend sin desplegar).';
  } catch (e) {
    // Sin red hacia Google (p. ej. HTML abierto con doble clic): se usa la copia local.
    if (typeof SNAPSHOT === 'undefined') throw new Error('No se puede leer la hoja (¿está compartida con «cualquiera con el enlace»?)');
    dataNote = `Copia local de la hoja del ${SNAPSHOT.fecha}. Sirve la carpeta web con «npx serve web» para ver datos en vivo.`;
    return SNAPSHOT.tasks.filter((t) => !client || !SNAPSHOT.tasks.some((x) => x.cliente) || t.cliente === client);
  }
  const rows = parseCsv(text);
  const head = rows.shift().map((h) => h.trim());
  const col = (name) => head.indexOf(name);
  const get = (r, name) => (col(name) < 0 ? '' : (r[col(name)] || '').trim());
  // La columna del título puede llamarse «Tarea» o «Iniciativa» (nombre anterior).
  const titleCol = col('Tarea') >= 0 ? 'Tarea' : 'Iniciativa';
  if (col(titleCol) < 0) throw new Error('Falta la columna «Tarea» en la hoja');
  for (const h of ['Proyecto', 'Área', 'Tamaño'])
    if (col(h) < 0) throw new Error(`Falta la columna «${h}» en la hoja`);
  const byClient = client && col('Cliente') >= 0;
  return rows
    .map((r, i) => ({
      id: String(i + 2), iniciativa: get(r, titleCol), cliente: get(r, 'Cliente'), proyecto: get(r, 'Proyecto'),
      area: get(r, 'Área'), estado: get(r, 'Estado'), tamano: get(r, 'Tamaño'), nota: get(r, 'Nota'),
      fecha: get(r, 'Fecha') || get(r, 'Creada'), // «Fecha» si la fila la tiene; si no, «Creada»
    }))
    .filter((t) => t.iniciativa && (!byClient || t.cliente === client));
}

const getTasks = () => (directMode ? readSheet() : call({ action: 'list', key: teamKey.get() }, { retry: true }));
// (getTasks siempre lee por el Apps Script salvo en modo sin backend)

// Lectura de la tabla del equipo: directa desde la hoja (rápida, ~0,5 s). Si la hoja no es pública o no
// responde, se usa el Apps Script (más lento, pero funciona con la hoja privada).
// dataSource indica de dónde salieron los últimos datos: 'hoja' (lectura directa) o 'apps-script' (respaldo).
let dataSource = '';
async function getSheetTasks() {
  try {
    const tasks = await readSheet();
    dataSource = 'hoja';
    return tasks;
  } catch (e) {
    if (directMode) throw e;
    const tasks = await getTasks();
    dataSource = 'apps-script';
    return tasks;
  }
}

const createTask = (task) => {
  if (directMode) throw new Error('El backend aún no está desplegado: por ahora el dashboard es de solo lectura.');
  return call({ action: 'create', key: teamKey.get(), task });
};

// Cambia campos de una fila existente (por ahora solo el estado). `iniciativa` (el título de la tarea) sirve al servidor para comprobar
// que la fila sigue siendo la misma. Nunca se reintenta: es una escritura.
const updateTask = (id, iniciativa, changes) => {
  if (directMode) throw new Error('El backend aún no está desplegado: por ahora la tabla es de solo lectura.');
  return call({ action: 'update', key: teamKey.get(), id, iniciativa, changes });
};

// Borra una fila de la hoja (`iniciativa` sirve al servidor para comprobar que sigue siendo la misma). Nunca se reintenta.
const deleteTask = (id, iniciativa) => {
  if (directMode) throw new Error('El backend aún no está desplegado: por ahora la tabla es de solo lectura.');
  return call({ action: 'delete', key: teamKey.get(), id, iniciativa });
};

const getClientTasks = (client, key) =>
  directMode ? readSheet(client) : call({ action: 'client', client, key }, { retry: true });
