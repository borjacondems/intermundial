import { API_URL } from './config.js';

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

export const teamKey = {
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

export const getTasks = () => call({ action: 'list', key: teamKey.get() });

export const createTask = (task) => call({ action: 'create', key: teamKey.get(), task });

export const getClientTasks = (client, key) => call({ action: 'client', client, key });
