# Gestor de roadmap → Google Sheets → Dashboard

```
Equipo ──► web (GitHub Pages) ──► Apps Script (web app) ──► Google Sheets (pestaña "roadmap")
Cliente ─► cliente.html#c=..&k=.. ─┘  (solo lectura, filtrado por cliente)
```

Las claves viven solo en el Apps Script. La web es estática. La hoja se puede editar a mano y el dashboard lo refleja.

## 1. Google Sheets
Fuente de datos: https://docs.google.com/spreadsheets/d/1v0q3X8VufxXBY0qT4J8uUrp4L5yujzYtKhAnClPTCPE (pestaña **roadmap**).

Las columnas se leen por el nombre de la cabecera, en cualquier orden:

| Columna | Obligatoria | Valores |
|---|---|---|
| Iniciativa | sí | texto |
| Proyecto | sí | texto (Tienda online, Safer, App/AC…) |
| Área | sí | `Producto` o `Diseño` |
| Tamaño | sí | `small`, `medium`, `large`, `TBD`, `Incluido` |
| Estado | no | `Ongoing`, `Next`, `Pasada`. Si toda la columna está vacía, el dashboard oculta el filtro y el gráfico de estado |
| Cliente | no | Si no existe, todas las filas se consideran del único cliente |
| Nota, Creada | no | texto |

## 2. Apps Script (backend)
1. Ve a https://script.new, pega [apps-script/Code.gs](apps-script/Code.gs) y guarda. **Hazlo con una cuenta que tenga acceso de edición a la hoja.**
2. Engranaje **Configuración del proyecto** → *Propiedades de la secuencia de comandos* → añade:
   - `SHEET_ID` = `1v0q3X8VufxXBY0qT4J8uUrp4L5yujzYtKhAnClPTCPE`
   - `SHEET_NAME` = `roadmap`
   - `TEAM_KEY` = la clave que usará el equipo
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

## 4. Enlace para el cliente
```
https://ORG.github.io/REPO/cliente.html#c=Intermundial&k=clave-larga-aleatoria
```
El fragmento (`#`) no se envía a ningún servidor. Para revocar el acceso, cambia esa clave en `CLIENT_KEYS`. Botón «Imprimir / PDF» para guardar un informe.

## Modelo de datos
Iniciativa · Cliente · Proyecto · Área (Producto/Diseño) · Estado (Ongoing/Next/Pasada) · Tamaño (small/medium/large/TBD/Incluido) · Nota.
Esfuerzo: small = 1 pt, medium = 2, large = 3. `TBD` e `Incluido` («Todo lo pasado de Producto») no computan.
Con los datos actuales de la hoja: 36 tareas y 63 pts (el PDF daba 35 y 61: en la hoja «Reembolso automático» es `medium` en lugar de TBD).

## Local
```bash
npx serve web    # los módulos ES no funcionan con file://
```

## Notas
- Apps Script tarda ~1-2 s por petición; para un equipo pequeño es suficiente.
- Al editar la hoja a mano, respeta los valores de Área, Estado y Tamaño; el dashboard agrupa por el texto exacto.
- Si la hoja está compartida como «cualquiera con el enlace», su contenido es público aunque el dashboard pida clave. Compártela solo con personas concretas si el roadmap es confidencial.
