/**
 * Etiquetas WMS: prévia HTML + impressão física via ZPL (Browser Print).
 * Chrome/GDI na ZD220 costuma falhar (luz amarela) — ZPL é o caminho confiável.
 */
(function (global) {
  function whenReady(fn) {
    if (document.readyState === 'complete') fn();
    else global.addEventListener('load', fn, { once: true });
  }

  function statusEl() {
    return document.getElementById('wms-print-status');
  }

  function setStatus(msg, ok) {
    var el = statusEl();
    if (!el) return;
    el.textContent = msg || '';
    if (ok === true) el.style.color = '#2e7d32';
    else if (ok === false) el.style.color = '#c62828';
    else el.style.color = '#1565c0';
  }

  function zplUrlFromBody() {
    var b = document.body;
    return b ? b.getAttribute('data-zpl-url') : null;
  }

  function injectPrintPageSize() {
    var b = document.body;
    if (!b) return;
    var sz = b.getAttribute('data-etq-page');
    if (!sz) return;
    var el = document.getElementById('wms-dynamic-page');
    if (!el) {
      el = document.createElement('style');
      el.id = 'wms-dynamic-page';
      document.head.appendChild(el);
    }
    el.textContent =
      '@media print { @page { size: ' + sz + '; margin: 0; } }';
  }

  function imprimirChrome(preparar) {
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
  }

  function carregarZpl(url) {
    return fetch(url, { credentials: 'same-origin' }).then(function (resp) {
      if (!resp.ok) {
        return resp.json().catch(function () { return {}; }).then(function (err) {
          throw new Error((err && err.erro) || ('Erro ZPL ' + resp.status));
        });
      }
      return resp.text();
    });
  }

  function enviarZpl(zpl) {
    if (!global.WmsZebraPrint || !global.WmsZebraPrint.sendZpl) {
      return Promise.reject(new Error(
        'Zebra Browser Print nao carregado. Instale Browser Print e defina a ZD220.'
      ));
    }
    return global.WmsZebraPrint.sendZpl(zpl);
  }

  function imprimirZpl(url, preparar) {
    setStatus('Gerando ZPL…');
    return carregarZpl(url).then(function (zpl) {
      if (typeof preparar === 'function') {
        try { preparar(); } catch (e) { console.warn(e); }
      }
      setStatus('Enviando para Zebra…');
      return enviarZpl(zpl);
    }).then(function () {
      setStatus('Enviado — confira a etiqueta na impressora.', true);
    });
  }

  function imprimir(preparar) {
    whenReady(function () {
      var url = zplUrlFromBody();
      if (url) {
        imprimirZpl(url, preparar).catch(function (err) {
          var msg = (err && err.message) || String(err);
          if (msg.indexOf('9101') >= 0 || msg.indexOf('9100') >= 0 || msg.indexOf('Browser Print') >= 0) {
            msg += ' — Aceite o certificado em https://localhost:9101/ssl_support';
          }
          setStatus('ZPL: ' + msg, false);
        });
        return;
      }
      setStatus('Sem URL ZPL — usando Chrome (pode falhar na ZD220).', false);
      imprimirChrome(preparar);
    });
  }

  global.wmsEtiquetaImprimir = imprimir;
  global.addEventListener('beforeprint', injectPrintPageSize);
})(window);
