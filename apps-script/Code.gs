// Backend del gestor de roadmap: Apps Script que lee y escribe la hoja de Google Sheets.
// Se despliega como aplicación web. Propiedades del script (Configuración del proyecto):
//   SHEET_ID     ID de la hoja (el tramo largo de la URL entre /d/ y /edit)
//   SHEET_NAME   nombre de la pestaña (por defecto «roadmap»)
//   TEAM_KEY     clave del equipo (leer y crear)
//   CLIENT_KEYS  JSON con una clave por cliente, ej. {"Intermundial":"clave-larga"}
//
// Las columnas se localizan por el nombre de la cabecera, en cualquier orden.
// Obligatorias: Iniciativa, Proyecto, Área, Tamaño. Opcionales: Cliente, Estado, Nota, Creada.

const DEFAULT_SHEET_NAME = 'roadmap';
const REQUIRED = ['Iniciativa', 'Proyecto', 'Área', 'Tamaño'];
const AREAS = ['Producto', 'Diseño'];
const ESTADOS = ['Ongoing', 'Next', 'Pasada'];
const TAMANOS = ['small', 'medium', 'large', 'TBD', 'Incluido'];

// Todas las peticiones son POST con cuerpo JSON en text/plain (evita el preflight CORS).
function doPost(e) {
  try {
    const req = JSON.parse(e.postData.contents);
    switch (req.action) {
      case 'list':
        requireTeam_(req.key);
        return out_(listTasks_());
      case 'create':
        requireTeam_(req.key);
        return out_(createTask_(req.task || {}));
      case 'client':
        requireClient_(req.client, req.key);
        return out_(listTasks_(req.client));
      default:
        throw fail_(400, 'Acción no válida');
    }
  } catch (err) {
    return out_({ error: err.status ? err.message : 'Error interno', status: err.status || 500 });
  }
}

function doGet() {
  return out_({ ok: true });
}

// ---------- Auth ----------

function requireTeam_(key) {
  const expected = PropertiesService.getScriptProperties().getProperty('TEAM_KEY');
  if (!expected || !safeEqual_(String(key || ''), expected)) throw fail_(401, 'Clave de equipo incorrecta');
}

function requireClient_(client, key) {
  let map = {};
  try {
    map = JSON.parse(PropertiesService.getScriptProperties().getProperty('CLIENT_KEYS') || '{}');
  } catch (e) {}
  const expected = Object.prototype.hasOwnProperty.call(map, client) ? map[client] : null;
  if (!client || !expected || !safeEqual_(String(key || ''), String(expected))) throw fail_(401, 'Acceso no autorizado');
}

function safeEqual_(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ---------- Hoja ----------

function sheet_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('SHEET_ID');
  const name = props.getProperty('SHEET_NAME') || DEFAULT_SHEET_NAME;
  const ss = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss && ss.getSheetByName(name);
  if (!sheet) throw fail_(500, 'No se encuentra la pestaña «' + name + '»');
  return sheet;
}

// Devuelve { head, idx } con la posición (0-based) de cada columna por nombre.
function columns_(head) {
  const idx = {};
  head.forEach((h, i) => {
    idx[String(h).trim()] = i;
  });
  REQUIRED.forEach((h) => {
    if (idx[h] === undefined) throw fail_(500, 'Falta la columna «' + h + '» en la hoja');
  });
  return idx;
}

function listTasks_(client) {
  const values = sheet_().getDataRange().getValues();
  const idx = columns_(values.shift());
  const get = (r, h) => (idx[h] === undefined ? '' : String(r[idx[h]] == null ? '' : r[idx[h]]).trim());
  // Sin columna Cliente, todas las filas pertenecen al único cliente de la hoja.
  const filterByClient = client && idx['Cliente'] !== undefined;
  return values
    .map((r, i) => ({
      id: String(i + 2), // nº de fila en la hoja
      iniciativa: get(r, 'Iniciativa'),
      cliente: get(r, 'Cliente'),
      proyecto: get(r, 'Proyecto'),
      area: get(r, 'Área'),
      estado: get(r, 'Estado'),
      tamano: get(r, 'Tamaño'),
      nota: get(r, 'Nota'),
    }))
    .filter((t) => t.iniciativa && (!filterByClient || t.cliente === client));
}

function createTask_(t) {
  const iniciativa = str_(t.iniciativa, 200);
  const proyecto = str_(t.proyecto, 100);
  const estado = str_(t.estado, 50);
  if (!iniciativa) throw fail_(400, 'La iniciativa necesita un nombre');
  if (!proyecto) throw fail_(400, 'Falta el proyecto');
  if (AREAS.indexOf(t.area) < 0) throw fail_(400, 'Área no válida');
  if (estado && ESTADOS.indexOf(estado) < 0) throw fail_(400, 'Estado no válido');
  if (TAMANOS.indexOf(t.tamano) < 0) throw fail_(400, 'Tamaño no válido');

  const byHeader = {
    Iniciativa: iniciativa,
    Cliente: str_(t.cliente, 100),
    Proyecto: proyecto,
    Área: t.area,
    Estado: estado,
    Tamaño: t.tamano,
    Nota: str_(t.nota, 1900),
    Creada: new Date().toISOString(),
  };
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = sheet_();
    const head = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map((h) => String(h).trim());
    columns_(head);
    const row = head.map((h) => (byHeader[h] === undefined ? '' : safe_(byHeader[h])));
    sheet.appendRow(row);
    return { id: String(sheet.getLastRow()), iniciativa, proyecto, area: t.area, estado, tamano: t.tamano };
  } finally {
    lock.releaseLock();
  }
}

// ---------- Utilidades ----------

function str_(v, max) {
  return String(v == null ? '' : v).trim().slice(0, max);
}

// Evita que un texto que empiece por = + - @ se interprete como fórmula.
function safe_(v) {
  return typeof v === 'string' && /^[=+\-@]/.test(v) ? "'" + v : v;
}

function fail_(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

function out_(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
