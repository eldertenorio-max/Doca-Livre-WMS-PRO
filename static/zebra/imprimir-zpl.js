/**
 * Envia ZPL para Zebra via Browser Print (impressão direta, 60×40 mm sem Chrome).
 * Requer Zebra Browser Print instalado no Windows.
 */
(function (global) {
  var BP_URLS = [
    '/static/zebra/BrowserPrint-3.1.250.min.js',
    'https://www.zebra.com/content/dam/zebra/software/en/utility/browser-print/browser-print-3.1.250.min.js'
  ];
  var loadPromise = null;

  function loadBrowserPrint() {
    if (typeof BrowserPrint !== 'undefined') {
      return Promise.resolve();
    }
    if (loadPromise) {
      return loadPromise;
    }
    loadPromise = new Promise(function (resolve, reject) {
      var idx = 0;
      function next() {
        if (typeof BrowserPrint !== 'undefined') {
          resolve();
          return;
        }
        if (idx >= BP_URLS.length) {
          reject(new Error('Zebra Browser Print não encontrado. Instale o utilitário Zebra no PC.'));
          return;
        }
        var src = BP_URLS[idx++];
        var s = document.createElement('script');
        s.src = src;
        s.async = true;
        s.onload = function () {
          if (typeof BrowserPrint !== 'undefined') resolve();
          else next();
        };
        s.onerror = next;
        document.head.appendChild(s);
      }
      next();
    });
    return loadPromise;
  }

  function pickZebraDevice(list) {
    list = list || [];
    for (var i = 0; i < list.length; i++) {
      var n = String(list[i].name || '').toUpperCase();
      if (n.indexOf('ZD220') >= 0 || n.indexOf('ZD230') >= 0 || n.indexOf('ZDESIGNER') >= 0 || n.indexOf('ZEBRA') >= 0) {
        return list[i];
      }
    }
    return list[0] || null;
  }

  function sendToDevice(device, zpl) {
    return new Promise(function (resolve, reject) {
      if (!device || !device.send) {
        reject(new Error('Impressora Zebra não disponível.'));
        return;
      }
      device.send(zpl, resolve, function (err) {
        reject(err || new Error('Falha ao enviar ZPL.'));
      });
    });
  }

  function getZebraDevice() {
    return loadBrowserPrint().then(function () {
      return new Promise(function (resolve, reject) {
        BrowserPrint.getDefaultDevice('printer', function (device) {
          if (device) {
            resolve(device);
            return;
          }
          BrowserPrint.getLocalDevices(function (list) {
            var dev = pickZebraDevice(list);
            if (dev) resolve(dev);
            else reject(new Error('Nenhuma impressora Zebra encontrada. Verifique USB e driver ZD220.'));
          }, reject, 'printer');
        }, reject);
      });
    });
  }

  function sendZpl(zpl) {
    return getZebraDevice().then(function (device) {
      return sendToDevice(device, zpl);
    });
  }

  global.WmsZebraPrint = {
    loadBrowserPrint: loadBrowserPrint,
    getZebraDevice: getZebraDevice,
    sendZpl: sendZpl
  };
})(window);
