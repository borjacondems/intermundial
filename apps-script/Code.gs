// Backend del gestor de roadmap: Apps Script que lee y escribe la hoja de Google Sheets.
// Se despliega como aplicación web. Propiedades del script (Configuración del proyecto):
//   SHEET_ID     ID de la hoja (el tramo largo de la URL entre /d/ y /edit)
//   SHEET_NAME   nombre de la pestaña (por defecto «roadmap»)
//   TEAM_KEY     clave del equipo (leer y crear)
//   ADMIN_KEY    clave de administrador: vale en las dos páginas (crear/leer y ver el dashboard de cualquier cliente)
//   CLIENT_KEYS  JSON con una clave por cliente, ej. {"Intermundial":"clave-larga"}
//
// Las columnas se localizan por el nombre de la cabecera, en cualquier orden.
// Obligatorias: Tarea (o «Iniciativa», nombre anterior de esa columna), Proyecto, Área, Tamaño.
// Opcionales: Cliente, Estado, Nota, Creada, Puntos (la crea setupSheet) y Fecha.
// Fecha del dashboard (selector de periodo por meses): se usa la columna «Fecha» si existe y, si la fila la tiene
// vacía o no existe la columna, la columna «Creada» (que se rellena sola al guardar una tarea).
//
// Escala de tamaños (puntos de esfuerzo): XS = 1 · S = 2 · M = 8 · L = 16 · XL = 32. TBD e «Incluido» no puntúan.
// Para preparar la hoja con esta escala, ejecuta UNA vez la función setupSheet desde el editor.

// Sube este número al cambiar el código: el GET a la URL /exec lo devuelve y permite comprobar qué versión está desplegada.
const VERSION = 'borrar-2';
const DEFAULT_SHEET_NAME = 'roadmap';
const REQUIRED = ['Proyecto', 'Área', 'Tamaño'];
const AREAS = ['Producto', 'Diseño'];
const ESTADOS = ['En curso', 'Hecho', 'Bloqueado'];
// Escala de tamaños → puntos de esfuerzo. Debe coincidir con PTS en web/js/dashboard.js.
const SCALE = { XS: 1, S: 2, M: 8, L: 16, XL: 32 };
const NO_POINTS = ['TBD', 'Incluido'];
const TAMANOS = Object.keys(SCALE).concat(NO_POINTS);
// Nombres anteriores de los tamaños: se aceptan al guardar y setupSheet los migra en la hoja.
const LEGACY_SIZES = { small: 'S', medium: 'M', large: 'L' };

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
      case 'update':
        requireTeam_(req.key);
        return out_(updateTask_(req.id, req.iniciativa, req.changes || {}));
      case 'delete':
        requireTeam_(req.key);
        return out_(deleteTask_(req.id, req.iniciativa));
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
  return out_({ ok: true, version: VERSION, estados: ESTADOS });
}

// ---------- Auth ----------

function isAdmin_(key) {
  const admin = PropertiesService.getScriptProperties().getProperty('ADMIN_KEY');
  return !!admin && safeEqual_(String(key || ''), admin);
}

function requireTeam_(key) {
  if (isAdmin_(key)) return;
  const expected = PropertiesService.getScriptProperties().getProperty('TEAM_KEY');
  if (!expected || !safeEqual_(String(key || ''), expected)) throw fail_(401, 'Clave de equipo incorrecta');
}

function requireClient_(client, key) {
  if (isAdmin_(key)) return; // el administrador puede ver cualquier cliente, o todos si no indica ninguno
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
  // El título de la tarea puede estar en una columna «Tarea» o «Iniciativa»; idx.title apunta a la que exista.
  idx.title = idx['Tarea'] !== undefined ? idx['Tarea'] : idx['Iniciativa'];
  if (idx.title === undefined) throw fail_(500, 'Falta la columna «Tarea» en la hoja');
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
  // Fecha de la tarea como texto (las celdas con formato de fecha llegan como Date).
  const dateOf = (r) => {
    for (const h of ['Fecha', 'Creada']) {
      if (idx[h] === undefined) continue;
      const v = r[idx[h]];
      if (v instanceof Date) {
        if (!isNaN(v.getTime())) return v.toISOString();
        continue;
      }
      const s = String(v == null ? '' : v).trim();
      if (s) return s;
    }
    return '';
  };
  return values
    .map((r, i) => ({
      id: String(i + 2), // nº de fila en la hoja
      iniciativa: String(r[idx.title] == null ? '' : r[idx.title]).trim(),
      cliente: get(r, 'Cliente'),
      proyecto: get(r, 'Proyecto'),
      area: get(r, 'Área'),
      estado: get(r, 'Estado'),
      tamano: get(r, 'Tamaño'),
      nota: get(r, 'Nota'),
      fecha: dateOf(r),
    }))
    .filter((t) => t.iniciativa && (!filterByClient || t.cliente === client));
}

function createTask_(t) {
  const iniciativa = str_(t.iniciativa, 200);
  const proyecto = str_(t.proyecto, 100);
  const estado = str_(t.estado, 50);
  if (!iniciativa) throw fail_(400, 'La tarea necesita un nombre');
  if (!proyecto) throw fail_(400, 'Falta el proyecto');
  if (AREAS.indexOf(t.area) < 0) throw fail_(400, 'Área no válida');
  if (estado && ESTADOS.indexOf(estado) < 0) throw fail_(400, 'Estado no válido');
  const tamano = normalizeSize_(t.tamano);
  if (!tamano) throw fail_(400, 'Tamaño no válido');

  const byHeader = {
    Tarea: iniciativa, // se escribe en la columna que exista: «Tarea» o «Iniciativa»
    Iniciativa: iniciativa,
    Cliente: str_(t.cliente, 100),
    Proyecto: proyecto,
    Área: t.area,
    Estado: estado,
    Tamaño: tamano,
    Nota: str_(t.nota, 1900),
    Creada: new Date().toISOString(),
  };
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = sheet_();
    const head = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map((h) => String(h).trim());
    const idx = columns_(head);
    const row = head.map((h) => (byHeader[h] === undefined ? '' : safe_(byHeader[h])));
    sheet.appendRow(row);
    const newRow = sheet.getLastRow();
    // Si la hoja tiene la columna «Puntos», la fila nueva lleva su fórmula como las demás.
    if (idx['Puntos'] !== undefined) {
      sheet.getRange(newRow, idx['Puntos'] + 1).setFormula(pointsFormula_(colLetter_(idx['Tamaño'] + 1) + newRow));
    }
    return { id: String(newRow), iniciativa, proyecto, area: t.area, estado, tamano };
  } finally {
    lock.releaseLock();
  }
}

// Cambia el estado de una fila existente. `id` es el nº de fila de la hoja; `iniciativa` es el texto que la página
// tenía para esa fila y sirve de comprobación: si alguien ha insertado, borrado u ordenado filas desde que se cargó
// la tabla, la fila ya no coincide y se rechaza el cambio en lugar de escribir en la fila equivocada.
function updateTask_(id, iniciativa, changes) {
  if (!Object.prototype.hasOwnProperty.call(changes, 'estado')) throw fail_(400, 'No hay nada que actualizar');
  const estado = str_(changes.estado, 50);
  if (estado && ESTADOS.indexOf(estado) < 0) throw fail_(400, 'Estado no válido');
  const row = Number(id);
  if (!Number.isInteger(row) || row < 2) throw fail_(400, 'Fila no válida');

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = sheet_();
    const head = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map((h) => String(h).trim());
    const idx = columns_(head);
    if (idx['Estado'] === undefined) throw fail_(500, 'Falta la columna «Estado» en la hoja');
    const changed = 'La hoja ha cambiado desde que se cargó la tabla. Recarga la página.';
    if (row > sheet.getLastRow()) throw fail_(409, changed);
    const current = String(sheet.getRange(row, idx.title + 1).getValue()).trim();
    if (current !== String(iniciativa == null ? '' : iniciativa).trim()) throw fail_(409, changed);
    sheet.getRange(row, idx['Estado'] + 1).setValue(safe_(estado));
    return { id: String(row), estado };
  } finally {
    lock.releaseLock();
  }
}

// Borra una fila entera. Igual que en updateTask_, `iniciativa` comprueba que la fila sigue siendo la que la página
// mostraba; si no coincide (409) no se borra nada. Al borrar, las filas de debajo suben una posición.
function deleteTask_(id, iniciativa) {
  const row = Number(id);
  if (!Number.isInteger(row) || row < 2) throw fail_(400, 'Fila no válida');

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = sheet_();
    const head = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map((h) => String(h).trim());
    const idx = columns_(head);
    const changed = 'La hoja ha cambiado desde que se cargó la tabla. Recarga la página.';
    if (row > sheet.getLastRow()) throw fail_(409, changed);
    const current = String(sheet.getRange(row, idx.title + 1).getValue()).trim();
    if (current !== String(iniciativa == null ? '' : iniciativa).trim()) throw fail_(409, changed);
    sheet.deleteRow(row);
    return { id: String(row), deleted: true };
  } finally {
    lock.releaseLock();
  }
}

// ---------- Escala de tamaños ----------

// Devuelve el tamaño en su forma canónica (XS, S, M, L, XL, TBD, Incluido) o '' si no se reconoce.
// Acepta mayúsculas/minúsculas y los nombres anteriores small / medium / large.
function normalizeSize_(v) {
  const s = String(v == null ? '' : v).trim();
  const low = s.toLowerCase();
  if (Object.prototype.hasOwnProperty.call(LEGACY_SIZES, low)) return LEGACY_SIZES[low];
  const up = s.toUpperCase();
  if (Object.prototype.hasOwnProperty.call(SCALE, up)) return up;
  if (low === 'tbd') return 'TBD';
  if (low === 'incluido') return 'Incluido';
  return '';
}

// Fórmula de la columna «Puntos» para la celda de tamaño dada (p. ej. D2). Sintaxis en inglés: la exige setFormula.
function pointsFormula_(cell) {
  const pares = Object.keys(SCALE).map((k) => '"' + k + '",' + SCALE[k]).join(',');
  return '=IFERROR(SWITCH(' + cell + ',' + pares + '),0)';
}

function colLetter_(n) {
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

// Prepara la hoja con la escala nueva. Ejecútala UNA vez desde el editor de Apps Script (Ejecutar ▸ setupSheet);
// se puede repetir sin problema. Hace tres cosas:
//   1. Migra los tamaños antiguos de la columna «Tamaño»: small → S, medium → M, large → L (el resto no se toca).
//   2. Pone en esa columna un desplegable con XS, S, M, L, XL, TBD e Incluido (no admite otros valores).
//   3. Crea la columna «Puntos» (si no existe) con la fórmula que convierte cada tamaño en sus puntos.
// Devuelve (y escribe en el registro) un resumen de lo que ha cambiado.
function setupSheet() {
  const sheet = sheet_();
  const head = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map((h) => String(h).trim());
  const idx = columns_(head);
  const tCol = idx['Tamaño'] + 1;
  const rows = Math.max(sheet.getLastRow() - 1, 0);
  const report = { migrados: 0, sinReconocer: [], filas: rows, columnaPuntos: '', avisos: [] };
  // Cada paso es independiente: si la hoja usa una «Tabla» con tipos de columna, Google no deja cambiar la validación o
  // las fórmulas por código («No se puede realizar esta operación en columnas de tipo»). Ese paso se salta y se avisa.
  const step = (nombre, fn) => {
    try { fn(); } catch (e) { report.avisos.push(nombre + ': ' + e.message); }
  };

  step('migrar tamaños', () => {
    if (!rows) return;
    const range = sheet.getRange(2, tCol, rows, 1);
    let migrados = 0;
    const out = range.getValues().map((r, i) => {
      const raw = String(r[0]).trim();
      if (!raw) return [r[0]];
      const n = normalizeSize_(raw);
      if (!n) {
        report.sinReconocer.push('fila ' + (i + 2) + ': «' + raw + '»');
        return [r[0]];
      }
      if (n !== raw) migrados++;
      return [n];
    });
    range.setValues(out);
    report.migrados = migrados;
  });

  step('desplegable de Tamaño', () => {
    const rule = SpreadsheetApp.newDataValidation()
      .requireValueInList(TAMANOS, true)
      .setAllowInvalid(false)
      .setHelpText('Tamaño: ' + Object.keys(SCALE).map((k) => k + ' = ' + SCALE[k]).join(' · ') + ' puntos; TBD o Incluido (sin puntos).')
      .build();
    sheet.getRange(2, tCol, Math.max(sheet.getMaxRows() - 1, 1), 1).setDataValidation(rule);
  });

  step('columna Puntos', () => {
    let pCol = head.indexOf('Puntos') + 1;
    if (!pCol) {
      pCol = head.length + 1;
      sheet.getRange(1, pCol).setValue('Puntos').setFontWeight('bold');
    }
    report.columnaPuntos = colLetter_(pCol);
    if (rows) {
      const formulas = [];
      for (let r = 2; r <= rows + 1; r++) formulas.push([pointsFormula_(colLetter_(tCol) + r)]);
      sheet.getRange(2, pCol, rows, 1).setFormulas(formulas);
    }
  });

  Logger.log(JSON.stringify(report));
  return report;
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
