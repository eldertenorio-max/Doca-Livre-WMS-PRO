/**
 * WMS DOCA LIVRE PRO — relógio no topbar + marca d'água nos módulos
 */
(function () {
    'use strict';

    function pad(n) { return n < 10 ? '0' + n : String(n); }

    function tickClock() {
        var d = new Date();
        var timeEl = document.getElementById('dl-clock-time');
        var dateEl = document.getElementById('dl-clock-date');
        if (timeEl) {
            timeEl.textContent = pad(d.getHours()) + ':' + pad(d.getMinutes());
        }
        if (dateEl) {
            dateEl.textContent = pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear();
        }
    }

    function injectWatermarks() {
        document.querySelectorAll('.modulo-main').forEach(function (main) {
            if (main.querySelector('.modulo-welcome-watermark')) return;
            var wm = document.createElement('div');
            wm.className = 'modulo-welcome-watermark';
            wm.setAttribute('aria-hidden', 'true');
            wm.innerHTML =
                '<div class="modulo-welcome-watermark-inner">' +
                '<div class="modulo-welcome-logo">' +
                '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 280 72" class="dl-logo dl-logo--watermark">' +
                '<g><rect x="4" y="10" width="52" height="52" rx="3" fill="none" stroke="#000" stroke-width="2.5"/>' +
                '<path d="M14 36 L26 36 L22 30 L26 36 L22 42 Z" fill="#F9DB00"/>' +
                '<path d="M46 36 L34 36 L38 30 L34 36 L38 42 Z" fill="#F9DB00"/></g>' +
                '<text x="68" y="44" font-family="Segoe UI,Arial,sans-serif" font-size="26" font-weight="800" fill="#F9DB00">DOCA</text>' +
                '<text x="68" y="66" font-family="Segoe UI,Arial,sans-serif" font-size="18" font-weight="700" fill="#000" letter-spacing="5">LIVRE</text></svg>' +
                '</div>' +
                '<p class="modulo-welcome-text">WMS DOCA LIVRE PRO</p>' +
                '</div>';
            main.insertBefore(wm, main.firstChild);
        });
    }

    function boot() {
        tickClock();
        setInterval(tickClock, 30000);
        injectWatermarks();
        if (typeof initModuloSidebars === 'function') {
            /* sidebars já init em script.js; watermark após layout pronto */
        }
        setTimeout(injectWatermarks, 400);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }

    var obs = new MutationObserver(function () { injectWatermarks(); });
    obs.observe(document.body, { childList: true, subtree: true });
})();
