# Gestor de roadmap → Google Sheets → Dashboard

```
Usuario A (añade iniciativas) ─► index.html  ─────────────► Apps Script (web app) ─► Google Sheets (pestaña "roadmap")
Usuario B (consulta) ──────────► dashboard.html#c=..&k=.. ─┘  (solo lectura)
```

Las claves viven solo en el Apps Script. La web es estática. La hoja se puede editar a mano y el dashboard lo refleja.

## 1. Google Sheets
Fuente de datos: https://docs.google.com/spreadsheets/d/1v0q3X8VufxXBY0qT4J8uUrp4L5yujzYtKhAnClPTCPE (pestaña **roadmap**).

Las columnas se leen por el nombre de la cabecera, en cualquier orden:

| Columna | Obligatoria | Valores |
|---|---|---|
| Iniciativa | sí | texto |
| Proyecto | sí | texto libre en la hoja. El formulario ofrece una lista fija (`PROYECTOS` en `web/index.html`: Tienda online, Safer, App/AC); para añadir un proyecto, añádelo a esa lista |
| Área | sí | `Producto` o `Diseño` |
| Tamaño | sí | `small`, `medium`, `large`, `TBD`, `Incluido` |
| Estado | no | `En curso`, `Hecho`, `Bloqueado`. Si toda la columna está vacía, el dashboard oculta el filtro y el gráfico de estado |
| Cliente | no | Si no existe, todas las filas se consideran del único cliente |
| Nota, Creada | no | texto |

## 2. Apps Script (backend)
1. Ve a https://script.new, pega [apps-script/Code.gs](apps-script/Code.gs) y guarda. **Hazlo con una cuenta que tenga acceso de edición a la hoja.**
2. Engranaje **Configuración del proyecto** → *Propiedades de la secuencia de comandos* → añade:
   - `SHEET_ID` = `1v0q3X8VufxXBY0qT4J8uUrp4L5yujzYtKhAnClPTCPE`
   - `SHEET_NAME` = `roadmap`
   - `TEAM_KEY` = la clave que usará el equipo
   - `ADMIN_KEY` = clave de administrador (vale en las dos páginas; ver más abajo)
   - `CLIENT_KEYS` = `{"Intermundial":"clave-larga-aleatoria"}`
3. Implementar → **Nueva implementación** → tipo *Aplicación web*:
   - Ejecutar como: **Yo**
   - Quién tiene acceso: **Cualquier usuario**
4. Autoriza los permisos (acceso a hojas de cálculo) y copia la URL que termina en `/exec`.

Si cambias `Code.gs` más adelante: Implementar → Gestionar implementaciones → editar → *Nueva versión*. La URL no cambia.

## 3. Web (GitHub Pages)
1. Pega la URL `/exec` en `web/js/config.js`.
2. Sube el repo a GitHub, Settings → Pages → Source: **GitHub Actions**. Cada push a `main` que toque `web/` se despliega.
3. Equipo: `https://ORG.github.io/REPO/` (introducen la clave de equipo una vez).

## 4. Acceso de cada usuario
Son dos páginas independientes, cada una con su propia credencial y sin enlaces entre ellas:

| Usuario | Página | Credencial |
|---|---|---|
| Añade iniciativas | `index.html` | `TEAM_KEY` (la teclea una vez; queda guardada en su navegador). Tiene dos pestañas: **Iniciativas** (tabla con todas las filas de la hoja) y **Nueva iniciativa** (formulario) |
| Consulta el dashboard | `dashboard.html` | clave de `CLIENT_KEYS`, dentro del enlace |
| Administrador | las dos | `ADMIN_KEY`: se teclea en el campo de clave de cualquiera de las dos páginas |

`ADMIN_KEY` permite añadir iniciativas y ver el dashboard de cualquier cliente (o de todos a la vez). Las claves de equipo y de cliente no la sustituyen: la de equipo no abre el dashboard y la de cliente solo abre el suyo.
Enlace del dashboard:
```
https://ORG.github.io/REPO/dashboard.html#c=Intermundial&k=clave-larga-aleatoria
```
Tras abrirlo una vez con el enlace, el navegador recuerda el acceso y `dashboard.html` funciona también sin el `#…`. Si la clave deja de valer, el acceso guardado se borra y hay que usar el enlace nuevo. El fragmento (`#`) no se envía a ningún servidor. Para revocar el acceso, cambia esa clave en `CLIENT_KEYS`. Botón «Imprimir / PDF» para guardar un informe.

## Modelo de datos
Iniciativa · Cliente · Proyecto · Área (Producto/Diseño) · Estado (En curso/Hecho/Bloqueado) · Tamaño (small/medium/large/TBD/Incluido) · Nota.
Esfuerzo: small = 1 pt, medium = 2, large = 3. `TBD` e `Incluido` («Todo lo pasado de Producto») no computan.
Con los datos actuales de la hoja: 36 tareas y 63 pts (el PDF daba 35 y 61: en la hoja «Reembolso automático» es `medium` en lugar de TBD).

## Ver el dashboard sin desplegar
Mientras `web/js/config.js` tenga el marcador `TU_ID_DE_DESPLIEGUE`, las páginas leen la hoja directamente en modo **solo lectura** (requiere servirlas con `npx serve web`: Chrome no permite esa lectura desde `file://`). Guardar iniciativas y las claves solo funcionan con el Apps Script desplegado.

## Rendimiento
Apps Script tarda de 3 a 10 s por petición (con picos mayores), así que las páginas no esperan a que responda si ya han cargado datos antes:
- **Dashboard:** guarda una copia en el navegador. Las visitas siguientes se pintan al instante y se refrescan en segundo plano (verás «Actualizando…» y luego la hora de los datos). Si el servidor falla, se sigue viendo la copia con un aviso.
- **Tabla de iniciativas (`index.html`):** se lee directamente de la hoja de Google en CSV (~0,5 s, sin pasar por Apps Script). Requiere que la hoja esté compartida con «cualquiera con el enlace»; si no lo está o no responde, se usa el Apps Script como respaldo. Guardar sigue yendo por Apps Script; la fila nueva aparece en la tabla al instante y se confirma al releer la hoja. La clave de equipo se comprueba al introducirla y al guardar, no en cada carga.
- Las lecturas tienen un tiempo máximo de 20 s y se reintentan una vez. Guardar nunca se reintenta, para no duplicar una iniciativa.

## Notas
- Apps Script tarda ~1-2 s por petición; para un equipo pequeño es suficiente.
- Al editar la hoja a mano, respeta los valores de Área, Estado y Tamaño; el dashboard agrupa por el texto exacto.
- Si la hoja está compartida como «cualquiera con el enlace», su contenido es público aunque el dashboard pida clave. Compártela solo con personas concretas si el roadmap es confidencial.
