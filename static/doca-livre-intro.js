/**
 * Splash DOCA LIVRE — apenas na tela /entrada (hub de módulos).
 */
(function () {
    'use strict';

    var MIN_INTRO_MS = 2200;
    var FADE_MS = 650;
    var SESSION_KEY = 'dl-splash-done';
    var startRef = Date.now();
    var finished = false;

    function qs(id) { return document.getElementById(id); }

    function clearPending() {
        document.documentElement.classList.remove('dl-splash-pending');
    }

    function hideSplash(splash) {
        if (!splash) return;
        splash.classList.add('intro-splash--exit');
        document.body.classList.remove('dl-splash-active');
        clearPending();
        try { sessionStorage.setItem(SESSION_KEY, '1'); } catch (e) { /* ignore */ }
        setTimeout(function () {
            if (splash.parentNode) splash.parentNode.removeChild(splash);
        }, FADE_MS + 40);
    }

    function skipSplash() {
        clearPending();
        var splash = qs('doca-livre-splash');
        if (splash && splash.parentNode) splash.parentNode.removeChild(splash);
    }

    function runSplash() {
        var splash = qs('doca-livre-splash');
        if (!splash) {
            clearPending();
            return;
        }

        try {
            if (sessionStorage.getItem(SESSION_KEY)) {
                skipSplash();
                return;
            }
        } catch (e) { /* ignore */ }

        var bar = qs('dl-splash-bar-fill');
        var pctEl = qs('dl-splash-pct');
        var progress = splash.querySelector('.intro-progress-track');
        var progressVal = 0;

        document.body.classList.add('dl-splash-active');
        clearPending();
        startRef = Date.now();

        var tick = setInterval(function () {
            var elapsed = Date.now() - startRef;
            var minDone = elapsed >= MIN_INTRO_MS;

            if (minDone) {
                progressVal = Math.min(100, progressVal + 6);
            } else {
                progressVal = Math.min(88, progressVal + 1.2 + Math.random() * 2.5);
            }

            if (bar) bar.style.width = progressVal + '%';
            if (pctEl) pctEl.textContent = String(Math.round(progressVal));
            if (progress) progress.setAttribute('aria-valuenow', String(Math.round(progressVal)));

            if (!finished && minDone && progressVal >= 100) {
                finished = true;
                clearInterval(tick);
                setTimeout(function () { hideSplash(splash); }, 350);
            }
        }, 60);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', runSplash);
    } else {
        runSplash();
    }
})();
