/**
 * Impressão HTML de etiquetas WMS — só abre o diálogo após clique do usuário.
 */
(function (global) {
  function whenReady(fn) {
    if (document.readyState === 'complete') fn();
    else global.addEventListener('load', fn, { once: true });
  }

  function imprimir(preparar) {
    whenReady(function () {
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
})(window);
