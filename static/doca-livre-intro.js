/**
 * Splash WMS DOCA LIVRE PRO — tela de módulos (/painel)
 */
(function () {
    'use strict';

    var LOAD_MS = 2800;
    var FADE_MS = 450;

    function qs(id) { return document.getElementById(id); }

    function clearPending() {
        document.documentElement.classList.remove('dl-splash-pending');
    }

    function hideSplash(splash) {
        if (!splash) return;
        splash.classList.add('dl-splash--out');
        document.body.classList.remove('dl-splash-active');
        clearPending();
        setTimeout(function () {
            if (splash.parentNode) splash.parentNode.removeChild(splash);
        }, FADE_MS + 60);
    }

    function runSplash() {
        var splash = qs('doca-livre-splash');
        if (!splash) {
            clearPending();
            return;
        }

        var bar = qs('dl-splash-bar-fill');
        var pctEl = qs('dl-splash-pct');
        var progress = splash.querySelector('.dl-splash-bar');
        document.body.classList.add('dl-splash-active');
        clearPending();

        var start = Date.now();
        var tick = setInterval(function () {
            var pct = Math.min(100, Math.round(((Date.now() - start) / LOAD_MS) * 100));
            if (bar) bar.style.width = pct + '%';
            if (pctEl) pctEl.textContent = String(pct);
            if (progress) progress.setAttribute('aria-valuenow', String(pct));
            if (pct >= 100) clearInterval(tick);
        }, 40);

        setTimeout(function () {
            clearInterval(tick);
            hideSplash(splash);
        }, LOAD_MS);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', runSplash);
    } else {
        runSplash();
    }
})();
