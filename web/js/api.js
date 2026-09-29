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

// Apps Script no admite cabeceras personalizadas ni preflight CORS:
// todo va por POST con cuerpo JSON como text/plain, y los errores llegan en el JSON.
async function call(payload) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({ error: `Error ${res.status}`, status: res.status }));
  if (data && data.error) {
    const err = new Error(data.error);
    err.status = data.status || res.status;
    throw err;
  }
  return data;
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
    const res = await fetch(SHEET_CSV_URL);
    if (!res.ok) throw new Error('http ' + res.status);
    text = await res.text();
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
  for (const h of ['Iniciativa', 'Proyecto', 'Área', 'Tamaño'])
    if (col(h) < 0) throw new Error(`Falta la columna «${h}» en la hoja`);
  const byClient = client && col('Cliente') >= 0;
  return rows
    .map((r, i) => ({
      id: String(i + 2), iniciativa: get(r, 'Iniciativa'), cliente: get(r, 'Cliente'), proyecto: get(r, 'Proyecto'),
      area: get(r, 'Área'), estado: get(r, 'Estado'), tamano: get(r, 'Tamaño'), nota: get(r, 'Nota'),
    }))
    .filter((t) => t.iniciativa && (!byClient || t.cliente === client));
}

const getTasks = () => (directMode ? readSheet() : call({ action: 'list', key: teamKey.get() }));

const createTask = (task) => {
  if (directMode) throw new Error('El backend aún no está desplegado: por ahora el dashboard es de solo lectura.');
  return call({ action: 'create', key: teamKey.get(), task });
};

const getClientTasks = (client, key) =>
  directMode ? readSheet(client) : call({ action: 'client', client, key });
