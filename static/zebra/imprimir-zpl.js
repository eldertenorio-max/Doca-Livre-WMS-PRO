/**
 * Envia ZPL para Zebra via Browser Print (API local 9100/9101).
 * Nao depende do arquivo BrowserPrint.min.js externo.
 */
(function (global) {
  function bpBases() {
    if (window.location.protocol === 'https:') {
      return ['https://127.0.0.1:9101', 'https://localhost:9101'];
    }
    return ['http://127.0.0.1:9100', 'http://localhost:9100'];
  }

  function pickZebra(list) {
    list = list || [];
    for (var i = 0; i < list.length; i++) {
      var n = String((list[i] && list[i].name) || '').toUpperCase();
      if (n.indexOf('ZD220') >= 0 || n.indexOf('ZD230') >= 0 || n.indexOf('ZDESIGNER') >= 0 || n.indexOf('ZEBRA') >= 0) {
        return list[i];
      }
    }
    return list[0] || null;
  }

  function bpRequest(path, options) {
    options = options || {};
    var bases = bpBases();
    var lastErr = null;

    function tryBase(idx) {
      if (idx >= bases.length) {
        return Promise.reject(lastErr || new Error(
          'Browser Print nao respondeu. Verifique o icone Zebra na bandeja e aceite o certificado em https://localhost:9101/ssl_support'
        ));
      }
      var url = bases[idx] + path;
      return fetch(url, options).then(function (resp) {
        if (!resp.ok) {
          lastErr = new Error('Browser Print HTTP ' + resp.status + ' (' + url + ')');
          return tryBase(idx + 1);
        }
        return { resp: resp, base: bases[idx] };
      }).catch(function (err) {
        lastErr = err;
        return tryBase(idx + 1);
      });
    }

    return tryBase(0);
  }

  function getDefaultDevice() {
    return bpRequest('/default?type=printer').then(function (r) {
      return r.resp.json();
    });
  }

  function getAvailablePrinters() {
    return bpRequest('/available').then(function (r) {
      return r.resp.json();
    });
  }

  function resolveDevice() {
    return getDefaultDevice().then(function (dev) {
      if (dev && dev.name) return dev;
      return getAvailablePrinters().then(function (data) {
        var list = (data && data.printer) || [];
        var dev2 = pickZebra(list);
        if (!dev2) {
          throw new Error('Nenhuma Zebra em Default Devices. Abra Browser Print Settings e defina a ZD220.');
        }
        return dev2;
      });
    });
  }

  function sendZpl(zpl) {
    if (!zpl) return Promise.reject(new Error('ZPL vazio.'));
    var payload = (zpl || '').replace(/\r?\n/g, '\r\n');
    return resolveDevice().then(function (device) {
      return bpRequest('/write', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ device: device, data: payload })
      }).then(function (r) {
        return r.resp.text().then(function (txt) {
          try { return txt ? JSON.parse(txt) : {}; } catch (e) { return { ok: true, raw: txt }; }
        });
      });
    });
  }

  function loadBrowserPrint() {
    return resolveDevice().then(function () { return true; });
  }

  global.WmsZebraPrint = {
    loadBrowserPrint: loadBrowserPrint,
    sendZpl: sendZpl,
    getZebraDevice: resolveDevice
  };
})(window);
