#!/bin/sh
# Descarga la hoja (debe estar compartida con «cualquiera con el enlace») y guarda una copia en web/js/snapshot.js.
# Se usa solo cuando el dashboard no puede leer la hoja en vivo (p. ej. abriendo el HTML con doble clic).
cd "$(dirname "$0")/.." || exit 1
URL=$(sed -n "s/.*'\(https:\/\/docs.google.com[^']*\)'.*/\1/p" web/js/config.js | head -1)
curl -fsSL "$URL" -o /tmp/roadmap-sheet.csv || { echo "No se pudo descargar la hoja"; exit 1; }
python3 - <<'PY'
import csv, json, datetime
rows = list(csv.DictReader(open('/tmp/roadmap-sheet.csv', encoding='utf-8')))
g = lambda r, k: (r.get(k) or '').strip()
tasks = [dict(id=str(i + 2), iniciativa=g(r, 'Iniciativa'), cliente=g(r, 'Cliente'), proyecto=g(r, 'Proyecto'),
              area=g(r, 'Área'), estado=g(r, 'Estado'), tamano=g(r, 'Tamaño'), nota=g(r, 'Nota'))
         for i, r in enumerate(rows) if g(r, 'Iniciativa')]
stamp = datetime.date.today().isoformat()
open('web/js/snapshot.js', 'w', encoding='utf-8').write(
    '// Copia de la hoja generada por scripts/update-snapshot.sh. No editar a mano.\n'
    'const SNAPSHOT = ' + json.dumps({'fecha': stamp, 'tasks': tasks}, ensure_ascii=False, indent=1) + ';\n')
print(len(tasks), 'iniciativas guardadas en web/js/snapshot.js')
PY
