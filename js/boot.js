// Se ejecuta de forma síncrona en <head>: aplica el último tema guardado antes del primer pintado
// para evitar el parpadeo mientras IndexedDB responde.
(function () {
  try {
    var c = JSON.parse(localStorage.getItem('startboard:theme-cache') || 'null');
    if (!c) return;
    var r = document.documentElement;
    for (var k in c.vars) r.style.setProperty(k, c.vars[k]);
    r.dataset.secStyle = c.secStyle || 'solid';
  } catch (e) { /* sin caché */ }
})();
