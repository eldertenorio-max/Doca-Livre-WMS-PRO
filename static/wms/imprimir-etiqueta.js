/**
 * Impressão HTML etiquetas WMS — força @page em polegadas (driver Zebra no Windows).
 */
(function (global) {
  function whenReady(fn) {
    if (document.readyState === 'complete') fn();
    else global.addEventListener('load', fn, { once: true });
  }

  function pageSizeFromBody() {
    var b = document.body;
    if (!b) return null;
    return b.getAttribute('data-etq-page') || null;
  }

  function injectPrintPageSize() {
    var sz = pageSizeFromBody();
    if (!sz) return;
    var el = document.getElementById('wms-dynamic-page');
    if (!el) {
      el = document.createElement('style');
      el.id = 'wms-dynamic-page';
      document.head.appendChild(el);
    }
    el.textContent =
      '@media print { @page { size: ' + sz + '; margin: 0; } ' +
      'html, body { width: ' + sz.split(' ')[0] + ' !important; margin: 0 !important; padding: 0 !important; } }';
  }

  function imprimir(preparar) {
    whenReady(function () {
      injectPrintPageSize();
      if (typeof preparar === 'function') {
        try { preparar(); } catch (e) { console.warn(e); }
      }
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          try { global.focus(); } catch (e) { /* pop-up */ }
          global.print();
        });
      });
    });
  }

  global.wmsEtiquetaImprimir = imprimir;
  global.addEventListener('beforeprint', injectPrintPageSize);
})(window);
