# Startboard

Extensión de navegador (Manifest V3) que sustituye la página de nueva pestaña por una start page personalizable.
Sin paso de build: HTML + ES modules + [Dexie](https://dexie.org) incluido en `lib/`.

## Instalar (Chrome / Edge / Brave)

1. Abre `chrome://extensions` y activa **Modo de desarrollador**.
2. **Cargar descomprimida** → selecciona esta carpeta.
3. Abre una pestaña nueva. Para editar: botón **⚙ Administrar** o el icono de la extensión.

## Qué incluye

| Pieza | Descripción |
|---|---|
| Start page (`newtab.html`) | **Varias páginas** con pestañas, secciones plegables, filtro instantáneo (busca en todas las páginas), atajos de búsqueda (`g texto`, `yt texto`…), selector rápido de tema / disposición / tamaño. |
| Administración (`admin.html`) | Edición visual sobre el propio tablero: arrastrar secciones y enlaces (también entre secciones), diálogos de edición, iconos por favicon / emoji / URL / imagen subida. |
| Motor de temas (`js/themes.js`) | Tema = tokens → variables CSS. 9 temas integrados, editor con vista previa en vivo, efecto cristal, fondo con imagen o degradado, CSS propio. Modo **seguir al sistema** (un tema para claro y otro para oscuro). |
| Datos (`js/db.js`, `js/io.js`) | IndexedDB con Dexie. Exportar/importar JSON (combinar o reemplazar), importar marcadores HTML, copias automáticas antes de cada importación. |

## Atajos (start page)

| Tecla | Acción |
|---|---|
| Escribir cualquier letra o `/` | Enfoca el buscador |
| `↓` / `↑` | Mueve la selección entre los resultados (cíclico) |
| `Enter` / `Ctrl+Enter` | Abre el resaltado (o el atajo `g texto`) en la pestaña / en una nueva |
| `Esc` | Limpia el filtro |
| `Alt+1`…`Alt+9` | Cambia de página |

En el panel de administración, borrar un enlace, sección o página muestra un aviso con **Deshacer**.

## Estructura

```
manifest.json      background.js
newtab.html        admin.html
css/  base.css (tablero + temas)  newtab.css  admin.css
js/   db.js  themes.js  io.js  render.js  newtab.js  admin.js  boot.js
lib/  dexie.mjs (Dexie 4.x, Apache-2.0)
```

`render.js` lo comparten la start page y el panel: lo que ves al editar es lo que verás en la nueva pestaña.
`boot.js` aplica el último tema desde `localStorage` antes del primer pintado para evitar parpadeos.

## Modelo de datos (Dexie, versión 2)

```
settings : key                      -- un documento { key: 'main', title, themeId, themeMode, activePageId, … }
pages    : ++id, order              -- { title, icon, order }
sections : ++id, order, pageId      -- { pageId, title, icon, color, span(1-3), layout(grid|list), collapsed, order }
items    : ++id, sectionId, order   -- { title, url, description, iconType, icon, tags, target, sectionId, order }
themes   : id                       -- solo temas personalizados
backups  : ++id, createdAt          -- { label, data: <export completo> }
```

La v1→v2 se migra automáticamente: las secciones existentes pasan a una página «Principal». Para cambios futuros añade
`db.version(3).stores({...}).upgrade(tx => …)` en `js/db.js`.

## Formato de exportación

```json
{ "format": "startboard", "version": 2, "exportedAt": "…",
  "settings": { … }, "pages": [ … ], "sections": [ … ], "items": [ … ], "themes": [ … ] }
```

Cada bloque es opcional. Los archivos de la v1 (sin `pages`) se siguen leyendo: sus secciones van a una página nueva. Al importar, todo se valida y sanea (URLs `javascript:`/`data:` descartadas, colores y rangos
acotados, `@import` eliminado del CSS) y los ids se reasignan.

## Notas

- **Favicons**: en Chrome/Edge se usa la API local `_favicon` (permiso `favicon`), sin enviar dominios a terceros.
  En el panel puedes cambiar a DuckDuckGo, Google o solo letras.
- **Enlaces `chrome://` y `file://`** se abren mediante `chrome.tabs` porque un `<a>` no puede navegar a ellos desde una página de extensión.
- **Firefox**: el código es compatible en lo esencial, pero hay que adaptar el manifest (`background.scripts`,
  `browser_specific_settings.gecko.id`) y no existe la API `_favicon` (se usa DuckDuckGo automáticamente).
- Los datos viven en el perfil del navegador y **no se sincronizan** entre equipos: usa Exportar/Importar.
